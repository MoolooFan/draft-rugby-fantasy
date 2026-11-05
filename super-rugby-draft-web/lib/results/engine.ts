// lib/results/engine.ts
// The automatic results job. Everything that happens on its own during a season:
//   - building a league's schedule when its draft finishes
//   - locking every team's lineup at each round's deadline
//   - finalising each round 13.5 hours after its last kickoff (auto-subs, scores, results,
//     bonus points), then filling in the next matchups (ladder-picked weeks, finals teams)
// Every step is safe to run again: it only does work that hasn't been done yet.
//
// The database client is passed in, so the website, the scheduled job and test scripts
// all run exactly the same code.
import type { SupabaseClient } from "@supabase/supabase-js";
import playersData from "@/data/players.json";
import { statCountsFromRaw, isFrontRow, STATS, type StatCounts } from "@/lib/scoring";
import { scoreTeamWeek, type Lineup, type LineupPlayer } from "@/lib/scoring/week";
import { reconcileLineup } from "@/lib/league/lineup";
import { bonusPoints, buildLadder, type LadderMatchup } from "@/lib/league/ladder";
import {
  buildLeagueSchedule,
  pickRoundForWeek,
  resolveSource,
  type FinalsSize,
  type PlayoffResult,
  type Source,
  type WeeksToDecide,
} from "@/lib/league/schedule";
import {
  getSeason,
  leagueWeeksAfterDraft,
  realRoundsForWeek,
  totalFantasyWeeks,
  weekDeadlineMs,
  weekFinaliseAtMs,
  type SeasonConfig,
} from "@/lib/season";

type Db = SupabaseClient;

export type SchedulePlan = {
  weeks: number[];
  regularWeeks: number[];
  playoffWeeks: number[];
  finals: FinalsSize;
  regularToDecide: WeeksToDecide | null;
  usedRounds: number[];
  spoonSeedWithoutGame: number | null;
};

type LeagueRow = {
  id: string;
  season: number;
  playoff_format: string;
  bonus_points: boolean;
  first_week: number | null;
  schedule_plan: SchedulePlan | null;
  schedule_built_at: string | null;
};

type MatchupRow = LadderMatchup & {
  id: string;
  league_id: string;
  playoff_key: string | null;
  label: string | null;
  weeks: number[];
  home_source: Source | null;
  away_source: Source | null;
  decides: string | null;
  home_tries: number | null;
  away_tries: number | null;
  winner_team_id: string | null;
};

export const normId = (x: unknown) => String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

export function finalsSizeFromFormat(format: string | null | undefined): FinalsSize {
  const n = Number(String(format ?? "").replace("final", ""));
  return ([2, 3, 4, 6] as const).includes(n as 2 | 3 | 4 | 6) ? (n as FinalsSize) : 0;
}

// ---------------------------------------------------------------------------
// Players (positions). TODO(item 13): players move into the database for 2027.

let positionCache: Map<string, LineupPlayer> | null = null;
export function playerInfo(id: string): LineupPlayer {
  if (!positionCache) {
    positionCache = new Map();
    for (const p of playersData as Array<{ id: string; posAbbrev?: string; secondaryPosAbbrev?: string }>) {
      positionCache.set(normId(p.id), { id: p.id, posAbbrev: p.posAbbrev ?? null, secondaryPosAbbrev: p.secondaryPosAbbrev ?? null });
    }
  }
  return positionCache.get(normId(id)) ?? { id, posAbbrev: null, secondaryPosAbbrev: null };
}

// ---------------------------------------------------------------------------
// Schedule

/** Builds and saves a league's schedule (run once, when the draft finishes). */
export async function buildScheduleForLeague(db: Db, leagueId: string, nowMs: number, opts: { shuffle?: boolean } = {}) {
  const league = await q<LeagueRow>(db.from("leagues").select("*").eq("id", leagueId).single());
  if (league.schedule_built_at) return { ok: true, alreadyBuilt: true };
  const season = getSeason(league.season);
  const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", leagueId).order("created_at"));
  const teamIds = teams.map((t) => t.id);
  if (opts.shuffle !== false) {
    for (let i = teamIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teamIds[i], teamIds[j]] = [teamIds[j], teamIds[i]];
    }
  }
  const weeks = leagueWeeksAfterDraft(season, nowMs);
  const finals = finalsSizeFromFormat(league.playoff_format);
  const sch = buildLeagueSchedule({ teamIds, weeks, finals });

  const rows = [
    ...sch.regular.map((g) => ({
      league_id: leagueId, kind: "regular", weeks: [g.week], home_team_id: g.homeTeamId, away_team_id: g.awayTeamId,
    })),
    ...sch.playoffs.map((g) => ({
      league_id: leagueId, kind: g.bracket, playoff_key: g.key, label: g.label, weeks: g.weeks,
      home_source: g.home, away_source: g.away, decides: g.decides ?? null,
    })),
  ];
  await q(db.from("league_matchups").delete().eq("league_id", leagueId));
  if (rows.length) await q(db.from("league_matchups").insert(rows));

  const plan: SchedulePlan = {
    weeks,
    regularWeeks: sch.regularWeeks,
    playoffWeeks: sch.playoffWeeks,
    finals,
    regularToDecide: sch.regularToDecide,
    usedRounds: [],
    spoonSeedWithoutGame: sch.spoonSeedWithoutGame,
  };
  await q(
    db.from("leagues").update({
      schedule_plan: plan,
      first_week: weeks[0] ?? null,
      schedule_built_at: new Date(nowMs).toISOString(),
      settings_locked_at: new Date(nowMs).toISOString(),
      draft_status: "complete",
    }).eq("id", leagueId)
  );
  return { ok: true, weeks: weeks.length, regularWeeks: sch.regularWeeks.length, playoffWeeks: sch.playoffWeeks.length };
}

