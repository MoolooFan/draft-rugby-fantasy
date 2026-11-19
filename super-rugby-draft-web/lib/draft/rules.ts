// lib/draft/rules.ts
// Draft rules (pure code, no database):
// - snake order: round 1 goes 1..n, round 2 goes n..1, and so on
// - 90 seconds a pick; a team that has missed 3 picks in a row is auto-picked after 10 seconds
// - roster (Standard): 2 PR, 1 HO, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB + 5 wildcards (20). A player
//   can fill a spot for any of his positions (up to three), or a wildcard. A league can set its
//   own squad (lib/league/squad.ts): its starting spots + its bench.
import { STANDARD_SQUAD, squadFits, squadStartingGaps, type SquadFormat } from "@/lib/league/squad";

export const ROSTER_SPOTS: Record<string, number> = { PR: 2, HO: 1, LK: 2, LF: 3, HB: 1, FH: 1, CE: 2, OB: 3 };
export const WILDCARD_SPOTS = 5;
export const ROSTER_SIZE = Object.values(ROSTER_SPOTS).reduce((a, b) => a + b, 0) + WILDCARD_SPOTS;
export const PICK_SECONDS = 90;
export const FAST_PICK_SECONDS = 10;
export const MISSES_BEFORE_FAST = 3;

/** Which team picks at overall pick number `pick` (1-based), in snake order. */
export function teamForPick(order: string[], pick: number): string | null {
  const n = order.length;
  if (!n || pick < 1) return null;
  const round = Math.ceil(pick / n);
  const i = (pick - 1) % n;
  return round % 2 === 1 ? order[i] : order[n - 1 - i];
}

export function roundForPick(teamCount: number, pick: number): number {
  return Math.ceil(pick / Math.max(1, teamCount));
}

/** Seconds a team gets for its pick. */
export function secondsForTeam(missedInRow: number): number {
  return missedInRow >= MISSES_BEFORE_FAST ? FAST_PICK_SECONDS : PICK_SECONDS;
}

type HasPositions = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null };

/**
 * True if these players can all be given a roster spot (starting spots by any of their
 * positions, or the bench). Used to make sure a pick never breaks the position rules.
 * format = the league's squad (lib/league/squad.ts); Standard if not given.
 */
export function rosterFits(players: HasPositions[], format?: SquadFormat | null): boolean {
  return squadFits(players, format ?? STANDARD_SQUAD);
}

/**
 * How many of the starting spots (Standard: 2 PR, 1 HO, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB)
 * these players can't fill between them. 0 = a full team is possible.
 */
export function startingGaps(players: HasPositions[], format?: SquadFormat | null): number {
  return squadStartingGaps(players, format ?? STANDARD_SQUAD);
}

/** Shuffle (for the random draft order). */
export function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
