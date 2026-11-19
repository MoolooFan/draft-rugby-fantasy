// lib/scoring/week.ts
// Scores one team's week: auto-subs, captain/vice-captain, total points and tries.
// Pure code — used by the server when a week is finalised (and can show live previews).
//
// Rules agreed with Ethan:
// - A starter who didn't get on the field (0 minutes) is replaced by a bench player who did,
//   in bench order. Players can move to their other listed position so more bench players
//   fit, but every starter who played stays in the XV.
// - The captain scores x2. The vice-captain takes the x2 only if the captain didn't play.
// - The league's squad (lib/league/squad.ts) sets the starting slots and bench (Standard: the
//   15 below + 5 bench); every function takes it, Standard if not given.
import { CAPTAIN_MULTIPLIER, STANDARD_SCORING, playerPoints, roundPoints, type ScoringRules, type StatCounts } from "@/lib/scoring";
import { STANDARD_SQUAD, slotAccepts, squadSlots, type SquadFormat } from "@/lib/league/squad";

/** A lineup slot: "prop1" ... "outsideback3", "bench1"..., or a custom squad's ("tightfive1", "forward2", ...). */
export type SlotId = string;

export const STARTER_SLOTS: SlotId[] = [
  "prop1", "hooker1", "prop2",
  "lock1", "lock2",
  "looseforward1", "looseforward2", "looseforward3",
  "halfback1", "flyhalf1",
  "centre1", "centre2",
  "outsideback1", "outsideback2", "outsideback3",
];
export const BENCH_SLOTS: SlotId[] = ["bench1", "bench2", "bench3", "bench4", "bench5"];

/** Position each Standard starting slot needs (custom squads: lib/league/squad.ts slotAccepts). */
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

/** The league's starting slots and bench (Standard if not given). */
export const startersOf = (format?: SquadFormat | null) => squadSlots(format ?? STANDARD_SQUAD).starters.map((s) => s.id);
export const benchOf = (format?: SquadFormat | null) => squadSlots(format ?? STANDARD_SQUAD).bench;

/** Put players into the starting slots by position, or null if they can't make a full team. */
function assignStarters(players: LineupPlayer[], starterSlots: string[]): Partial<Record<SlotId, LineupPlayer>> | null {
  const slots = starterSlots.map((slot) => ({
    slot,
    candidates: players.map((p, i) => ({ p, i })).filter(({ p }) => slotAccepts(slot, p)),
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
export function applyAutoSubs(lineup: Lineup, played: (playerId: string) => boolean, format?: SquadFormat | null): Lineup {
  const starterSlots = startersOf(format);
  const benchSlots = benchOf(format);
  const starters = starterSlots.map((s) => lineup[s]).filter((p): p is LineupPlayer => !!p?.id);
  const bench = benchSlots.map((s) => lineup[s]).filter((p): p is LineupPlayer => !!p?.id);

  const playedStarters = starters.filter((p) => played(p.id));
  const dnpStarters = starters.filter((p) => !played(p.id));
  const usableBench = bench.filter((p) => played(p.id) && !starters.some((s) => s.id === p.id));
  if (!dnpStarters.length || !usableBench.length) return { ...lineup };

  const size = starterSlots.length;
  if (playedStarters.length + dnpStarters.length + usableBench.length < size) return { ...lineup };
  const dnpIds = new Set(dnpStarters.map((p) => p.id));

  // Best team: most bench players used; ties go to the higher bench order; then fewest non-players.
  // Every starter who played stays, so only the other places are chosen (from the non-players
  // and the bench players who played).
  const optional = [...dnpStarters, ...usableBench];
  const open = size - playedStarters.length;
  let best: { combo: LineupPlayer[]; count: number; vector: number[]; dnp: number } | null = null;
  for (const extra of combinations(optional, Math.max(0, open))) {
    const combo = [...playedStarters, ...extra];
    const ids = new Set(combo.map((p) => p.id));
    if (!assignStarters(combo, starterSlots)) continue;
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

  const xv = assignStarters(best.combo, starterSlots)!;
  const inXv = new Set(Object.values(xv).map((p) => p!.id));
  const rest = [...bench, ...starters].filter((p, i, arr) => !inXv.has(p.id) && arr.findIndex((x) => x.id === p.id) === i);
  const out: Lineup = { ...xv };
  benchSlots.forEach((slot, i) => (out[slot] = rest[i] ?? null));
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
export function captainUsed(finalLineup: Lineup, captainId: string | null, viceId: string | null, played: (id: string) => boolean, format?: SquadFormat | null): string | null {
  const xv = new Set(startersOf(format).map((s) => finalLineup[s]?.id).filter(Boolean) as string[]);
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
  /** The league's squad (Standard if not given). */
  format?: SquadFormat | null;
}): WeekScore {
  const rules = args.rules ?? STANDARD_SCORING;
  const played = (id: string) => Number(args.statsFor(id)?.minutesPlayed ?? 0) > 0;
  const finalLineup = applyAutoSubs(args.lineup, played, args.format);
  const cap = captainUsed(finalLineup, args.captainId, args.viceId, played, args.format);

  const playerPointsMap: Record<string, number> = {};
  let score = 0;
  let tries = 0;
  for (const slot of startersOf(args.format)) {
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
