// app/api/fixtures/week-status/route.ts
// The dashboard's games box (Ethan, 20 Nov 2026): a fantasy week's Super Rugby games and where
// each one's points stand (lib/stats/gameStatus.ts), and whether the league's results for the
// week have gone into the standings. GET ?week=N[&leagueId=...]
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { currentSeasonYear, fixturesForWeek, getSeason, kickoffMs, weekFinaliseAtMs, weekLabel } from "@/lib/season";
import { teamCodeFromName } from "@/lib/status/articles";
import { gameStatus } from "@/lib/stats/gameStatus";
import { finalisedFixtureIds } from "@/lib/stats/gameRuns";

export const dynamic = "force-dynamic";

/** Old weeks from before games were recorded one by one count as finalised once the week was. */
const HISTORY_GRACE_MS = 3600_000;

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const week = Number(sp.get("week"));
    const leagueId = String(sp.get("leagueId") ?? "").trim();
    if (!Number.isInteger(week) || week < 1) return NextResponse.json({ ok: false, error: "Pick a week" }, { status: 400 });
    if (leagueId) await requireLeagueTeam(leagueId);

    const seasonYear = currentSeasonYear();
    const season = getSeason(seasonYear);
    const now = Date.now();
    const done = await finalisedFixtureIds(supabaseAdmin, seasonYear).catch(() => new Set<string>());
    const weekDone = weekFinaliseAtMs(season, week);
    const old = weekDone != null && now >= weekDone + HISTORY_GRACE_MS;

    const games = fixturesForWeek(season, week).map((f) => ({
      id: f.id,
      realRound: Number(f.week),
      home: f.homeTeam,
      away: f.awayTeam,
      homeCode: teamCodeFromName(f.homeTeam),
      awayCode: teamCodeFromName(f.awayTeam),
      kickoffAt: f.kickoffAt,
      status: gameStatus(kickoffMs(f), now, done.has(f.id) || old),
    }));

    // the league's results for the week are in the standings once every game ending that week is final
    let tableUpdated = false;
    if (leagueId) {
      const { data: rows, error } = await supabaseAdmin.from("league_matchups").select("weeks, status").eq("league_id", leagueId);
      if (error) throw error;
      const ending = (rows ?? []).filter((m) => Math.max(0, ...((m.weeks ?? []) as number[]).map(Number)) === week);
      tableUpdated = ending.length > 0 && ending.every((m) => m.status === "final");
    }

    return NextResponse.json({ ok: true, week, label: weekLabel(season, week), games, tableUpdated });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
