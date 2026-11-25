// lib/draft/cpu.ts
// How the computer teams pick in a mock draft (Ethan, 21 Nov 2026). They shouldn't just take
// the top Draft Rank, they should build a balanced team, and positions are worth different
// amounts. Pure code (browser + tests).
//
// 1. A player's value: his Draft Rank on a curve (rank 1 is worth a lot more than rank 20, rank
//    200 and 220 are nearly the same), blended with his points per game last season when he
//    played enough.
// 2. Positions: some positions score more than others (from last season's points of the players
//    good enough to start), and some run out sooner. Each position's "replacement" is the best
//    player left once every team has filled its starting spots there; a player's worth is how
//    far above that he is (so the 3rd-best hooker can be worth more than the 15th-best outside
//    back with a better rank), plus some of his raw value.
// 3. Each pick: only players who keep the roster legal. A player who fills an empty starting
//    spot counts in full; bench depth counts for less while starting spots are still open (less
//    so as the draft goes on), and stacking one position past what the team needs counts for
//    less again.
// 4. Each computer team has a personality: a favourite position, one it rates lower, and how
//    much it goes with its gut (random noise), so the same draft doesn't happen twice.
import { assignToSlots, rosterSize, squadFits, squadStartingGaps, STANDARD_SQUAD, type SquadFormat } from "@/lib/league/squad";
import { playerPositions } from "@/lib/players/positions";
import { STRATEGY_POSITIONS, type StrategyPos } from "@/lib/draft/strategy";

export type CpuPlayer = {
  id: string;
  posAbbrev?: string | null;
  secondaryPosAbbrev?: string | null;
  thirdPosAbbrev?: string | null;
  draftRank?: number | null;
};

/** Draft Rank on a curve: rank 1 ≈ 38, rank 25 = 20, rank 100 = 8, rank 300 ≈ 3. */
export const rankValue = (rank: number | null | undefined) => 1000 / (Math.max(1, Number(rank) || 9999) + 25);

const mainPos = (p: CpuPlayer) => String(p.posAbbrev ?? "").toUpperCase() as StrategyPos;

// Flex spots (Tight five, Halves, Forward, Back, Any) are shared out like the Standard squad.
const STANDARD_SHARE: Record<StrategyPos, number> = { PR: 2, HO: 1, LK: 2, LF: 3, HB: 1, FH: 1, CE: 2, OB: 3 };
const GROUPS: Record<string, StrategyPos[]> = {
  TF: ["PR", "HO", "LK"],
  HV: ["HB", "FH"],
  FW: ["PR", "HO", "LK", "LF"],
  BK: ["HB", "FH", "CE", "OB"],
  ANY: [...STRATEGY_POSITIONS],
};

/** How many starters of each position one team needs (flex spots shared out). */
export function starterDemand(format: SquadFormat = STANDARD_SQUAD): Record<StrategyPos, number> {
  const out = Object.fromEntries(STRATEGY_POSITIONS.map((p) => [p, 0])) as Record<StrategyPos, number>;
  for (const [kind, n] of Object.entries(format.starters)) {
    if (!n) continue;
    if ((STRATEGY_POSITIONS as readonly string[]).includes(kind)) {
      out[kind as StrategyPos] += n;
      continue;
    }
    const group = GROUPS[kind] ?? [];
    const total = group.reduce((a, p) => a + STANDARD_SHARE[p], 0);
    for (const p of group) out[p] += (n * STANDARD_SHARE[p]) / total;
  }
  return out;
}

export type PlayerForm = { ppg: number; games: number };

export type DraftValues = {
  /** player id -> worth to a computer team */
  value: Map<string, number>;
  /** how much each position scores compared with the others (1 = average) */
  posWeight: Record<StrategyPos, number>;
  /** the value of the replacement-level player at each position */
  replacement: Record<StrategyPos, number>;
};

const MIN_GAMES = 3;

/** Every player's worth for this league size and squad (worked out once per mock draft). */
export function draftValues(players: CpuPlayer[], format: SquadFormat, teamCount: number, form?: Map<string, PlayerForm>): DraftValues {
  // 1. Draft Rank, blended with last season's points per game
  const base = new Map(players.map((p) => [p.id, rankValue(p.draftRank)]));
  const played = form ? players.filter((p) => (form.get(p.id)?.games ?? 0) >= MIN_GAMES) : [];
  if (played.length) {
    const byPoints = [...played].sort((a, b) => form!.get(b.id)!.ppg - form!.get(a.id)!.ppg);
    byPoints.forEach((p, i) => base.set(p.id, 0.7 * base.get(p.id)! + 0.3 * rankValue(i + 1)));
  }

  // 2. Position weights from last season's points of the players good enough to start there
  const demand = starterDemand(format);
  const posWeight = Object.fromEntries(STRATEGY_POSITIONS.map((p) => [p, 1])) as Record<StrategyPos, number>;
  if (played.length) {
    const avg: Partial<Record<StrategyPos, number>> = {};
    for (const pos of STRATEGY_POSITIONS) {
      const n = Math.max(1, Math.ceil(demand[pos] * teamCount));
      const top = played.filter((p) => mainPos(p) === pos).map((p) => form!.get(p.id)!.ppg).sort((a, b) => b - a).slice(0, n);
      if (top.length >= Math.min(3, n)) avg[pos] = top.reduce((a, b) => a + b, 0) / top.length;
    }
    const vals = Object.values(avg) as number[];
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    if (mean > 0) for (const pos of STRATEGY_POSITIONS) {
      if (avg[pos] == null) continue;
      posWeight[pos] = Math.max(0.9, Math.min(1.1, 1 + 0.35 * (avg[pos]! / mean - 1)));
    }
  }
  const adjusted = new Map(players.map((p) => [p.id, base.get(p.id)! * (posWeight[mainPos(p)] ?? 1)]));

  // 3. Replacement level at each position: the next player once every team has its starters there
  const replacement = Object.fromEntries(STRATEGY_POSITIONS.map((p) => [p, 0])) as Record<StrategyPos, number>;
  for (const pos of STRATEGY_POSITIONS) {
    const vals = players.filter((p) => playerPositions(p).includes(pos)).map((p) => adjusted.get(p.id)!).sort((a, b) => b - a);
    const n = Math.ceil(demand[pos] * teamCount);
    replacement[pos] = vals[Math.min(n, vals.length - 1)] ?? 0;
  }

  // 4. Worth = some of his value + how far above replacement he is at his best position
  const value = new Map<string, number>();
  for (const p of players) {
    const v = adjusted.get(p.id)!;
    const positions = playerPositions(p).filter((x): x is StrategyPos => (STRATEGY_POSITIONS as readonly string[]).includes(x));
    const above = Math.max(0, ...positions.map((pos) => v - replacement[pos]));
    value.set(p.id, 0.35 * v + above);
  }
  return { value, posWeight, replacement };
}

