// lib/draft/strategy.ts
// A user's draft strategy (Ethan, 21 Nov 2026; like ESPN's): a position to aim for in each
// round, how many of each position they want by the end, players they never want, and their own
// player rankings. Kept on the server per account (one default, plus one per league). The draft
// watchlist is separate and still comes first.
//
// Used by the Draft Strategy page, the draft room (this round's plan, targets, greyed-out
// players), mock drafts, and auto-pick when the clock runs out: watchlist first, then the best
// player (by their own rankings) who fits this round's plan, never a do-not-draft player unless
// nobody else fits. Pure code (browser + server).
import { canPlayPosition, playerPositions } from "@/lib/players/positions";
import { BACK_POSITIONS, FORWARD_POSITIONS } from "@/lib/league/squad";

export const STRATEGY_POSITIONS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"] as const;
export type StrategyPos = (typeof STRATEGY_POSITIONS)[number];

/** What a round can aim for: "" = best available, a position, or any forward / any back. */
export type PlanPos = "" | StrategyPos | "FW" | "BK";

export const PLAN_OPTIONS: Array<{ value: PlanPos; label: string; short: string }> = [
  { value: "", label: "Best available", short: "BPA" },
  { value: "PR", label: "Prop", short: "PR" },
  { value: "HO", label: "Hooker", short: "HO" },
  { value: "LK", label: "Lock", short: "LK" },
  { value: "LF", label: "Loose forward", short: "LF" },
  { value: "HB", label: "Halfback", short: "HB" },
  { value: "FH", label: "Flyhalf", short: "FH" },
  { value: "CE", label: "Centre", short: "CE" },
  { value: "OB", label: "Outside back", short: "OB" },
  { value: "FW", label: "Any forward", short: "FWD" },
  { value: "BK", label: "Any back", short: "BCK" },
];
const PLAN_VALUES = new Set<string>(PLAN_OPTIONS.map((o) => o.value));
export const planLabel = (p: PlanPos | null | undefined) => PLAN_OPTIONS.find((o) => o.value === (p ?? ""))?.label ?? "Best available";

export type DraftStrategy = {
  /** round 1 first; missing / "" = best available */
  rounds: PlanPos[];
  /** how many of each position they want by the end of the draft (counting main positions) */
  targets: Partial<Record<StrategyPos, number>>;
  /** do-not-draft player ids */
  avoid: string[];
  /** their own rankings (player ids, best first); empty = the site's Draft Rank */
  ranking: string[];
};

export const EMPTY_STRATEGY: DraftStrategy = { rounds: [], targets: {}, avoid: [], ranking: [] };

export const STRATEGY_LIMITS = { rounds: 30, targetMax: 15, avoid: 300, ranking: 2000 } as const;

/** A saved / sent strategy, checked (anything broken is dropped). */
export function cleanStrategy(input: unknown): DraftStrategy {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const ids = (v: unknown, max: number) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, max) : [];
  const rounds = (Array.isArray(raw.rounds) ? raw.rounds : [])
    .slice(0, STRATEGY_LIMITS.rounds)
    .map((r) => (PLAN_VALUES.has(String(r ?? "")) ? (String(r ?? "") as PlanPos) : ""));
  while (rounds.length && !rounds[rounds.length - 1]) rounds.pop();
  const targets: DraftStrategy["targets"] = {};
  const rawTargets = (raw.targets && typeof raw.targets === "object" ? raw.targets : {}) as Record<string, unknown>;
  for (const p of STRATEGY_POSITIONS) {
    const n = Math.max(0, Math.min(STRATEGY_LIMITS.targetMax, Math.round(Number(rawTargets[p]) || 0)));
    if (n) targets[p] = n;
  }
  return { rounds, targets, avoid: ids(raw.avoid, STRATEGY_LIMITS.avoid), ranking: ids(raw.ranking, STRATEGY_LIMITS.ranking) };
}

export function isEmptyStrategy(s: DraftStrategy | null | undefined): boolean {
  return !s || (!s.rounds.some(Boolean) && !Object.keys(s.targets).length && !s.avoid.length && !s.ranking.length);
}

