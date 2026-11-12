// lib/projections/project.ts
// Expected (projected) points for a player in his next game (plan item F2, agreed with Ethan
// Nov 2026 - the "full recipe"). Pure code, so it can be tested on past seasons
// (scripts/backtest-projections.ts).
//
//   expected points = points for minutes played (from his expected minutes)
//                   + his scoring rate per 80 minutes x expected minutes / 80
//                     x opponent difficulty (FDR) x home / away
//
// - Scoring rate: this season's points per 80 minutes (not counting the points for minutes),
//   mixed with a starting estimate (last season's rate, or the average for his position) until
//   he has played enough, and nudged by his last 3 games (form).
// - Expected minutes come from the team list: named to start = his usual minutes when he
//   starts; on the bench = his usual minutes off the bench; injured / out / suspended / not
//   named once the lists are out = 0. Before the lists are out: his recent average.
import { minutesPoints } from "@/lib/scoring";

export type PastGame = { round: number; minutes: number; points: number };

export type Role = "starting" | "bench" | "out" | "unknown";

export type ProjectionParams = {
  /** minutes of the starting estimate mixed in with his own rate (more = trusts his own rate later) */
  priorMinutes: number;
  /** how much his last 3 games count (0..1) */
  formWeight: number;
  /** change per FDR step from 3 (e.g. 0.04: FDR 1 = +8%, FDR 5 = -8%) */
  fdrStep: number;
  /** home +x, away -x */
  homeEdge: number;
  /** minutes for a starter / bench player we have no history for */
  startMinutes: number;
  benchMinutes: number;
};

// Tested on the 2026 season (scripts/backtest-projections.ts, 12 Nov 2026): form, FDR and
// home/away made very little difference there, so they're kept as small nudges.
export const DEFAULT_PARAMS: ProjectionParams = {
  priorMinutes: 480,
  formWeight: 0.1,
  fdrStep: 0.03,
  homeEdge: 0.02,
  startMinutes: 68,
  benchMinutes: 22,
};

/** Points from everything except minutes played, per 80 minutes. */
export function eventRate80(games: PastGame[]): { points: number; minutes: number } {
  let points = 0;
  let minutes = 0;
  for (const g of games) {
    if (g.minutes <= 0) continue;
    points += g.points - minutesPoints(g.minutes);
    minutes += g.minutes;
  }
  return { points, minutes };
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** His usual minutes for this role, from the games he's played (starts = 40+ minutes). */
export function expectedMinutes(games: PastGame[], role: Role, p: ProjectionParams = DEFAULT_PARAMS): number {
  const played = games.filter((g) => g.minutes > 0);
  if (role === "out") return 0;
  if (role === "starting") {
    const starts = played.filter((g) => g.minutes >= 40).map((g) => g.minutes);
    const m = mean(starts.slice(-6));
    return m == null ? p.startMinutes : (m * starts.length + p.startMinutes * 2) / (starts.length + 2);
  }
  if (role === "bench") {
    const subs = played.filter((g) => g.minutes < 40).map((g) => g.minutes);
    const m = mean(subs.slice(-6));
    return m == null ? p.benchMinutes : (m * subs.length + p.benchMinutes * 2) / (subs.length + 2);
  }
  // no team list yet: his recent games
  const recent = mean(played.slice(-3).map((g) => g.minutes));
  return recent ?? 0;
}

export function projectPoints(
  input: {
    /** his games this season before this one, oldest first */
    games: PastGame[];
    /** starting estimate of his scoring rate per 80 (last season, or his position's average) */
    priorRate80: number;
    role: Role;
    /** how hard this game is, 1 (easy) .. 5 (hard); null = unknown */
    fdr?: number | null;
    home?: boolean | null;
  },
  p: ProjectionParams = DEFAULT_PARAMS
): number {
  const mins = expectedMinutes(input.games, input.role, p);
  if (mins <= 0) return 0;

  const season = eventRate80(input.games);
  let rate = ((season.points * 80) / Math.max(1, season.minutes) * season.minutes + input.priorRate80 * p.priorMinutes) /
    (season.minutes + p.priorMinutes);
  const last3 = eventRate80(input.games.filter((g) => g.minutes > 0).slice(-3));
  if (last3.minutes >= 60) rate = rate * (1 - p.formWeight) + ((last3.points * 80) / last3.minutes) * p.formWeight;

  let pts = minutesPoints(Math.round(mins)) + Math.max(0, rate) * (mins / 80);
  if (input.fdr != null && Number.isFinite(input.fdr)) pts *= 1 + p.fdrStep * (3 - input.fdr);
  if (input.home != null) pts *= input.home ? 1 + p.homeEdge : 1 - p.homeEdge;
  return Math.round(pts * 10) / 10;
}
