// lib/scoring/week.ts
// Scores one team's week: auto-subs, captain/vice-captain, total points and tries.
// Pure code — used by the server when a week is finalised (and can show live previews).
//
// Rules agreed with Ethan:
// - A starter who didn't get on the field (0 minutes) is replaced by a bench player who did,
//   in bench order. Players can move to their other listed position so more bench players
//   fit, but every starter who played stays in the XV.
// - The captain scores x2. The vice-captain takes the x2 only if the captain didn't play.
import { CAPTAIN_MULTIPLIER, STANDARD_SCORING, playerPoints, roundPoints, type ScoringRules, type StatCounts } from "@/lib/scoring";
import { canPlayPosition } from "@/lib/players/positions";

export type SlotId =
  | "prop1" | "hooker1" | "prop2"
  | "lock1" | "lock2"
  | "looseforward1" | "looseforward2" | "looseforward3"
  | "halfback1" | "flyhalf1"
  | "centre1" | "centre2"
  | "outsideback1" | "outsideback2" | "outsideback3"
  | "bench1" | "bench2" | "bench3" | "bench4" | "bench5";

export const STARTER_SLOTS: SlotId[] = [
  "prop1", "hooker1", "prop2",
  "lock1", "lock2",
  "looseforward1", "looseforward2", "looseforward3",
  "halfback1", "flyhalf1",
  "centre1", "centre2",
  "outsideback1", "outsideback2", "outsideback3",
];
export const BENCH_SLOTS: SlotId[] = ["bench1", "bench2", "bench3", "bench4", "bench5"];

/** Position each starting slot needs. */
export const SLOT_POSITION: Record<string, string> = {
  prop1: "PR", hooker1: "HO", prop2: "PR",
  lock1: "LK", lock2: "LK",
  looseforward1: "LF", looseforward2: "LF", looseforward3: "LF",
  halfback1: "HB", flyhalf1: "FH",
  centre1: "CE", centre2: "CE",
  outsideback1: "OB", outsideback2: "OB", outsideback3: "OB",
};

export type LineupPlayer = { id: string; posAbbrev?: string | null; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null; [k: string]: unknown };
export type Lineup = Partial<Record<SlotId, LineupPlayer | null>>;

function canPlay(p: LineupPlayer, pos: string): boolean {
  return canPlayPosition(p, pos);
}

/** Put 15 players into the starting slots by position, or null if they can't make a valid XV. */
function assignStarters(players: LineupPlayer[]): Partial<Record<SlotId, LineupPlayer>> | null {
  const slots = STARTER_SLOTS.map((slot) => ({
    slot,
    candidates: players.map((p, i) => ({ p, i })).filter(({ p }) => canPlay(p, SLOT_POSITION[slot])),
  })).sort((a, b) => a.candidates.length - b.candidates.length);
  const used = new Array(players.length).fill(false);
  const out: Partial<Record<SlotId, LineupPlayer>> = {};
  const dfs = (k: number): boolean => {
    if (k >= slots.length) return true;
    for (const c of slots[k].candidates) {
      if (used[c.i]) continue;
      used[c.i] = true;
      out[slots[k].slot] = c.p;
      if (dfs(k + 1)) return true;
      used[c.i] = false;
      delete out[slots[k].slot];
    }
    return false;
  };
  return dfs(0) ? out : null;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const out: T[][] = [];
  const cur: T[] = [];
  const go = (start: number) => {
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = start; i <= arr.length - (k - cur.length); i++) { cur.push(arr[i]); go(i + 1); cur.pop(); }
  };
  go(0);
  return out;
}

/**
 * Auto-subs. played(id) = the player got on the field this week.
 * Returns the final lineup (starters may be reshuffled; bench holds whoever didn't make the XV).
 */
