// lib/projections/project.ts
// Expected (projected) points for a player in his next game (plan item F2, agreed with Ethan
// Nov 2026). Pure code, so it can be tested on past seasons (scripts/backtest-projections.ts).
//
//   expected points = points for minutes played (from his expected minutes)
//                   + his scoring rate per 80 minutes x expected minutes / 80
//                     x how weak the opponent is, for his position
//                     x opponent difficulty (FDR) x home / away
//                   + goal-kicking points, if he's the team's kicker this week
//
// What goes in (each part tested on 2026, 12 Nov 2026):
// - Scoring rate, stat by stat: this season's points per 80 minutes for each stat, mixed with
//   a starting estimate (seasonPrior: his position's average scaled by his draft rank - Ethan's
//   rank of how good he is - and his own numbers last season if he played). Steady stats (lineouts,
//   turnovers) trust his own numbers quickly; streaky ones (tries, line breaks, try assists,
//   errors, penalties, cards) lean on the starting estimate for longer (TRUST_MINUTES).
// - Form: his last 3 games count a little (10%).
// - Minutes: from the team list. Named to start = his usual minutes when he starts; on the
//   bench = his usual minutes off the bench; with little history, his position's usual
//   minutes (props ~53, outside backs ~74). Injured / suspended / out / not named = 0.
// - Opponent: outside backs, centres and the front row score more against teams that leak
//   points (tries, line breaks); locks, loose forwards and halves hardly change.
// - Lineouts: a hooker throws more lineout errors against a team that steals a lot of
//   lineouts (2026, checked against super.rugby's set-piece numbers Ethan sent).
// - Goal kicking: worked out per team. The kicker is the first player in the team's kicking
//   order who is playing (so a back-up 10 takes the points when the first-choice kicker is
//   out). His points come from how many tries his team is expected to score against this
//   opponent (more conversions in a blowout), the team's usual penalty shots, and his own
//   success rate.
// - Ethan's notes for the start of a season (admin page): expected role (starter / bench /
//   squad) and goal kicker (1st / 2nd choice), e.g. a player who moved team. They count like an
//   extra team list / kicking record from before round 1, so real ones take over within a few rounds.
// - Uses the league's own scoring rules (Standard, Alternate or Custom).
// Tested and left out (2026): travel, short turnarounds, the week after a bye, first game back
// from injury, blowouts cutting starters' minutes, key teammates missing, opponent discipline
// (penalty shots), team-specific home advantage.
import {
  CAPTAIN_MULTIPLIER, STANDARD_SCORING, STATS, minutesPoints, statPoints,
  type EventStatKey, type ScoringRules, type StatCounts,
} from "@/lib/scoring";
import { applyAutoSubs, captainUsed, STARTER_SLOTS, type Lineup } from "@/lib/scoring/week";

/** One past game: what the team list said (if known) and his stats. */
export type PastGame = { round: number; counts: StatCounts; listed?: "starting" | "bench" | null };

export type Role = "starting" | "bench" | "out" | "unknown";

/** Points per 80 minutes for each stat (under one set of scoring rules). */
export type StatRates = Partial<Record<EventStatKey, number>>;

export const KICKING_STATS: EventStatKey[] = [
  "conversions", "conversionsMissed", "penaltyGoals", "penaltyGoalsMissed", "dropGoals", "dropGoalsMissed",
];
const EVENT_STATS = STATS.map((s) => s.key).filter((k) => k !== "minutesPlayed") as EventStatKey[];
/** Every stat except goal kicking (that's projected separately, per team). */
export const PLAY_STATS: EventStatKey[] = EVENT_STATS.filter((k) => !KICKING_STATS.includes(k));

/**
 * How many minutes of the starting estimate each stat is mixed with (more = streakier stat,
 * so a player's own numbers take longer to trust). From how well each stat in odd rounds
 * predicted the same stat in even rounds, 2026.
 */