// ---------------------------------------------------------------------------
// Locking lineups at the deadline

async function lockedTeamCount(db: Db, leagueId: string, week: number) {
  const rows = await q<Array<{ team_id: string }>>(
    db.from("team_selections").select("team_id").eq("league_id", leagueId).eq("week", week).not("locked_at", "is", null)
  );
  return rows.length;
}

/** Locks every team's lineup for a week: their saved one, or their latest one, matched to the current roster. */
export async function lockWeek(db: Db, leagueId: string, week: number, nowMs: number) {
  const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", leagueId));
  const rosters = await q<Array<{ team_id: string; data: { playerIds?: string[] } }>>(
    db.from("rosters").select("team_id, data").eq("league_id", leagueId)
  );
  const selections = await q<Array<{ team_id: string; week: number; lineup: Lineup; captain_id: string | null; vice_id: string | null; locked_at: string | null }>>(
    db.from("team_selections").select("team_id, week, lineup, captain_id, vice_id, locked_at").eq("league_id", leagueId).lte("week", week)
  );
  let locked = 0;
  for (const t of teams) {
    const existing = selections.find((s) => s.team_id === t.id && s.week === week);
    if (existing?.locked_at) continue;
    const latest = existing ?? selections.filter((s) => s.team_id === t.id).sort((a, b) => b.week - a.week)[0] ?? null;
    const rosterIds = rosters.find((r) => r.team_id === t.id)?.data?.playerIds ?? [];
    const lineup = reconcileLineup(latest?.lineup ?? null, rosterIds.map(playerInfo));
    const inLineup = new Set(Object.values(lineup).filter(Boolean).map((p) => p!.id));
    const keep = (id: string | null | undefined) => (id && inLineup.has(id) ? id : null);
    await q(
      db.from("team_selections").upsert(
        {
          league_id: leagueId,
          week,
          team_id: t.id,
          lineup,
          captain_id: keep(latest?.captain_id),
          vice_id: keep(latest?.vice_id),
          updated_at: new Date(nowMs).toISOString(),
          locked_at: new Date(nowMs).toISOString(),
        },
        { onConflict: "league_id,week,team_id" }
      )
    );
    locked++;
  }
  return locked;
}

// ---------------------------------------------------------------------------
// Finalising a week

