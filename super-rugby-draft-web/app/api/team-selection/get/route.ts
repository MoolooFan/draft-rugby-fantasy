import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam } from "@/lib/league/serverAuth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    const week = Number(searchParams.get("week") ?? 0);

    if (!leagueId || !week) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }

    // ✅ ensure requester is in the league at least
    await requireLeagueTeam(leagueId);

    const { data, error } = await supabaseAdmin
      .from("team_selections")
      .select("team_id, lineup, captain_id, vice_id, week, updated_at")
      .eq("league_id", leagueId)
      .eq("week", week);

    if (error) throw error;

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}