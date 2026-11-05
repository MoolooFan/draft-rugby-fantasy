import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { normalizeLeagueId } from "@/lib/ids";

const norm = (s: string) => s.trim().toLowerCase();

function derivePlayerIdsFromRosterData(data: any): string[] {
  // ✅ Canonical: if playerIds exists, trust it (waivers/free agency updates this)
  if (Array.isArray(data?.playerIds)) {
    const seen = new Set<string>();
    return data.playerIds
      .map((x: any) => String(x ?? "").trim())
      .filter((id: string) => id.length > 0)
      .filter((id: string) => (seen.has(id) ? false : (seen.add(id), true)));
  }

  // Legacy fallback: derive from slots + wildcards only if playerIds is missing
  const ids: string[] = [];

  const slots = data?.slots;
  if (slots && typeof slots === "object") {
    for (const arr of Object.values(slots)) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr as any[]) {
        const id = String((p as any)?.id ?? "").trim();
        if (id) ids.push(id);
      }
    }
  }

  const wild = data?.wildcards;
  if (Array.isArray(wild)) {
    for (const p of wild as any[]) {
      const id = String((p as any)?.id ?? "").trim();
      if (id) ids.push(id);
    }
  }

  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = normalizeLeagueId(searchParams.get("leagueId"));

  if (!leagueId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
  }

  const username = await getServerUsername();
  if (!username) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const usernameNorm = norm(username);

  const { data: membership, error: memErr } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_username", usernameNorm)
    .maybeSingle();

  if (memErr) {
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ ok: false, error: "Forbidden (not in league)" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("rosters")
    .select("league_id, team_id, data, updated_at")
    .eq("league_id", leagueId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const fixed = (data ?? []).map((row) => {
  const d = row.data ?? {};

  const existing = Array.isArray((d as any).playerIds)
    ? (d as any).playerIds.map((x: any) => String(x ?? "").trim()).filter(Boolean)
    : [];

  // Canonical: prefer playerIds (waivers/free agency update this)
  const playerIds = existing.length ? existing : derivePlayerIdsFromRosterData(d);

  // IMPORTANT:
  // slots/wildcards often contain stale embedded player objects.
  // Clearing them forces the frontend to rely on playerIds (truth).
  return {
    ...row,
    data: {
      ...d,
      playerIds,
      slots: {},       // ✅ prevent stale squad from being shown
      wildcards: [],   // ✅ prevent stale squad from being shown
    },
  };
});

return NextResponse.json({ ok: true, data: fixed });

}

// Rosters are only ever changed by the server (the draft, free agency, waivers and trades),
// so a browser can't save a made-up roster for its team.
export async function POST() {
  return NextResponse.json({ ok: false, error: "Rosters are updated by the server" }, { status: 405 });
}
