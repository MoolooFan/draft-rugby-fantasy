import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();
  const teamIds = Array.isArray(body?.teamIds) ? body.teamIds.map((x: any) => String(x).trim()).filter(Boolean) : [];

  if (!leagueId || teamIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/teamIds" }, { status: 400 });
  }

  // only creator can set order
  const { data: league, error: leagueErr } = await supabaseAdmin
    .from("leagues")
    .select("created_by")
    .eq("id", leagueId)
    .maybeSingle();

  if (leagueErr) return NextResponse.json({ ok: false, error: leagueErr.message }, { status: 500 });
  if (!league) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
  if (norm(league.created_by) !== username) {
    return NextResponse.json({ ok: false, error: "Only league creator can set draft order" }, { status: 403 });
  }

  const { error: upErr } = await supabaseAdmin
    .from("draft_state")
    .upsert(
      {
        league_id: leagueId,
        draft_order_team_ids: teamIds,
        is_draft_order_set: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id" }
    );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}