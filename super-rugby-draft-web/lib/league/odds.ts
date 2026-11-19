// lib/league/odds.ts
// Each team's chance of making the finals and of winning the title (Ethan, 19 Nov 2026): the rest
// of the season and the finals are played out many times (a Monte Carlo simulation) and we count
// how often each team finishes in the finals places and wins the Grand Final. Pure code
// (scripts/tests/odds.test.ts); the database side is lib/league/powerServer.ts.
//
// How strong each team is: a mix of its scores so far and its roster (the projected score of
// its best possible team). Early on it's mostly the roster; the more rounds a team has played,
// the more its real scores count (after 4 rounds they count as much as the roster). Every
// simulated season also nudges each team's strength up or down a little (we can't be sure how
// good anyone really is), and every week's score varies the way real weekly scores do.
//
// Ladder: as on the League page (lib/league/ladder.ts): 4 for a win, 2 for a draw, bonus points
// if the league uses them, then points for. The Shield's future ladder points aren't simulated.
// Finals: the league's real bracket (lib/league/schedule.ts); level scores go to the higher seed.
import { bonusPoints, buildLadder, ladderOrder, tieBreakHolder, type LadderMatchup } from "@/lib/league/ladder";
import { finalsGames, resolveSource, type FinalsSize, type PlayoffResult, type Source } from "@/lib/league/schedule";
import type { BonusRules } from "@/lib/league/bonus";
import { BONUS_POINTS, LADDER_POINTS } from "@/lib/season";

export type OddsMatchup = LadderMatchup & {
  playoff_key?: string | null;
  home_source?: Source | null;
  away_source?: Source | null;
  decides?: string | null;
  winner_team_id?: string | null;
};

export type TeamStrength = { teamId: string; mean: number; weekSd: number; meanSd: number; games: number };

export type TeamOdds = {
  teamId: string;
  /** 0-100 */
  playoffPct: number;
  titlePct: number;
  /** certain to make the finals / certain to miss them (not just "very likely") */
  clinched: boolean;
  eliminated: boolean;
  /** expected weekly score used for the simulation */
  strength: number;
};

/** Rounds of real scores that count as much as the roster projection. */
export const ROSTER_WEIGHT_ROUNDS = 4;
export const DEFAULT_SIMS = 10000;
/** Rounds the power rankings' Trending up / down boxes look back over. */
export const TREND_ROUNDS = 5;

/** Small, fast random numbers that repeat for the same seed (so the odds don't jump on every reload). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Each team's weekly scores so far (regular-season games and byes that are final). */
function scoresSoFar(teamIds: string[], matchups: OddsMatchup[]): Map<string, number[]> {
  const out = new Map(teamIds.map((id) => [id, [] as number[]]));
  for (const m of matchups) {
    if (m.kind !== "regular" || m.status !== "final") continue;
    if (m.home_team_id && m.home_score != null) out.get(m.home_team_id)?.push(Number(m.home_score));
    if (m.away_team_id && m.away_score != null) out.get(m.away_team_id)?.push(Number(m.away_score));
  }
  return out;
}

/** How strong each team is (see the top of the file). rosterProjection: best possible team's projected score. */
export function teamStrengths(teamIds: string[], matchups: OddsMatchup[], rosterProjection: Record<string, number>): Map<string, TeamStrength> {
  const scores = scoresSoFar(teamIds, matchups);
  const all = [...scores.values()].flat();
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const projs = teamIds.map((id) => rosterProjection[id] ?? 0).filter((x) => x > 0);
  const projAvg = avg(projs);
  const leagueAvg = all.length ? avg(all) : projAvg;
  // the projection of the best possible team runs higher than real scores (bye weeks, injuries,
  // lineups): scale it to what teams really score once there are some results
  const scale = all.length && projAvg > 0 ? Math.min(1.2, Math.max(0.5, leagueAvg / projAvg)) : 1;

  // how much a team's weekly score bounces around: from the real scores (each against its own
  // team's average), mixed with a starting guess of 15% of the average score
  const guessSd = Math.max(1, 0.15 * (leagueAvg || 300));
  let ss = 0, dof = 0;
  for (const xs of scores.values()) {
    if (xs.length < 2) continue;
    const m = avg(xs);
    for (const x of xs) ss += (x - m) ** 2;
    dof += xs.length - 1;
  }
  const PRIOR_DOF = 6;
  const weekSd = Math.sqrt((ss + PRIOR_DOF * guessSd ** 2) / (dof + PRIOR_DOF));

  const out = new Map<string, TeamStrength>();
  for (const id of teamIds) {
    const xs = scores.get(id) ?? [];
    const proj = rosterProjection[id] ?? 0;
    const prior = proj > 0 ? proj * scale : leagueAvg;
    const k = ROSTER_WEIGHT_ROUNDS;
    const mean = (xs.reduce((a, b) => a + b, 0) + k * prior) / (xs.length + k);
    out.set(id, { teamId: id, mean, weekSd, meanSd: weekSd / Math.sqrt(xs.length + k), games: xs.length });
  }
  return out;
}