/** Each player's stat counts for a fantasy week (all its real rounds added together). */
async function weekStats(db: Db, season: SeasonConfig, week: number): Promise<Map<string, StatCounts>> {
  const rounds = realRoundsForWeek(season, week);
  const out = new Map<string, StatCounts>();
  let from = 0;
  for (;;) {
    const rows = await q<Array<{ internal_player_id: string; raw_json: { stats?: unknown } }>>(
      db.from("player_round_stats").select("internal_player_id, raw_json").eq("season", season.season).in("round", rounds).range(from, from + 999)
    );
    for (const r of rows) {
      const counts = statCountsFromRaw(r.raw_json?.stats);
      const key = normId(r.internal_player_id);
      const prev = out.get(key);
      if (!prev) out.set(key, counts);
      else for (const s of STATS) prev[s.key] = Number(prev[s.key] ?? 0) + Number(counts[s.key] ?? 0);
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function regularSeasonSeeds(db: Db, league: LeagueRow, matchups: MatchupRow[]): Promise<string[]> {
  const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", league.id));
  return buildLadder(teams.map((t) => t.id), matchups).map((r) => r.teamId);
}

/**
 * Finalises one week for a league: scores every team, records results.
 * force = redo a week that was already finalised (admin "finalise again").
 */
export async function finaliseWeek(db: Db, leagueId: string, week: number, nowMs: number, opts: { force?: boolean } = {}) {
  const league = await q<LeagueRow>(db.from("leagues").select("*").eq("id", leagueId).single());
  const done = await q<Array<{ week: number }>>(db.from("league_week_finalisations").select("week").eq("league_id", leagueId).eq("week", week));
  if (done.length && !opts.force) return { skipped: true };

  const season = getSeason(league.season);
  const stats = await weekStats(db, season, week);
  const selections = await q<Array<{ team_id: string; lineup: Lineup; captain_id: string | null; vice_id: string | null }>>(
    db.from("team_selections").select("team_id, lineup, captain_id, vice_id").eq("league_id", leagueId).eq("week", week)
  );
  const nowIso = new Date(nowMs).toISOString();

  // 1. Every team's score for the week.
  const results = selections.map((s) => {
    const lineup: Lineup = {};
    for (const [slot, p] of Object.entries(s.lineup ?? {})) {
      (lineup as Record<string, LineupPlayer | null>)[slot] = p?.id ? { ...p, ...playerInfo(p.id), id: p.id } : null;
    }
    const r = scoreTeamWeek({
      lineup,
      captainId: s.captain_id,
      viceId: s.vice_id,
      statsFor: (id) => stats.get(normId(id)) ?? null,
      frontRow: (id) => isFrontRow(playerInfo(id)),
    });
    return {
      league_id: leagueId, week, team_id: s.team_id,
      picked_lineup: s.lineup, picked_captain_id: s.captain_id, picked_vice_id: s.vice_id,
      final_lineup: r.finalLineup, captain_used_id: r.captainUsedId, player_points: r.playerPoints,
      score: r.score, tries: r.tries, finalised_at: nowIso,
    };
  });
  if (results.length) await q(db.from("team_week_results").upsert(results, { onConflict: "league_id,week,team_id" }));

  // 2. Matchups that finish this week.
  const allResults = await q<Array<{ week: number; team_id: string; score: number; tries: number }>>(
    db.from("team_week_results").select("week, team_id, score, tries").eq("league_id", leagueId)
  );
  const matchups = await q<MatchupRow[]>(db.from("league_matchups").select("*").eq("league_id", leagueId));
  const seeds = league.schedule_plan && week > Math.max(...league.schedule_plan.regularWeeks)
    ? await regularSeasonSeeds(db, league, matchups)
    : [];
  const seedOf = (teamId: string) => {
    const i = seeds.indexOf(teamId);
    return i < 0 ? 999 : i + 1;
  };
  const total = (teamId: string, weeks: number[]) => {
    const rs = allResults.filter((r) => r.team_id === teamId && weeks.includes(r.week));
    return { score: rs.reduce((a, r) => a + r.score, 0), tries: rs.reduce((a, r) => a + r.tries, 0) };
  };

  for (const m of matchups) {
    if (Math.max(...m.weeks) !== week || !m.home_team_id) continue;
    const home = total(m.home_team_id, m.weeks);
    if (!m.away_team_id) {
      // bye (regular season): score only
      await q(db.from("league_matchups").update({ status: "final", home_score: home.score, home_tries: home.tries, finalised_at: nowIso }).eq("id", m.id));
      continue;
    }
    const away = total(m.away_team_id, m.weeks);
    let winner: string | null = null;
    let hb = 0, ab = 0;
    if (home.score !== away.score) winner = home.score > away.score ? m.home_team_id : m.away_team_id;
    if (m.kind === "regular") {
      const b = bonusPoints(home.score, away.score, league.bonus_points);
      hb = b.home; ab = b.away;
    } else if (!winner) {
      // playoffs can't be drawn: most tries, then the higher seed
      if (home.tries !== away.tries) winner = home.tries > away.tries ? m.home_team_id : m.away_team_id;
      else winner = seedOf(m.home_team_id) <= seedOf(m.away_team_id) ? m.home_team_id : m.away_team_id;
    }
    await q(
      db.from("league_matchups").update({
        status: "final", home_score: home.score, away_score: away.score, home_tries: home.tries, away_tries: away.tries,
        winner_team_id: winner, home_bonus: hb, away_bonus: ab, finalised_at: nowIso,
      }).eq("id", m.id)
    );
  }
  await q(db.from("league_week_finalisations").upsert({ league_id: leagueId, week, finalised_at: nowIso }, { onConflict: "league_id,week" }));
  await prepareUpcoming(db, leagueId);
  return { finalised: true, teams: results.length };
}

// ---------------------------------------------------------------------------
// Filling in upcoming matchups

/** Picks ladder-decided weeks and fills in playoff teams that are now known. */
export async function prepareUpcoming(db: Db, leagueId: string) {
  const league = await q<LeagueRow>(db.from("leagues").select("*").eq("id", leagueId).single());
  const plan = league.schedule_plan;
  if (!plan) return;
  let matchups = await q<MatchupRow[]>(db.from("league_matchups").select("*").eq("league_id", leagueId));
  const finalisedWeeks = new Set(
    (await q<Array<{ week: number }>>(db.from("league_week_finalisations").select("week").eq("league_id", leagueId))).map((r) => r.week)
  );
  const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", leagueId));

  // Ladder-decided regular weeks: decide the next one once every earlier week is final.
  const toDecide = plan.regularToDecide;
  if (toDecide) {
    for (const w of toDecide.weeks) {
      if (matchups.some((m) => m.kind === "regular" && m.weeks.includes(w))) continue;
      const earlier = plan.weeks.filter((x) => x < w);
      if (!earlier.every((x) => finalisedWeeks.has(x))) break;
      const ladder = buildLadder(teams.map((t) => t.id), matchups).map((r) => r.teamId);
      const pick = pickRoundForWeek(toDecide, w, ladder, plan.usedRounds);
      await q(db.from("league_matchups").insert(pick.games.map((g) => ({
        league_id: leagueId, kind: "regular", weeks: [w], home_team_id: g.homeTeamId, away_team_id: g.awayTeamId,
      }))));
      plan.usedRounds.push(pick.roundIndex);
      await q(db.from("leagues").update({ schedule_plan: plan }).eq("id", leagueId));
      matchups = await q<MatchupRow[]>(db.from("league_matchups").select("*").eq("league_id", leagueId));
      break; // one week at a time
    }
  }

  // Playoff teams: known once the regular season is over (seeds) and earlier games are decided.
  if (!plan.regularWeeks.every((w) => finalisedWeeks.has(w))) return;
  const seeds = buildLadder(teams.map((t) => t.id), matchups).map((r) => r.teamId);
  const seedToTeam = (s: number) => seeds[s - 1] ?? null;
  const results: Record<string, PlayoffResult> = {};
  for (const m of matchups) {
    if (m.playoff_key && m.status === "final" && m.winner_team_id && m.home_team_id && m.away_team_id) {
      results[m.playoff_key] = { winnerTeamId: m.winner_team_id, loserTeamId: m.winner_team_id === m.home_team_id ? m.away_team_id : m.home_team_id };
    }
  }
  for (const m of matchups) {
    if (!m.playoff_key || m.status === "final") continue;
    const patch: Record<string, string> = {};
    if (!m.home_team_id && m.home_source) { const t = resolveSource(m.home_source, seedToTeam, results); if (t) patch.home_team_id = t; }
    if (!m.away_team_id && m.away_source) { const t = resolveSource(m.away_source, seedToTeam, results); if (t) patch.away_team_id = t; }
    if (Object.keys(patch).length) await q(db.from("league_matchups").update(patch).eq("id", m.id));
  }
}

// ---------------------------------------------------------------------------
// The tick (runs every few minutes)

export type TickReport = { leagues: number; locked: string[]; finalised: string[]; errors: string[] };

/** Locks and finalises whatever is due for every league in a season. Stats syncing is done by the caller. */
export async function runResultsTick(db: Db, seasonYear: number, nowMs: number, opts: { beforeFinalise?: (realRounds: number[]) => Promise<void> } = {}): Promise<TickReport> {
  const season = getSeason(seasonYear);
  const report: TickReport = { leagues: 0, locked: [], finalised: [], errors: [] };
  const leagues = await q<LeagueRow[]>(db.from("leagues").select("*").eq("season", seasonYear).not("schedule_built_at", "is", null));
  const syncedWeeks = new Set<number>();
  for (const league of leagues) {
    report.leagues++;
    const plan = league.schedule_plan;
    if (!plan) continue;
    const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", league.id));
    const finalised = new Set(
      (await q<Array<{ week: number }>>(db.from("league_week_finalisations").select("week").eq("league_id", league.id))).map((r) => r.week)
    );
    for (const w of plan.weeks) {
      if (w > totalFantasyWeeks(season)) continue;
      try {
        const deadline = weekDeadlineMs(season, w);
        if (deadline != null && nowMs >= deadline && (await lockedTeamCount(db, league.id, w)) < teams.length) {
          const n = await lockWeek(db, league.id, w, nowMs);
          if (n) report.locked.push(`${league.id} week ${w} (${n} teams)`);
        }
        const finaliseAt = weekFinaliseAtMs(season, w);
        if (finaliseAt != null && nowMs >= finaliseAt && !finalised.has(w)) {
          // pull the week's final stats once (shared by every league finalising this week)
          if (opts.beforeFinalise && !syncedWeeks.has(w)) { await opts.beforeFinalise(realRoundsForWeek(season, w)); syncedWeeks.add(w); }
          await finaliseWeek(db, league.id, w, nowMs);
          finalised.add(w);
          report.finalised.push(`${league.id} week ${w}`);
        }
      } catch (e) {
        report.errors.push(`${league.id} week ${w}: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
        break; // don't run later weeks of this league out of order
      }
    }
  }
  return report;
}