export type Personality = {
  /** extra liking (or dislike) for a position, e.g. { LF: 0.2, PR: -0.15 } */
  bias: Partial<Record<StrategyPos, number>>;
  /** how much it goes with its gut: 0.08 (sticks to the numbers) to 0.22 */
  noise: number;
};

/** A random computer-team personality. */
export function makePersonality(rng: () => number = Math.random): Personality {
  const pos = [...STRATEGY_POSITIONS];
  const fav = pos.splice(Math.floor(rng() * pos.length), 1)[0];
  const dislike = pos[Math.floor(rng() * pos.length)];
  return { bias: { [fav]: 0.12 + rng() * 0.13, [dislike]: -(0.08 + rng() * 0.1) }, noise: 0.08 + rng() * 0.14 };
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** The player a computer team takes. `available` = players nobody has taken yet. */
export function cpuPick<T extends CpuPlayer>(args: {
  available: T[];
  roster: CpuPlayer[];
  format: SquadFormat;
  values: DraftValues;
  personality: Personality;
  rng?: () => number;
}): T | null {
  const { available, roster, format, values, personality } = args;
  const rng = args.rng ?? Math.random;
  const size = rosterSize(format);
  const gapsNow = squadStartingGaps(roster, format);
  const picksLeft = size - roster.length;
  if (picksLeft <= 0) return null;
  const mustFill = gapsNow >= picksLeft;
  const demand = starterDemand(format);
  const count: Record<string, number> = {};
  for (const r of roster) count[mainPos(r)] = (count[mainPos(r)] ?? 0) + 1;

  const sorted = [...available].sort((a, b) => (values.value.get(b.id) ?? 0) - (values.value.get(a.id) ?? 0));
  let best: T | null = null;
  let bestScore = -Infinity;
  let looked = 0;
  for (const p of sorted) {
    const next = [...roster, p];
    if (!squadFits(next, format)) continue;
    const fills = squadStartingGaps(next, format) < gapsNow;
    if (mustFill && !fills) continue;
    let s = values.value.get(p.id) ?? 0;
    // bench depth while starting spots are still open: worth less, more so early on
    if (!fills && gapsNow > 0) s *= 0.45 + 0.45 * (roster.length / size);
    // stacking one position past what the team needs
    const need = Math.ceil(demand[mainPos(p)] ?? 0);
    const have = count[mainPos(p)] ?? 0;
    if (have >= need) s *= Math.pow(0.7, have - need + 1);
    s *= 1 + (personality.bias[mainPos(p)] ?? 0);
    s *= Math.exp(gaussian(rng) * personality.noise);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
    // the best 40 who fit are plenty (later ones can't catch up), unless spots must be filled
    if (++looked >= 40 && !mustFill) break;
  }
  return best;
}

/** A team's strength for the results page: its best starters in full + some of the bench. */
export function teamStrength(roster: CpuPlayer[], format: SquadFormat, values: DraftValues): number {
  const sorted = [...roster].sort((a, b) => (values.value.get(b.id) ?? 0) - (values.value.get(a.id) ?? 0));
  const slots = assignToSlots(sorted, format);
  let total = 0;
  for (const [slotId, p] of slots) {
    if (!p) continue;
    total += (values.value.get(p.id) ?? 0) * (slotId.startsWith("bench") ? 0.3 : 1);
  }
  return total;
}

/** A letter grade from a team's strength compared with the league's average. */
export function draftGrade(strength: number, all: number[]): string {
  const avg = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const r = avg > 0 ? strength / avg : 1;
  return r >= 1.12 ? "A+" : r >= 1.07 ? "A" : r >= 1.03 ? "B+" : r >= 0.99 ? "B" : r >= 0.95 ? "C+" : r >= 0.9 ? "C" : "D";
}

/** Names for the computer teams. */
export const CPU_TEAM_NAMES = [
  "Ruck & Roll", "Scrum Dogs", "Maul Rats", "Lineout Legends", "Garryowen Gang", "Try Hards",
  "Sin Bin Squad", "Breakdown Bandits", "Grubber Grubs", "Up & Unders", "Box Kick Crew",
  "The Blindsides", "Offload Kings", "Golden Pointers", "Drop Goal Dynasty", "Front Row Union",
];
