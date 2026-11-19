// lib/league/powerServer.ts (server only)
// A league's power rankings and finals / title chances (Ethan, 19 Nov 2026), as of its latest
// finalised round. The rest of the season and the finals are simulated (lib/league/odds.ts) from
// each team's scores so far and its roster; the power rankings are the teams in order of their
// chance of winning the title (then of making the finals, then strength).
//
// Each round's ranking is saved in power_rankings the first time it's worked out (and after
// each round is finalised, lib/results/engine.ts). The page also shows (Ethan, 20 Nov 2026):
// - movement since the round before,
// - the preseason ranking (straight after the draft, before round 1),
// - the trend over the last 5 rounds (Trending up / down).
// A past ranking that was never saved is worked out as it would have been then: the results up
// to that round, and each team's squad at the time (its team selection for the next round, else
// its draft picks).
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSquadFormat } from "@/lib/league/squadServer";
import { bestXvProjection } from "@/lib/league/powerRankings";
import { DEFAULT_SIMS, TREND_ROUNDS, matchupsAsOf, seededRandom, seedFrom, simulateOdds, type OddsMatchup, type TeamOdds } from "@/lib/league/odds";
import { bonusRulesFromRow } from "@/lib/league/bonus";
import { cleanShieldRewards } from "@/lib/league/shield";
import { activeIdsOf } from "@/lib/league/ir";
import { finalsSizeFromFormat } from "@/lib/results/engine";
import { loadSeasonPlayers } from "@/lib/players/db";
import { weekProjections } from "@/lib/projections/server";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { getSeason, SEASONS, totalFantasyWeeks, weekFirstKickoffMs } from "@/lib/season";

export type PowerRow = TeamOdds & {
  rank: number;
  /** places moved since the round before (+ = up) */
  movement: number | null;
  /** rank straight after the draft, before round 1 */
  preseasonRank: number | null;
  /** places moved over the last TREND_ROUNDS rounds (+ = up) */
  trend: number | null;
};

export type PowerTable = {
  /** rankings as of this finalised round (0 = before round 1) */
  asOfWeek: number;
  /** the trend is measured from this round's ranking (0 = preseason) */
  trendFromWeek: number;
  /** finals places (0 = no finals: the title goes to the top of the ladder) */
  finalsSize: number;
  /** false before the season's schedule is made (no draft yet): then it's roster strength only */
  simulated: boolean;
  /** the league's first round has kicked off (until then the dashboard shows these instead of the standings) */
  started: boolean;
  rows: PowerRow[];
};

type Ranked = TeamOdds & { rank: number };
type Squads = Record<string, string[]>;

function rank(odds: TeamOdds[]): Ranked[] {
  return odds
    .slice()
    .sort((a, b) => b.titlePct - a.titlePct || b.playoffPct - a.playoffPct || b.strength - a.strength || a.teamId.localeCompare(b.teamId))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

const lineupIds = (lineup: unknown): string[] =>
  Object.values((lineup ?? {}) as Record<string, unknown>)
    .map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as { id?: unknown }).id : null))
    .filter((id): id is string => typeof id === "string" && !!id);

