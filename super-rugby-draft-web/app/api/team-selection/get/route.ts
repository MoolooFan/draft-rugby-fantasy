import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam } from "@/lib/league/serverAuth";

// Every team's lineup for a week. A team that hasn't saved one for the week gets its most
// recent earlier one (carried over, marked carriedFrom) - that's the lineup that will lock.
// Also each player's pick number in this league's draft (for the captain / vice rules).
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

    const [sel, picks] = await Promise.all([
      supabaseAdmin
        .from("team_selections")
        .select("team_id, lineup, captain_id, vice_id, week, updated_at")
        .eq("league_id", leagueId)
        .lte("week", week)
        .order("week", { ascending: false }),
      supabaseAdmin.from("draft_picks").select("player_id, pick_number").eq("league_id", leagueId),
    ]);
    if (sel.error) throw sel.error;
    if (picks.error) throw picks.error;

    const latestByTeam = new Map<string, Record<string, unknown>>();
    for (const r of sel.data ?? []) {
      if (latestByTeam.has(r.team_id)) continue; // rows come newest week first
      latestByTeam.set(r.team_id, r.week === week ? r : { ...r, week, carriedFrom: r.week });
    }
    const pickNumbers: Record<string, number> = {};
    for (const p of picks.data ?? []) pickNumbers[String(p.player_id)] = Number(p.pick_number);

    return NextResponse.json({ ok: true, rows: [...latestByTeam.values()], pickNumbers });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
