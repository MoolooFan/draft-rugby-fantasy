// lib/draft/rules.ts
// Draft rules (pure code, no database):
// - snake order: round 1 goes 1..n, round 2 goes n..1, and so on
// - 90 seconds a pick; a team that has missed 3 picks in a row is auto-picked after 10 seconds
// - roster: 2 PR, 1 HO, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB + 5 wildcards (20). A player can fill
//   a spot for any of his positions (up to three), or a wildcard.
import { playerPositions } from "@/lib/players/positions";

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
 * True if these players can all be given a roster spot (position spots by any of their
 * positions, or a wildcard). Used to make sure a pick never breaks the position rules.
 */
export function rosterFits(players: HasPositions[]): boolean {
  if (players.length > ROSTER_SIZE) return false;
  const spots: string[] = [];
  for (const [pos, n] of Object.entries(ROSTER_SPOTS)) for (let i = 0; i < n; i++) spots.push(pos);
  for (let i = 0; i < WILDCARD_SPOTS; i++) spots.push("WC");
  const fits = players.map((p) => {
    const pos = playerPositions(p);
    return spots.map((s, i) => (s === "WC" || pos.includes(s) ? i : -1)).filter((i) => i >= 0);
  });
  const spotOwner = new Array(spots.length).fill(-1);
  const tryPlace = (p: number, seen: boolean[]): boolean => {
    for (const s of fits[p]) {
      if (seen[s]) continue;
      seen[s] = true;
      if (spotOwner[s] < 0 || tryPlace(spotOwner[s], seen)) {
        spotOwner[s] = p;
        return true;
      }
    }
    return false;
  };
  return players.every((_, p) => tryPlace(p, new Array(spots.length).fill(false)));
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