export const TRUST_MINUTES: Record<EventStatKey, number> = {
  // steady: lineouts, lineout steals, turnovers
  lineoutsWon: 150, lineoutSteals: 150, turnoversForced: 150,
  // in between
  metresGained: 500, defendersBeaten: 500, scrumsWon: 500, lineBreakAssists: 500, offloads: 500, lineoutErrors: 500,
  // streaky
  tries: 1000, lineBreaks: 1000, tackles: 1000, tacklesMissed: 1000,
  // mostly luck
  tryAssists: 3000, errors: 3000, penaltiesConceded: 3000, interceptions: 3000, fiftyTwentyTwos: 3000,
  yellowCards: 3000, redCards: 3000,
  // goal kicking (not used here - see kickingPoints)
  conversions: 100, conversionsMissed: 100, penaltyGoals: 100, penaltyGoalsMissed: 100, dropGoals: 3000, dropGoalsMissed: 3000,
};

/** Usual minutes by position when named to start / on the bench (2026 team lists). */
export const POSITION_MINUTES: Record<string, { start: number; bench: number }> = {
  PR: { start: 53, bench: 27 }, HO: { start: 56, bench: 24 }, LK: { start: 70, bench: 23 }, LF: { start: 69, bench: 26 },
  HB: { start: 61, bench: 22 }, FH: { start: 69, bench: 20 }, CE: { start: 72, bench: 23 }, OB: { start: 74, bench: 30 },
};

/**
 * Change in a position's scoring for each 10 points the opponent is weaker than average
 * (2026: outside backs ~+7 pts per 80, centres and front row ~+3; others about nothing).
 */
export const OPPONENT_EFFECT: Record<string, number> = { OB: 0.2, CE: 0.1, PR: 0.1, HO: 0.1 };

export type ProjectionParams = {
  /** how much his last 3 games count (0..1) */
  formWeight: number;
  /** change per FDR step from 3 (0.03: FDR 1 = +6%, FDR 5 = -6%) */
  fdrStep: number;
  /** home +x, away -x */
  homeEdge: number;
  trustMinutes: Record<EventStatKey, number>;
  opponentEffect: Record<string, number>;
  positionMinutes: Record<string, { start: number; bench: number }>;
};

export const DEFAULT_PARAMS: ProjectionParams = {
  formWeight: 0.1,
  fdrStep: 0.03,
  homeEdge: 0.02,
  trustMinutes: TRUST_MINUTES,
  opponentEffect: OPPONENT_EFFECT,
  positionMinutes: POSITION_MINUTES,
};

const minutesOf = (g: PastGame) => Number(g.counts.minutesPlayed) || 0;
const playedGames = (games: PastGame[]) => games.filter((g) => minutesOf(g) > 0);

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Each stat's points over these games (games he played), and the minutes. */
export function statTotals(games: PastGame[], frontRow: boolean, rules: ScoringRules = STANDARD_SCORING) {
  const points: StatRates = {};
  let minutes = 0;
  for (const g of playedGames(games)) {
    minutes += minutesOf(g);
    for (const k of EVENT_STATS) {
      const n = Number(g.counts[k]) || 0;
      if (n) points[k] = (points[k] ?? 0) + statPoints(k, n, frontRow, rules);
    }
  }
  return { points, minutes };
}

/** Average points per 80 for each stat over a group of players (e.g. everyone in one position). */
export function averageRates(group: Array<{ games: PastGame[]; frontRow: boolean }>, rules: ScoringRules = STANDARD_SCORING): StatRates {
  const sum: StatRates = {};
  let minutes = 0;
  for (const p of group) {
    const t = statTotals(p.games, p.frontRow, rules);
    minutes += t.minutes;
    for (const [k, v] of Object.entries(t.points)) sum[k as EventStatKey] = (sum[k as EventStatKey] ?? 0) + (v as number);
  }
  const out: StatRates = {};
  if (!minutes) return out;
  for (const [k, v] of Object.entries(sum)) out[k as EventStatKey] = ((v as number) * 80) / minutes;
  return out;
}

