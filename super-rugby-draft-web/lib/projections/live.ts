// lib/projections/live.ts
// Ranges, live team projections and win probability (ESPN-style bar on the Matchup page;
// Ethan, 12 Nov 2026). Pure code, used by the pages and tested on 2026
// (scripts/backtest-projections.ts).
//
// - A player's range: about half his projection to about 1.5x (6 in 10 games in 2026 landed
//   inside it).
// - Spread: how far a player's real score typically lands from his projection (2026:
//   about 5 + 0.39 x projection).
// - During the week a team's projection = real points for players whose games are over, real
//   points so far + the rest of the projection for games being played, and the projection for
//   games still to come. Auto-subs only for starters who are ruled out or didn't get on.
// - Win probability: the chance team A's final score beats team B's, from the two projections
//   and how uncertain they still are (less and less as games finish).
import { applyAutoSubs, captainUsed, STARTER_SLOTS, type Lineup } from "@/lib/scoring/week";
import { CAPTAIN_MULTIPLIER } from "@/lib/scoring";

/** Typical miss for a player with this projection (standard deviation, 2026). */
export function playerSpread(projected: number): number {
  return projected > 0 ? 5.1 + 0.39 * projected : 0;
}

/**
 * Spread before the team lists, when he may start, be on the bench or not be picked:
 * the mix of those outcomes (not being picked = 0 points), so it's wider than playerSpread.
 */
export function lineupSpread(outcomes: Array<{ chance: number; projected: number }>): number {
  let mean = 0, second = 0;
  for (const o of outcomes) {
    if (!(o.chance > 0)) continue;
    const sd = playerSpread(o.projected);
    mean += o.chance * o.projected;
    second += o.chance * (sd * sd + o.projected * o.projected);
  }
  return PRE_LIST_SPREAD_FACTOR * Math.sqrt(Math.max(0, second - mean * mean));
}

/** Before the team lists there's more we don't know (who's picked where, late changes): 2026 needed x1.35. */
export const PRE_LIST_SPREAD_FACTOR = 1.35;

/** Teams' real scores spread a little more than their players' spreads add up to (2026: x1.1). */
export const TEAM_SPREAD_FACTOR = 1.1;

/** The range shown next to a projection: roughly the middle 6 in 10 outcomes. */
export function projectionRange(projected: number): { low: number; high: number } {
  if (!(projected > 0)) return { low: 0, high: 0 };
  return { low: Math.max(0, Math.round(0.5 * projected)), high: Math.round(1.47 * projected) };
}

/** A game takes about 100 minutes from kickoff to full time (incl. half time). */
export const GAME_LENGTH_MS = 100 * 60 * 1000;
/** After this long from kickoff a game is treated as over for projections. */
export const GAME_OVER_AFTER_MS = 2 * 60 * 60 * 1000;

export type PlayerWeekState = {
  /** projected points before his game */
  projected: number;
  /** how uncertain that is (default playerSpread(projected); wider before the team lists) */
  spread?: number;
  /** real points so far this week (null = no stats yet) */
  actual: number | null;
  /** real minutes so far (0 = hasn't got on) */
  minutes: number;
  /** his game's kickoff (null = no game this week) */
  kickoffMs: number | null;
  /** ruled out before his game (injured / suspended / out / not named / bye) */
  ruledOut: boolean;
};

/** How much of his game is still to play (1 = not started, 0 = over or no game). */
export function remainingShare(s: PlayerWeekState, nowMs: number): number {
  if (s.kickoffMs == null) return 0;
  if (nowMs < s.kickoffMs) return 1;
  if (nowMs >= s.kickoffMs + GAME_OVER_AFTER_MS) return 0;
  return Math.max(0, 1 - (nowMs - s.kickoffMs) / GAME_LENGTH_MS);
}

export type TeamOutlook = {
  /** expected final score (real points so far + what's still to come) */
  expected: number;
  /** points already scored */
  scored: number;
  /** how uncertain the rest still is (variance) */
  variance: number;
  finalLineup: Lineup;
  captainUsedId: string | null;
};

/**
 * A team's expected final score right now. A starter whose game is over and who didn't get on
 * (or who is ruled out before his game) is auto-subbed by the bench, as the real scoring does.
 */
export function teamOutlook(args: {
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
  state: (playerId: string) => PlayerWeekState | null;
  nowMs: number;
}): TeamOutlook {
  const st = (id: string) => args.state(id);
  // "plays" = will or did get on the field, as far as we can tell now
  const plays = (id: string) => {
    const s = st(id);
    if (!s || s.kickoffMs == null || s.ruledOut) return (s?.minutes ?? 0) > 0;
    if (remainingShare(s, args.nowMs) === 0) return s.minutes > 0;
    return true;
  };
  const finalLineup = applyAutoSubs(args.lineup, plays);
  const cap = captainUsed(finalLineup, args.captainId, args.viceId, plays);
  let expected = 0, scored = 0, variance = 0;
  for (const slot of STARTER_SLOTS) {
    const id = finalLineup[slot]?.id;
    if (!id) continue;
    const s = st(id);
    if (!s) continue;
    const mult = id === cap ? CAPTAIN_MULTIPLIER : 1;
    const rest = plays(id) ? remainingShare(s, args.nowMs) : 0;
    const sofar = s.actual ?? 0;
    const toCome = s.projected * rest;
    scored += sofar * mult;
    expected += (sofar + toCome) * mult;
    const sd = (s.spread ?? playerSpread(s.projected)) * TEAM_SPREAD_FACTOR * Math.sqrt(rest);
    variance += (sd * mult) ** 2;
  }
  return { expected: Math.round(expected * 10) / 10, scored: Math.round(scored * 10) / 10, variance, finalLineup, captainUsedId: cap };
}

/** Standard normal cumulative probability. */
function normalCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Chance team A finishes ahead of team B (0..1). */
export function winProbability(a: { expected: number; variance: number }, b: { expected: number; variance: number }): number {
  const diff = a.expected - b.expected;
  const sd = Math.sqrt(a.variance + b.variance);
  if (sd < 1e-6) return diff > 0 ? 1 : diff < 0 ? 0 : 0.5;
  return normalCdf(diff / sd);
}