export function applyAutoSubs(lineup: Lineup, played: (playerId: string) => boolean): Lineup {
  const starters = STARTER_SLOTS.map((s) => lineup[s]).filter((p): p is LineupPlayer => !!p?.id);
  const bench = BENCH_SLOTS.map((s) => lineup[s]).filter((p): p is LineupPlayer => !!p?.id);

  const playedStarters = starters.filter((p) => played(p.id));
  const dnpStarters = starters.filter((p) => !played(p.id));
  const usableBench = bench.filter((p) => played(p.id) && !starters.some((s) => s.id === p.id));
  if (!dnpStarters.length || !usableBench.length) return { ...lineup };

  const pool = [...playedStarters, ...dnpStarters, ...usableBench];
  if (pool.length < 15) return { ...lineup };
  const mustKeep = new Set(playedStarters.map((p) => p.id));
  const dnpIds = new Set(dnpStarters.map((p) => p.id));

  // Best XV: most bench players used; ties go to the higher bench order; then fewest non-players.
  let best: { combo: LineupPlayer[]; count: number; vector: number[]; dnp: number } | null = null;
  for (const combo of combinations(pool, 15)) {
    const ids = new Set(combo.map((p) => p.id));
    if ([...mustKeep].some((id) => !ids.has(id))) continue;
    if (!assignStarters(combo)) continue;
    const vector: number[] = usableBench.map((p) => (ids.has(p.id) ? 1 : 0));
    const count = vector.reduce((a, b) => a + b, 0);
    const dnp = combo.filter((p) => dnpIds.has(p.id)).length;
    const better =
      !best ||
      count > best.count ||
      (count === best.count && compareVectors(vector, best.vector) > 0) ||
      (count === best.count && compareVectors(vector, best.vector) === 0 && dnp < best.dnp);
    if (better) best = { combo, count, vector, dnp };
  }
  if (!best || best.count === 0) return { ...lineup };

  const xv = assignStarters(best.combo)!;
  const inXv = new Set(Object.values(xv).map((p) => p!.id));
  const rest = [...bench, ...starters].filter((p, i, arr) => !inXv.has(p.id) && arr.findIndex((x) => x.id === p.id) === i);
  const out: Lineup = { ...xv };
  BENCH_SLOTS.forEach((slot, i) => (out[slot] = rest[i] ?? null));
  return out;
}

function compareVectors(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Who gets the x2: the captain if he played in the final XV, otherwise the vice if he did, else nobody. */
export function captainUsed(finalLineup: Lineup, captainId: string | null, viceId: string | null, played: (id: string) => boolean): string | null {
  const xv = new Set(STARTER_SLOTS.map((s) => finalLineup[s]?.id).filter(Boolean) as string[]);
  if (captainId && xv.has(captainId) && played(captainId)) return captainId;
  if (viceId && xv.has(viceId) && played(viceId)) return viceId;
  return null;
}

export type WeekScore = {
  finalLineup: Lineup;
  captainUsedId: string | null;
  /** Starter id -> points (before the captain's x2). */
  playerPoints: Record<string, number>;
  score: number;
  tries: number;
};

/**
 * Score a team's week. statsFor(id) returns the player's stat counts for the week (all real
 * rounds in it added together), or null if he has no stats. frontRow(id): prop/hooker?
 */
export function scoreTeamWeek(args: {
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
  statsFor: (playerId: string) => StatCounts | null;
  frontRow: (playerId: string) => boolean;
  rules?: ScoringRules;
}): WeekScore {
  const rules = args.rules ?? STANDARD_SCORING;
  const played = (id: string) => Number(args.statsFor(id)?.minutesPlayed ?? 0) > 0;
  const finalLineup = applyAutoSubs(args.lineup, played);
  const cap = captainUsed(finalLineup, args.captainId, args.viceId, played);

  const playerPointsMap: Record<string, number> = {};
  let score = 0;
  let tries = 0;
  for (const slot of STARTER_SLOTS) {
    const p = finalLineup[slot];
    if (!p?.id) continue;
    const counts = args.statsFor(p.id);
    const pts = counts ? playerPoints(counts, args.frontRow(p.id), rules) : 0;
    playerPointsMap[p.id] = pts;
    score += p.id === cap ? pts * CAPTAIN_MULTIPLIER : pts;
    tries += counts ? Number(counts.tries ?? 0) : 0;
  }
  return { finalLineup, captainUsedId: cap, playerPoints: playerPointsMap, score: roundPoints(score), tries };
}