/**
 * How a player's draft rank scales his position's average (2026: rank 1 ~1.47x, rank 10 ~1.24x,
 * rank 100 ~1.0x, rank 300 ~0.9x; the same from round 3 to round 10). No rank = 1.
 */
export function rankMultiplier(draftRank: number | null | undefined): number {
  if (!draftRank || draftRank >= 9999 || draftRank < 1) return 1;
  return Math.min(1.6, Math.max(0.6, 1 - 0.1 * (Math.log(draftRank) - 4.75)));
}

/**
 * His starting estimate, stat by stat: his position's average x rankMultiplier (not for goal
 * kicking), then his own numbers last season mixed in (same trust per stat as this season).
 */
export function seasonPrior(
  positionAverage: StatRates, draftRank: number | null | undefined,
  lastSeason: { games: PastGame[]; frontRow: boolean } | null = null,
  rules: ScoringRules = STANDARD_SCORING, p: ProjectionParams = DEFAULT_PARAMS
): StatRates {
  const mult = rankMultiplier(draftRank);
  const base: StatRates = {};
  for (const [k, v] of Object.entries(positionAverage)) {
    base[k as EventStatKey] = KICKING_STATS.includes(k as EventStatKey) ? (v as number) : (v as number) * mult;
  }
  if (!lastSeason) return base;
  const own = statTotals(lastSeason.games, lastSeason.frontRow, rules);
  if (!own.minutes) return base;
  const out: StatRates = { ...base };
  for (const k of PLAY_STATS) {
    const trust = p.trustMinutes[k];
    out[k] = ((own.points[k] ?? 0) * 80 + (base[k] ?? 0) * trust) / (own.minutes + trust);
  }
  return out;
}

/** His usual minutes for this role (a start = named to start, or 40+ minutes if the list isn't known). */
export function expectedMinutes(games: PastGame[], role: Role, pos: string, p: ProjectionParams = DEFAULT_PARAMS): number {
  if (role === "out") return 0;
  const played = playedGames(games);
  const isStart = (g: PastGame) => (g.listed ? g.listed === "starting" : minutesOf(g) >= 40);
  const usual = p.positionMinutes[pos] ?? { start: 68, bench: 22 };
  if (role === "starting" || role === "bench") {
    const own = played.filter((g) => isStart(g) === (role === "starting")).map(minutesOf);
    const m = mean(own.slice(-6));
    const fallback = role === "starting" ? usual.start : usual.bench;
    return m == null ? fallback : (m * own.length + fallback * 2) / (own.length + 2);
  }
  // no team list yet: his recent games
  return mean(played.slice(-3).map(minutesOf)) ?? 0;
}

/** His scoring rate per 80 minutes (not counting minutes played or goal kicking). */
export function scoringRate80(
  games: PastGame[], frontRow: boolean, prior: StatRates, rules: ScoringRules = STANDARD_SCORING, p: ProjectionParams = DEFAULT_PARAMS,
  opp: { pos?: string; opponentSteals?: number | null } = {}
): number {
  const own = statTotals(games, frontRow, rules);
  let rate = 0;
  for (const k of PLAY_STATS) {
    const trust = p.trustMinutes[k];
    let r = ((own.points[k] ?? 0) * 80 + (prior[k] ?? 0) * trust) / (own.minutes + trust);
    // hookers: more lineout errors against a team that steals a lot
    if (k === "lineoutErrors" && opp.pos === "HO" && opp.opponentSteals != null) r *= opp.opponentSteals;
    rate += r;
  }
  // form: his last 3 games
  const last3 = statTotals(playedGames(games).slice(-3), frontRow, rules);
  if (last3.minutes >= 60) {
    const recent = PLAY_STATS.reduce((a, k) => a + (last3.points[k] ?? 0), 0);
    rate = rate * (1 - p.formWeight) + ((recent * 80) / last3.minutes) * p.formWeight;
  }
  return rate;
}