/** Does this player suit a round's plan? (Best available: everyone.) */
export function planMatches(player: Record<string, unknown> | { posAbbrev?: string | null }, plan: PlanPos | null | undefined): boolean {
  if (!plan) return true;
  if (plan === "FW") return playerPositions(player).some((p) => FORWARD_POSITIONS.includes(p));
  if (plan === "BK") return playerPositions(player).some((p) => BACK_POSITIONS.includes(p));
  return canPlayPosition(player, plan);
}

/** The plan for a round (1-based). */
export const planForRound = (s: DraftStrategy | null | undefined, round: number): PlanPos => s?.rounds[round - 1] ?? "";

type Ranked = { id: string; draftRank?: number | null };

/**
 * Each player's rank in this user's own order: their ranking first, then everyone else by the
 * site's Draft Rank, slotted in where that Draft Rank would put them (so a player added to the
 * pool later doesn't fall to the bottom). Returns id -> 1-based rank.
 */
export function myRanks<T extends Ranked>(players: T[], s: DraftStrategy | null | undefined): Map<string, number> {
  const bySite = [...players].sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999) || a.id.localeCompare(b.id));
  const out = new Map<string, number>();
  const known = new Set(players.map((p) => p.id));
  const mine = (s?.ranking ?? []).filter((id) => known.has(id));
  if (!mine.length) {
    bySite.forEach((p, i) => out.set(p.id, i + 1));
    return out;
  }
  const inMine = new Set(mine);
  // anyone not in their list (e.g. added to the pool later) goes in at their Draft Rank spot
  const merged = [...mine];
  bySite.forEach((p, i) => {
    if (!inMine.has(p.id)) merged.splice(Math.min(i, merged.length), 0, p.id);
  });
  merged.forEach((id, i) => out.set(id, i + 1));
  return out;
}

/** Players in this user's own order (best first). */
export function sortByMyRank<T extends Ranked>(players: T[], s: DraftStrategy | null | undefined, ranks?: Map<string, number>): T[] {
  const r = ranks ?? myRanks(players, s);
  return [...players].sort((a, b) => (r.get(a.id) ?? 99999) - (r.get(b.id) ?? 99999));
}

/** Position targets against a roster: have (by main position) / want. */
export function targetProgress(roster: Array<{ posAbbrev?: string | null }>, s: DraftStrategy | null | undefined) {
  const have: Record<string, number> = {};
  for (const p of roster) {
    const pos = String(p.posAbbrev ?? "").toUpperCase();
    if (pos) have[pos] = (have[pos] ?? 0) + 1;
  }
  return STRATEGY_POSITIONS.map((pos) => ({ pos, have: have[pos] ?? 0, want: s?.targets[pos] ?? 0 }));
}

/**
 * The player the strategy would take this round, from players who are available AND fit the
 * roster (the caller checks that). Order of preference:
 *   1. fits this round's plan and his position isn't already at its target
 *   2. fits this round's plan
 *   3. any position not yet at its target
 *   4. anyone
 * each by the user's own rankings, skipping do-not-draft players; if only do-not-draft players
 * are left, the best of them (a pick has to be made).
 */
export function strategyChoice<T extends Ranked & { posAbbrev?: string | null }>(args: {
  available: T[];
  roster: Array<{ posAbbrev?: string | null }>;
  round: number;
  strategy: DraftStrategy | null | undefined;
  ranks?: Map<string, number>;
}): T | null {
  const { available, roster, round, strategy } = args;
  if (!available.length) return null;
  const ranks = args.ranks ?? myRanks(available, strategy);
  const avoid = new Set(strategy?.avoid ?? []);
  const sorted = sortByMyRank(available, strategy, ranks);
  const wanted = sorted.filter((p) => !avoid.has(p.id));
  if (!wanted.length) return sorted[0];
  const plan = planForRound(strategy, round);
  const progress = new Map(targetProgress(roster, strategy).map((t) => [t.pos, t]));
  const full = (p: T) => {
    const t = progress.get(String(p.posAbbrev ?? "").toUpperCase() as StrategyPos);
    return !!t && t.want > 0 && t.have >= t.want;
  };
  return (
    (plan ? wanted.find((p) => planMatches(p, plan) && !full(p)) : undefined) ??
    (plan ? wanted.find((p) => planMatches(p, plan)) : undefined) ??
    wanted.find((p) => !full(p)) ??
    wanted[0]
  );
}