type Row = { teamId: string; pts: number; pf: number; pd: number };

export function simulateOdds(input: {
  teamIds: string[];
  matchups: OddsMatchup[];
  rosterProjection: Record<string, number>;
  finalsSize: number;
  bonusRules: BonusRules;
  /** most ladder points a team can get from the Shield in one game (for "certain" checks) */
  maxShieldPoints?: number;
  sims?: number;
  rng?: () => number;
}): TeamOdds[] {
  const { teamIds, matchups, finalsSize } = input;
  const sims = input.sims ?? DEFAULT_SIMS;
  const rng = input.rng ?? Math.random;
  const strengths = teamStrengths(teamIds, matchups, input.rosterProjection);
  const idx = new Map(teamIds.map((id, i) => [id, i]));
  const n = teamIds.length;

  // the ladder as it stands
  const ladder = buildLadder(teamIds, matchups);
  const holder = tieBreakHolder(
    matchups
      .filter((m) => m.kind === "regular" && m.status === "final")
      .map((m) => ({ week: Math.max(0, ...((m.weeks ?? []).map(Number))), holder: m.shield_holder_after ?? null }))
  );
  const base = new Map(ladder.map((r) => [r.teamId, { pts: r.ladderPoints, pf: r.pointsFor, pd: r.pointsDiff }]));

  const remaining = matchups.filter((m) => m.kind === "regular" && m.status !== "final" && m.home_team_id && idx.has(m.home_team_id));
  // the playoff games; finals games missing from the schedule, or saved without where their
  // teams come from (leagues imported from before the schedule was saved), follow the standard
  // bracket for the league's finals size (lib/league/schedule.ts)
  const standard = finalsSize > 0 ? finalsGames(finalsSize as FinalsSize) : [];
  const lastRegularWeek = Math.max(0, ...matchups.filter((m) => m.kind === "regular").flatMap((m) => (m.weeks ?? []).map(Number)));
  const saved = matchups.filter((m) => m.kind !== "regular" && m.playoff_key);
  const playoffs: OddsMatchup[] = [
    ...saved.map((m) => {
      const std = standard.find((g) => g.key === m.playoff_key);
      return std ? { ...m, home_source: m.home_source ?? std.home, away_source: m.away_source ?? std.away, decides: m.decides ?? std.decides ?? null } : m;
    }),
    ...standard
      .filter((g) => !saved.some((m) => m.playoff_key === g.key))
      .map((g) => ({
        kind: g.bracket, status: "scheduled", playoff_key: g.key, weeks: g.weeks.map((w) => lastRegularWeek + w),
        home_team_id: null, away_team_id: null, home_score: null, away_score: null, home_source: g.home, away_source: g.away, decides: g.decides ?? null,
      })),
  ].sort((a, b) => Math.max(...(a.weeks ?? [0])) - Math.max(...(b.weeks ?? [0])));
  const champGame = playoffs.find((m) => m.decides === "champion") ?? null;
  const useFinals = finalsSize > 0 && !!champGame;

  const playoffCount = new Array(n).fill(0);
  const titleCount = new Array(n).fill(0);
  const mu = new Array(n).fill(0);
  const sd = teamIds.map((id) => strengths.get(id)!.weekSd);
  const score = (i: number, weeks: number) => {
    let s = 0;
    for (let w = 0; w < weeks; w++) s += mu[i] + gaussian(rng) * sd[i];
    return Math.max(0, Math.round(s));
  };

  for (let s = 0; s < sims; s++) {
    teamIds.forEach((id, i) => {
      const st = strengths.get(id)!;
      mu[i] = st.mean + gaussian(rng) * st.meanSd;
    });
    const rows: Row[] = teamIds.map((id) => ({ teamId: id, ...base.get(id)! }));
    for (const m of remaining) {
      const h = idx.get(m.home_team_id!)!;
      const weeks = Math.max(1, (m.weeks ?? [1]).length);
      const hs = score(h, weeks);
      if (!m.away_team_id || !idx.has(m.away_team_id)) {
        rows[h].pf += hs; // a bye: the score counts toward points for
        continue;
      }
      const a = idx.get(m.away_team_id)!;
      const as = score(a, weeks);
      rows[h].pf += hs; rows[a].pf += as;
      rows[h].pd += hs - as; rows[a].pd += as - hs;
      if (hs > as) rows[h].pts += LADDER_POINTS.win;
      else if (as > hs) rows[a].pts += LADDER_POINTS.win;
      else { rows[h].pts += LADDER_POINTS.draw; rows[a].pts += LADDER_POINTS.draw; }
      const b = bonusPoints(hs, as, input.bonusRules);
      rows[h].pts += b.home; rows[a].pts += b.away;
    }
    const order = rows.slice().sort(ladderOrder<Row>(holder, (r) => r.teamId, (r) => r.pts, (r) => r.pf, (r) => r.pd));
    const seedToTeam = (seed: number) => order[seed - 1]?.teamId ?? null;
    const seedOf = (id: string) => order.findIndex((r) => r.teamId === id) + 1 || 999;
    if (finalsSize > 0) for (let k = 0; k < Math.min(finalsSize, n); k++) playoffCount[idx.get(order[k].teamId)!]++;

    if (!useFinals) {
      titleCount[idx.get(order[0].teamId)!]++;
      continue;
    }
    // the finals (and the other playoff games, so later games can follow their sources)
    const results: Record<string, PlayoffResult | undefined> = {};
    let champion: string | null = null;
    for (const g of playoffs) {
      let winner: string | null = null, loser: string | null = null;
      if (g.status === "final" && g.winner_team_id && g.home_team_id && g.away_team_id) {
        winner = g.winner_team_id;
        loser = winner === g.home_team_id ? g.away_team_id : g.home_team_id;
      } else {
        const home = g.home_team_id ?? (g.home_source ? resolveSource(g.home_source, seedToTeam, results) : null);
        const away = g.away_team_id ?? (g.away_source ? resolveSource(g.away_source, seedToTeam, results) : null);
        if (!home || !away || !idx.has(home) || !idx.has(away)) continue;
        const weeks = Math.max(1, (g.weeks ?? [1]).length);
        const hs = score(idx.get(home)!, weeks), as = score(idx.get(away)!, weeks);
        const homeWins = hs > as || (hs === as && seedOf(home) <= seedOf(away));
        winner = homeWins ? home : away;
        loser = homeWins ? away : home;
      }
      results[g.playoff_key!] = { winnerTeamId: winner, loserTeamId: loser };
      if (g === champGame) champion = winner;
    }
    if (champion && idx.has(champion)) titleCount[idx.get(champion)!]++;
  }

  // certain to make / miss the finals (not just in every simulation)
  const gamesLeft = new Map(teamIds.map((id) => [id, 0]));
  for (const m of remaining) {
    if (!m.away_team_id) continue; // byes earn no ladder points
    gamesLeft.set(m.home_team_id!, (gamesLeft.get(m.home_team_id!) ?? 0) + 1);
    gamesLeft.set(m.away_team_id, (gamesLeft.get(m.away_team_id) ?? 0) + 1);
  }
  const perGameMax = LADDER_POINTS.win + (input.bonusRules.win.on ? BONUS_POINTS.ladderPoints : 0) + Math.max(0, input.maxShieldPoints ?? 0);
  const cur = (id: string) => base.get(id)?.pts ?? 0;
  const max = (id: string) => cur(id) + (gamesLeft.get(id) ?? 0) * perGameMax;
  const seasonOver = remaining.length === 0;
  const finalOrder = ladder.map((r) => r.teamId);

  return teamIds.map((id, i) => {
    const others = teamIds.filter((x) => x !== id);
    let clinched = false, eliminated = false;
    if (finalsSize > 0) {
      if (seasonOver) {
        const pos = finalOrder.indexOf(id);
        clinched = pos >= 0 && pos < finalsSize;
        eliminated = !clinched;
      } else {
        clinched = others.filter((j) => max(j) >= cur(id)).length < finalsSize;
        eliminated = others.filter((j) => cur(j) > max(id)).length >= finalsSize;
      }
    }
    return {
      teamId: id,
      playoffPct: clinched ? 100 : eliminated ? 0 : (playoffCount[i] / sims) * 100,
      titlePct: (titleCount[i] / sims) * 100,
      clinched,
      eliminated,
      strength: Math.round(strengths.get(id)!.mean * 10) / 10,
    };
  });
}

/** "64%", or "<1%" / ">99%" when it's very likely but not certain. */
/**
 * The schedule as it stood after round `week` (for past power rankings): games finishing later
 * go back to not yet played, and later finals games lose their teams (they come from the
 * bracket again in the simulation).
 */
export function matchupsAsOf<T extends OddsMatchup>(matchups: T[], week: number): T[] {
  return matchups.map((m) => {
    const last = Math.max(0, ...((m.weeks ?? []).map(Number)));
    if (last <= week) return m;
    const out = { ...m, status: "scheduled", home_score: null, away_score: null, winner_team_id: null };
    return m.kind === "regular" ? out : { ...out, home_team_id: null, away_team_id: null };
  });
}

export function formatOdds(pct: number, certain: { yes?: boolean; no?: boolean } = {}): string {
  if (certain.yes) return "100%";
  if (certain.no) return "0%";
  if (pct >= 99.5) return ">99%";
  if (pct < 0.5) return "<1%";
  return `${Math.round(pct)}%`;
}