export type PlayerInput = {
  /** his games this season before this one, oldest first */
  games: PastGame[];
  /** his games last season (for his usual minutes early in a new season) */
  lastSeasonGames?: PastGame[] | null;
  pos: string;
  /** gets scrum points (props and hookers, under Standard) */
  frontRow: boolean;
  /** starting estimate of his rate per 80, stat by stat (last season, or his position's average) */
  prior: StatRates;
  role: Role;
  /** how hard this game is, 1 (easy) .. 5 (hard); null = unknown */
  fdr?: number | null;
  home?: boolean | null;
  /** how much weaker than average the opponent is, in points per game (+ = weaker); see opponentWeakness */
  opponentWeakness?: number | null;
  /** the opponent's lineout steals per game ÷ the league average (1 = average); see lineoutStealFactor */
  opponentSteals?: number | null;
  /** his goal-kicking points over a full game, if he's the team's kicker this week (see kickingPoints) */
  kicking?: number | null;
  rules?: ScoringRules;
};

export function projectPoints(input: PlayerInput, p: ProjectionParams = DEFAULT_PARAMS): number {
  const rules = input.rules ?? STANDARD_SCORING;
  const mins = expectedMinutes([...(input.lastSeasonGames ?? []), ...input.games], input.role, input.pos, p);
  if (mins <= 0) return 0;

  let play = Math.max(0, scoringRate80(input.games, input.frontRow, input.prior, rules, p, input)) * (mins / 80);
  if (input.opponentWeakness != null) play *= Math.max(0.5, 1 + (p.opponentEffect[input.pos] ?? 0) * (input.opponentWeakness / 10));

  let pts = minutesPoints(Math.round(mins), rules) + play;
  if (input.fdr != null && Number.isFinite(input.fdr)) pts *= 1 + p.fdrStep * (3 - input.fdr);
  if (input.home != null) pts *= input.home ? 1 + p.homeEdge : 1 - p.homeEdge;
  if (input.kicking && input.role !== "bench") pts += input.kicking * Math.min(1, mins / 80);
  return Math.round(pts * 10) / 10;
}

// ---------------------------------------------------------------------------
// Teams: how strong they are, and their goal kicking

/** One of a real team's past games: score, and its tries, penalty-goal attempts and lineout steals (from player stats). */
export type TeamGame = { round: number; pointsFor: number; pointsAgainst: number; tries: number; penaltyShots: number; lineoutSteals?: number };

export type TeamStrength = { pointsFor: number; pointsAgainst: number; triesPerGame: number; penaltyShotsPerGame: number; stealsPerGame: number };

/** League-wide averages (2026, per team per game) used as the starting estimate before a team has played much. */
export const LEAGUE_AVERAGE = { points: 28.8, tries: 3.8, penaltyShots: 1.5, lineoutSteals: 1.38 };

/** A team's usual points for and against, tries and penalty shots per game, mixed with the league average (worth 3 games). */
export function teamStrength(games: TeamGame[], avg = LEAGUE_AVERAGE, priorGames = 3): TeamStrength {
  const n = games.length;
  const mix = (sum: number, prior: number) => (sum + prior * priorGames) / (n + priorGames);
  return {
    pointsFor: mix(games.reduce((a, g) => a + g.pointsFor, 0), avg.points),
    pointsAgainst: mix(games.reduce((a, g) => a + g.pointsAgainst, 0), avg.points),
    triesPerGame: mix(games.reduce((a, g) => a + g.tries, 0), avg.tries),
    penaltyShotsPerGame: mix(games.reduce((a, g) => a + g.penaltyShots, 0), avg.penaltyShots),
    stealsPerGame: mix(games.reduce((a, g) => a + (g.lineoutSteals ?? avg.lineoutSteals), 0), avg.lineoutSteals),
  };
}

/** How much more than average a team steals lineouts (1 = average). */
export function lineoutStealFactor(opp: TeamStrength, avg = LEAGUE_AVERAGE): number {
  return opp.stealsPerGame / avg.lineoutSteals;
}

