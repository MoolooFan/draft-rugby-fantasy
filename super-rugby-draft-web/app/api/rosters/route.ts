import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { normalizeLeagueId } from "@/lib/ids";

const norm = (s: string) => s.trim().toLowerCase();

function derivePlayerIdsFromRosterData(data: any): string[] {
  const ids: string[] = [];

  // legacy shape
  if (Array.isArray(data?.playerIds)) {
    for (const x of data.playerIds) {
      const s = String(x ?? "").trim();
      if (s) ids.push(s);
    }
  }

  // canonical shape
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

  // unique preserve order
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
  const derived = derivePlayerIdsFromRosterData(d);

  // if playerIds missing or wrong length, overwrite in response
  return {
    ...row,
    data: { ...d, playerIds: derived },
  };
});

return NextResponse.json({ ok: true, data: fixed });

}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const leagueId = normalizeLeagueId(body?.leagueId);
  const teamId = String(body?.teamId ?? "").trim();
  const data = body?.data;

  if (!leagueId || !teamId || data == null) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/teamId/data" }, { status: 400 });
  }

  const username = await getServerUsername();
  if (!username) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const usernameNorm = norm(username);

  // Ensure team exists + requester owns it
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, league_id, owner_username")
    .eq("id", teamId)
    .maybeSingle();

  if (teamErr) {
    return NextResponse.json({ ok: false, error: teamErr.message }, { status: 500 });
  }
  if (!team) {
    return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
  }

  if (String(team.league_id) !== leagueId) {
    return NextResponse.json({ ok: false, error: "Team not in league" }, { status: 400 });
  }

  const owner = norm(String(team.owner_username ?? ""));
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Team has no owner_username" }, { status: 500 });
  }
  if (owner !== usernameNorm) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const playerIds = derivePlayerIdsFromRosterData(data);
const dataToSave = { ...(data ?? {}), playerIds };

  const { error } = await supabaseAdmin
  .from("rosters")
  .upsert(
    {
      league_id: leagueId,
      team_id: teamId,
      data: dataToSave, // ✅
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id,team_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}