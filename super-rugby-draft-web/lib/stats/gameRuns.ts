// lib/stats/gameRuns.ts
// Player stats, game by game (Ethan, 20 Nov 2026). Each Super Rugby game's players are pulled
// from playfantasyrugby every few minutes while it's on, hourly after, and once more about 13.5
// hours after kickoff. That last run is recorded in fixture_stats_final, and from then on the
// game's points don't change ("Finalised" on the dashboard; lib/stats/gameStatus.ts).
// Before a fantasy week is finalised, any of its games still waiting get their last run first.
// Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSeason, kickoffMs, type SeasonFixture } from "@/lib/season";
import { teamCodeFromName } from "@/lib/status/articles";
import { syncExternalStats } from "@/lib/players/syncStats";
import { gameSyncDue } from "@/lib/stats/gameStatus";

/** A finalised game is only recorded if no more than this many of its players failed to load. */
const MAX_FAILED_PLAYERS = 2;
const LOOK_BACK_MS = 4 * 24 * 3600_000;

export type GameRunReport = { synced: Array<{ fixtureId: string; why: string }>; finalised: string[]; rows: number; failed: number };

export async function finalisedFixtureIds(db: SupabaseClient, season: number): Promise<Set<string>> {
  const { data, error } = await db.from("fixture_stats_final").select("fixture_id").eq("season", season);
  if (error) throw error;
  return new Set((data ?? []).map((r) => String(r.fixture_id)));
}

const teamsOf = (f: SeasonFixture) => [teamCodeFromName(f.homeTeam), teamCodeFromName(f.awayTeam)].filter((t): t is string => !!t);

/** Pull the stats for some games (grouped by round), and record the ones having their last run. */
async function syncGames(db: SupabaseClient, season: number, games: Array<{ f: SeasonFixture; why: string }>, report: GameRunReport, force = false) {
  const byRound = new Map<number, Array<{ f: SeasonFixture; why: string }>>();
  for (const g of games) byRound.set(Number(g.f.week), [...(byRound.get(Number(g.f.week)) ?? []), g]);
  for (const [round, list] of byRound) {
    const teams = [...new Set(list.flatMap((g) => teamsOf(g.f)))];
    const r = await syncExternalStats(db, season, { onlyRounds: [round], onlyTeams: teams });
    report.rows += r.insertedOrUpdated;
    report.failed += r.failedPlayers;
    for (const g of list) report.synced.push({ fixtureId: g.f.id, why: g.why });
    const finals = list.filter((g) => g.why === "final");
    // (force: the run just before the week is finalised always counts, so nothing changes after it)
    if (finals.length && (force || r.failedPlayers <= MAX_FAILED_PLAYERS)) {
      const { error } = await db
        .from("fixture_stats_final")
        .upsert(finals.map((g) => ({ season, fixture_id: g.f.id, real_round: round, finalised_at: new Date().toISOString() })), { onConflict: "season,fixture_id" });
      if (error) throw error;
      report.finalised.push(...finals.map((g) => g.f.id));
    }
  }
}

/** The cron's stats step: every game that's due on this run. */
export async function runGameStats(db: SupabaseClient, seasonYear: number, nowMs: number, opts: { firstCallOfHour: boolean }): Promise<GameRunReport> {
  const report: GameRunReport = { synced: [], finalised: [], rows: 0, failed: 0 };
  const season = getSeason(seasonYear);
  // games from the last few days (older ones were finalised with their week)
  const started = season.fixtures.filter((f) => kickoffMs(f) > 0 && kickoffMs(f) <= nowMs && nowMs - kickoffMs(f) <= LOOK_BACK_MS);
  if (!started.length) return report;
  const done = await finalisedFixtureIds(db, seasonYear);
  const due = started
    .map((f) => ({ f, why: gameSyncDue(kickoffMs(f), nowMs, done.has(f.id), opts.firstCallOfHour) }))
    .filter((g): g is { f: SeasonFixture; why: "live" | "hourly" | "final" } => g.why != null);
  if (due.length) await syncGames(db, seasonYear, due, report);
  return report;
}

/** Before a week is finalised: the last run for any of these rounds' games that haven't had it. */
export async function finishGames(db: SupabaseClient, seasonYear: number, realRounds: number[], nowMs: number): Promise<GameRunReport> {
  const report: GameRunReport = { synced: [], finalised: [], rows: 0, failed: 0 };
  const season = getSeason(seasonYear);
  const done = await finalisedFixtureIds(db, seasonYear);
  const left = season.fixtures.filter((f) => realRounds.includes(Number(f.week)) && !done.has(f.id) && kickoffMs(f) > 0 && kickoffMs(f) <= nowMs);
  if (left.length) await syncGames(db, seasonYear, left.map((f) => ({ f, why: "final" })), report, true);
  return report;
}