/** How much weaker than average a team is, in points per game (+ = concedes more than it scores). */
export function opponentWeakness(opp: TeamStrength): number {
  return (opp.pointsAgainst - opp.pointsFor) / 2;
}

const goalShots = (c: StatCounts) =>
  (Number(c.conversions) || 0) + (Number(c.conversionsMissed) || 0) + (Number(c.penaltyGoals) || 0) + (Number(c.penaltyGoalsMissed) || 0);

/** How many games of Ethan's kicker note count as (first choice = all the shots, second = half). */
const KICK_NOTE_GAMES = 2;

/**
 * A team's kicking order: players by their share of the team's goal-kicking shots in the games
 * THEY played (his recent games count most: each game back 0.8 as much). Games he missed don't
 * count, so a first-choice kicker who's injured keeps his place while someone covers (Ethan,
 * 12 Nov 2026); he only drops if he plays and someone else kicks. Ethan's note counts as games
 * from before round 1. Players who've never taken a shot (and have no note) aren't listed.
 */
export function kickingOrder(
  teamPlayers: Array<{ id: string; games: PastGame[]; /** Ethan's note: 1st / 2nd choice kicker */ kickOrder?: number | null }>,
  beforeRound: number
): string[] {
  const teamShots = new Map<number, number>();
  for (const pl of teamPlayers) {
    for (const g of pl.games) if (g.round < beforeRound) teamShots.set(g.round, (teamShots.get(g.round) ?? 0) + goalShots(g.counts));
  }
  const score = teamPlayers.map((pl) => {
    const played = playedGames(pl.games).filter((g) => g.round < beforeRound).sort((a, b) => a.round - b.round);
    let w = 1, sum = 0, weight = 0, anyShot = false;
    for (let i = played.length - 1; i >= 0; i--) {
      const team = teamShots.get(played[i].round) ?? 0;
      if (!team) continue; // no shots at goal that game: tells us nothing
      const mine = goalShots(played[i].counts);
      if (mine) anyShot = true;
      sum += w * (mine / team);
      weight += w;
      w *= 0.8;
    }
    if (pl.kickOrder === 1 || pl.kickOrder === 2) {
      anyShot = true;
      for (let k = 0; k < KICK_NOTE_GAMES; k++, w *= 0.8) {
        sum += w * (pl.kickOrder === 1 ? 1 : 0.5);
        weight += w;
      }
    }
    // +1 game of "no kicks" so one lucky game doesn't make someone first choice
    return { id: pl.id, s: anyShot ? sum / (weight + 1) : 0 };
  });
  return score.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.id);
}

/** This week's kicker: the first in the kicking order who is playing (starting, once the lists are out). */
export function dutyKicker(order: string[], playing: (id: string) => boolean): string | null {
  return order.find(playing) ?? null;
}

/**
 * The kicker's goal-kicking points over a full game: conversions of the tries his team is
 * expected to score against this opponent, plus the team's usual penalty shots, at his own
 * success rate (mixed with the league's: 75% conversions, 78% penalties).
 */
export function kickingPoints(
  kickerGames: PastGame[], team: TeamStrength, opponent: TeamStrength, rules: ScoringRules = STANDARD_SCORING, avg = LEAGUE_AVERAGE
): number {
  let cm = 0, ca = 0, pm = 0, pa = 0;
  for (const g of kickerGames) {
    const c = g.counts;
    cm += Number(c.conversions) || 0;
    ca += (Number(c.conversions) || 0) + (Number(c.conversionsMissed) || 0);
    pm += Number(c.penaltyGoals) || 0;
    pa += (Number(c.penaltyGoals) || 0) + (Number(c.penaltyGoalsMissed) || 0);
  }
  const conv = (cm + 0.75 * 8) / (ca + 8);
  const pen = (pm + 0.78 * 6) / (pa + 6);
  const tries = team.triesPerGame * (opponent.pointsAgainst / avg.points);
  const e = rules.perEvent;
  return tries * (conv * e.conversions + (1 - conv) * e.conversionsMissed) +
    team.penaltyShotsPerGame * (pen * e.penaltyGoals + (1 - pen) * e.penaltyGoalsMissed);
}