export async function loadPower(db: SupabaseClient, leagueId: string): Promise<PowerTable> {
  const { data: league, error } = await db.from("leagues").select("season, playoff_format, bonus_rules, bonus_points, shield_rewards, shield_enabled").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  const season = SEASONS[Number(league?.season)] ? Number(league?.season) : null;
  const [teams, done, matchups, rosters, savedRes] = await Promise.all([
    db.from("teams").select("id").eq("league_id", leagueId),
    db.from("league_week_finalisations").select("week").eq("league_id", leagueId),
    db
      .from("league_matchups")
      .select("kind, status, weeks, playoff_key, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, home_shield_pts, away_shield_pts, shield_holder_after, home_source, away_source, decides, winner_team_id")
      .eq("league_id", leagueId),
    db.from("rosters").select("team_id, data").eq("league_id", leagueId),
    db.from("power_rankings").select("week, team_id, rank").eq("league_id", leagueId),
  ]);
  for (const r of [teams, done, matchups, rosters, savedRes]) if (r.error) throw r.error;
  const teamIds = (teams.data ?? []).map((t) => t.id as string);
  const games = (matchups.data ?? []) as unknown as OddsMatchup[];
  // the latest finalised round: from the finalisations, else the latest regular round with scores
  const finalised = (done.data ?? []).map((d) => Number(d.week));
  const scoredWeeks = games.filter((m) => m.kind === "regular" && m.status === "final").flatMap((m) => (m.weeks ?? []).map(Number));
  const asOfWeek = Math.max(0, ...finalised, ...scoredWeeks);
  const finalsSize = finalsSizeFromFormat(league?.playoff_format);
  const rewards = cleanShieldRewards(league?.shield_rewards);
  const simulated = games.length > 0;
  // has the league's first round kicked off? (its first game's kickoff, or any result in)
  const firstWeek = Math.min(...games.filter((m) => m.kind === "regular").flatMap((m) => (m.weeks ?? []).map(Number)));
  const firstKickoff = season && Number.isFinite(firstWeek) ? weekFirstKickoffMs(getSeason(season), firstWeek) : Infinity;
  const started = asOfWeek > 0 || Date.now() >= firstKickoff;

  // projections of each team's best possible team for the round after `week`
  const rules = season ? await getLeagueScoringRules(db, leagueId) : null;
  const [players, format] = season ? await Promise.all([loadSeasonPlayers(db, season), loadSquadFormat(db, leagueId)]) : [[], null];
  const byId = new Map(players.map((p) => [p.id, p]));
  const projectRosters = async (week: number, squads: Squads): Promise<Record<string, number>> => {
    if (!season || !rules) return {};
    const weeks = totalFantasyWeeks(getSeason(season));
    const w1 = Math.min(Math.max(1, week + 1), weeks);
    const w2 = Math.min(w1 + 1, weeks);
    const [p1, p2] = await Promise.all([weekProjections(db, season, w1, rules), w2 !== w1 ? weekProjections(db, season, w2, rules) : Promise.resolve(null)]);
    // a player on a bye next round counts with the round after's projection (so a bye doesn't
    // make a team look weak for the whole season)
    const pts = (id: string) => {
      const a = p1.players[id];
      if (a && a.kickoffMs == null && p2?.players[id]) return p2.players[id].pts;
      return a?.pts ?? 0;
    };
    const out: Record<string, number> = {};
    for (const id of teamIds) {
      const squad = (squads[id] ?? []).map((pid) => byId.get(pid)).filter((p): p is NonNullable<typeof p> => !!p);
      out[id] = bestXvProjection(squad, pts, format);
    }
    return out;
  };
  const rankingAt = async (week: number, squads: Squads): Promise<Ranked[]> => {
    const rosterProjection = await projectRosters(week, squads);
    if (!simulated) return rank(teamIds.map((id) => ({ teamId: id, playoffPct: 0, titlePct: 0, clinched: false, eliminated: false, strength: rosterProjection[id] ?? 0 })));
    return rank(
      simulateOdds({
        teamIds,
        matchups: week >= asOfWeek ? games : matchupsAsOf(games, week),
        rosterProjection,
        finalsSize,
        bonusRules: bonusRulesFromRow(league ?? {}),
        maxShieldPoints: league?.shield_enabled ? Math.max(rewards.defencePoints, rewards.winPoints) : 0,
        sims: DEFAULT_SIMS,
        // the same numbers on every reload until something changes
        rng: seededRandom(seedFrom(`${leagueId}:${week}:${JSON.stringify(rosterProjection)}`)),
      })
    );
  };

  const currentSquads: Squads = Object.fromEntries(((rosters.data ?? []) as Array<{ team_id: string; data: unknown }>).map((r) => [r.team_id, activeIdsOf((r.data ?? {}) as never)]));
  const current = await rankingAt(asOfWeek, currentSquads);

  // saved rankings by round; the ones the page needs and doesn't have are worked out and saved
  const saved = new Map<number, Map<string, number>>();
  for (const s of savedRes.data ?? []) {
    const w = Number(s.week);
    if (!saved.has(w)) saved.set(w, new Map());
    saved.get(w)!.set(s.team_id as string, Number(s.rank));
  }
  const complete = (w: number) => (saved.get(w)?.size ?? 0) >= teamIds.length;
  const toSave: Array<{ week: number; rows: Ranked[] }> = [];
  if (simulated && !complete(asOfWeek)) {
    toSave.push({ week: asOfWeek, rows: current });
    saved.set(asOfWeek, new Map(current.map((r) => [r.teamId, r.rank])));
  }
  const trendFromWeek = Math.max(0, asOfWeek - TREND_ROUNDS);
  const pastWeeks = simulated && asOfWeek > 0 ? [...new Set([0, asOfWeek - 1, trendFromWeek])].filter((w) => !complete(w)) : [];
  if (pastWeeks.length) {
    const [picks, selections] = await Promise.all([
      db.from("draft_picks").select("team_id, player_id").eq("league_id", leagueId).order("pick_number"),
      db.from("team_selections").select("week, team_id, lineup").eq("league_id", leagueId),
    ]);
    if (picks.error) throw picks.error;
    if (selections.error) throw selections.error;
    const drafted: Squads = {};
    for (const p of picks.data ?? []) (drafted[p.team_id as string] ??= []).push(p.player_id as string);
    const squadsAt = (week: number): Squads =>
      Object.fromEntries(
        teamIds.map((id) => {
          // the team named for the round after (or the latest before it); else the draft picks
          const sel = (selections.data ?? [])
            .filter((s) => s.team_id === id && Number(s.week) <= week + 1)
            .sort((a, b) => Number(b.week) - Number(a.week))
            .map((s) => lineupIds(s.lineup))
            .find((ids) => ids.length > 0);
          const squad = week === 0 ? drafted[id] ?? sel : sel ?? drafted[id];
          return [id, squad?.length ? squad : currentSquads[id] ?? []];
        })
      );
    for (const w of pastWeeks) {
      const rows = await rankingAt(w, squadsAt(w));
      toSave.push({ week: w, rows });
      saved.set(w, new Map(rows.map((r) => [r.teamId, r.rank])));
    }
  }
  if (toSave.length) {
    const { error: iErr } = await db.from("power_rankings").upsert(
      toSave.flatMap(({ week, rows }) => rows.map((r) => ({ league_id: leagueId, week, team_id: r.teamId, rank: r.rank, score: Math.round(r.titlePct * 10) / 10 }))),
      { onConflict: "league_id,week,team_id" }
    );
    if (iErr) throw iErr;
  }

  const rankAt = (w: number, teamId: string) => (asOfWeek > 0 && w >= 0 && w < asOfWeek ? saved.get(w)?.get(teamId) ?? null : null);
  return {
    asOfWeek,
    trendFromWeek,
    finalsSize,
    simulated,
    started,
    rows: current.map((r) => {
      const before = rankAt(asOfWeek - 1, r.teamId);
      const from = rankAt(trendFromWeek, r.teamId);
      return {
        ...r,
        movement: before != null ? before - r.rank : null,
        preseasonRank: asOfWeek > 0 ? rankAt(0, r.teamId) : simulated ? r.rank : null,
        trend: from != null ? from - r.rank : null,
      };
    }),
  };
}
