import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();
  const orderedTeamIds = Array.isArray(body?.orderedTeamIds)
    ? body.orderedTeamIds.map((x: any) => String(x).trim()).filter(Boolean)
    : [];

  if (!leagueId || orderedTeamIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Missing leagueId or orderedTeamIds" },
      { status: 400 }
    );
  }

  // ✅ must be league creator (recommended)
  const { data: leagueRow, error: leagueErr } = await supabaseAdmin
    .from("leagues")
    .select("created_by")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueErr) return NextResponse.json({ ok: false, error: leagueErr.message }, { status: 500 });
  if (!leagueRow) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });

  if (norm(leagueRow.created_by) !== username) {
    return NextResponse.json(
      { ok: false, error: "Only league creator can set draft order" },
      { status: 403 }
    );
  }

  // ✅ persist order on league
  const { error: updErr } = await supabaseAdmin
    .from("leagues")
    .update({ draft_order: orderedTeamIds })
    .eq("id", leagueId);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}