// ---------------------------------------------------------------------------
// Before the team lists are out: an expected lineup (Ethan, 12 Nov 2026)
//
// Each player's chance of starting / being on the bench, from his recent team lists (the most
// recent count most; weeks he was injured or out don't count against him). The projection is
// then the mix: P(start) x his starting projection + P(bench) x his bench projection.
// A player whose status says injured, suspended or out stays on 0 until Ethan (or the injury
// list) removes it. Once the lists are out, his real role is used instead.

/** What a team list said about a player in an earlier round ("none" = his team didn't play). */
export type ListRole = "starting" | "bench" | "out" | "notNamed" | "none";

export type RoleChances = { start: number; bench: number };

export type LineupParams = {
  /** how many recent team lists count, and how quickly older ones fade (weight per step back) */
  lookback: number;
  fade: number;
};

export const DEFAULT_LINEUP_PARAMS: LineupParams = { lookback: 4, fade: 0.6 }; // tested on 2026 (12 Nov)

/** Ethan's start-of-season note on a player's role. */
export type RoleNote = "starter" | "bench" | "squad";

/**
 * His chances of starting / being on the bench this week, from his last few team lists (oldest
 * first). Ethan's role note counts as one more list from before round 1 (squad = not named).
 */
export function expectedRole(history: ListRole[], lp: LineupParams = DEFAULT_LINEUP_PARAMS, note: RoleNote | null = null): RoleChances {
  const before: ListRole[] = note === "starter" ? ["starting"] : note === "bench" ? ["bench"] : note === "squad" ? ["notNamed"] : [];
  const lists = [...before, ...history].filter((r) => r !== "none");
  const recent = lists.slice(-lp.lookback);
  let w = 1, total = 0, start = 0, bench = 0;
  for (let i = recent.length - 1; i >= 0; i--, w *= lp.fade) {
    const r = recent[i];
    if (r === "out") continue;
    total += w;
    if (r === "starting") start += w;
    else if (r === "bench") bench += w;
  }
  return total ? { start: start / total, bench: bench / total } : { start: 0, bench: 0 };
}

/** Expected points before the team lists: his starting and bench projections mixed by his chances. */
export function projectPointsExpectedLineup(
  input: Omit<PlayerInput, "role"> & { chances: RoleChances },
  p: ProjectionParams = DEFAULT_PARAMS
): number {
  const { chances, ...rest } = input;
  const start = chances.start ? projectPoints({ ...rest, role: "starting" }, p) : 0;
  const bench = chances.bench ? projectPoints({ ...rest, role: "bench" }, p) : 0;
  return Math.round((chances.start * start + chances.bench * bench) * 10) / 10;
}

// ---------------------------------------------------------------------------
// A fantasy team's projected score

/**
 * The team's projected score: its 15 starters' projections, captain x2. Auto-subs only come
 * in for starters who are ruled out (injured / suspended / out, not named once the lists are
 * out, or a bye) - otherwise bench points don't count (Ethan, 12 Nov 2026). The vice takes
 * the x2 if the captain is ruled out.
 */
export function projectTeamScore(args: {
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
  projection: (playerId: string) => number;
  ruledOut: (playerId: string) => boolean;
}): { total: number; finalLineup: Lineup; captainUsedId: string | null } {
  const playing = (id: string) => !args.ruledOut(id);
  const finalLineup = applyAutoSubs(args.lineup, playing);
  const cap = captainUsed(finalLineup, args.captainId, args.viceId, playing);
  let total = 0;
  for (const slot of STARTER_SLOTS) {
    const id = finalLineup[slot]?.id;
    if (!id || !playing(id)) continue;
    const v = args.projection(id);
    total += id === cap ? v * CAPTAIN_MULTIPLIER : v;
  }
  return { total: Math.round(total * 10) / 10, finalLineup, captainUsedId: cap };
}
