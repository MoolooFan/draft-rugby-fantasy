// lib/draft/strategy.ts
// A user's draft strategy for a league (Ethan, 21 Nov 2026; redone 25 Nov 2026). Three parts:
//   - Overall Rankings: their own order of the whole player pool (empty = the site's Draft Rank)
//   - Targets: players they want, in three groups (early, mid and late rounds), ranked within
//     each group. A player is in one group at most.
//   - Positional Rankings: players ranked within each position group (Prop, Hooker...). A player
//     can be in every group for a position he plays.
// Kept on the server, one per person per league. The draft watchlist is separate and comes first.
//
// Used by the Draft Strategy panel in the draft room, the draft room (target tags, "My Rank"
// sort), mock drafts, and auto-pick when the clock runs out: watchlist first, then targets, then
// Overall Rankings (see strategyChoice). Pure code (browser + server).

export const STRATEGY_POSITIONS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"] as const;
export type StrategyPos = (typeof STRATEGY_POSITIONS)[number];

export const TARGET_GROUPS = [
  { key: "early", label: "Early Rounds", short: "Early" },
  { key: "mid", label: "Mid Rounds", short: "Mid" },
  { key: "late", label: "Late Rounds", short: "Late" },
] as const;
export type TargetGroup = (typeof TARGET_GROUPS)[number]["key"];

export type DraftStrategy = {
  /** their own rankings (player ids, best first); empty = the site's Draft Rank */
  ranking: string[];
  /** target players by group, best first */
  targets: Record<TargetGroup, string[]>;
  /** players ranked within each position group, best first */
  positions: Partial<Record<StrategyPos, string[]>>;
};

export const EMPTY_STRATEGY: DraftStrategy = { ranking: [], targets: { early: [], mid: [], late: [] }, positions: {} };

export const STRATEGY_LIMITS = { ranking: 2000, group: 200 } as const;

/** A saved / sent strategy, checked (anything broken, or from the old layout, is dropped). */
export function cleanStrategy(input: unknown): DraftStrategy {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const ids = (v: unknown, max: number) =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, max) : [];
  const rawTargets = (raw.targets && typeof raw.targets === "object" ? raw.targets : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const targets = { early: [], mid: [], late: [] } as DraftStrategy["targets"];
  for (const { key } of TARGET_GROUPS) {
    targets[key] = ids(rawTargets[key], STRATEGY_LIMITS.group).filter((id) => !seen.has(id) && !!seen.add(id));
  }
  const rawPositions = (raw.positions && typeof raw.positions === "object" ? raw.positions : {}) as Record<string, unknown>;
  const positions: DraftStrategy["positions"] = {};
  for (const pos of STRATEGY_POSITIONS) {
    const list = ids(rawPositions[pos], STRATEGY_LIMITS.group);
    if (list.length) positions[pos] = list;
  }
  return { ranking: ids(raw.ranking, STRATEGY_LIMITS.ranking), targets, positions };
}

export function isEmptyStrategy(s: DraftStrategy | null | undefined): boolean {
  return !s || (!s.ranking.length && !TARGET_GROUPS.some((g) => s.targets[g.key].length) && !Object.values(s.positions).some((l) => l?.length));
}

/** Which target group a player is in (or null). */
export function targetGroupOf(s: DraftStrategy | null | undefined, id: string): TargetGroup | null {
  for (const { key } of TARGET_GROUPS) if (s?.targets[key].includes(id)) return key;
  return null;
}

/** id -> the target group, for tagging players in lists. */
export function targetGroups(s: DraftStrategy | null | undefined): Map<string, TargetGroup> {
  const out = new Map<string, TargetGroup>();
  for (const { key } of TARGET_GROUPS) for (const id of s?.targets[key] ?? []) out.set(id, key);
  return out;
}

export const targetShort = (g: TargetGroup) => TARGET_GROUPS.find((x) => x.key === g)?.short ?? "";

/**
 * Which part of the draft a round is in, for auto-pick: the draft in thirds (0 = early, 1 = mid,
 * 2 = late). E.g. 20 rounds: 1-7 early, 8-14 mid, 15-20 late. The groups are only labels for the
 * user (Ethan, 25 Nov 2026); this is just how auto-pick reads them.
 */
export function draftStage(round: number, totalRounds: number): 0 | 1 | 2 {
  const t = Math.max(1, totalRounds);
  if (round <= Math.ceil(t / 3)) return 0;
  if (round <= Math.ceil((2 * t) / 3)) return 1;
  return 2;
}

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

/**
 * The player the strategy would take, from players who are available AND fit the roster (the
 * caller checks that): their best target still there for this part of the draft (early targets
 * in the first third; early then mid in the second; any target in the last), in the order
 * they ranked them; otherwise the best player left by their Overall Rankings.
 */
export function strategyChoice<T extends Ranked>(args: {
  available: T[];
  round: number;
  totalRounds: number;
  strategy: DraftStrategy | null | undefined;
  ranks?: Map<string, number>;
}): T | null {
  const { available, round, totalRounds, strategy } = args;
  if (!available.length) return null;
  const byId = new Map(available.map((p) => [p.id, p]));
  const stage = draftStage(round, totalRounds);
  for (const { key } of TARGET_GROUPS.slice(0, stage + 1)) {
    for (const id of strategy?.targets[key] ?? []) {
      const p = byId.get(id);
      if (p) return p;
    }
  }
  return sortByMyRank(available, strategy, args.ranks ?? myRanks(available, strategy))[0];
}

/**
 * Players in the order for one position: their Positional Rankings for it first, then everyone
 * else by their Overall Rankings. Returns id -> 1-based rank (only for players given).
 */
export function positionRanks<T extends Ranked>(players: T[], s: DraftStrategy | null | undefined, pos: StrategyPos, overall?: Map<string, number>): Map<string, number> {
  const r = overall ?? myRanks(players, s);
  const listed = (s?.positions[pos] ?? []).filter((id) => players.some((p) => p.id === id));
  const inList = new Set(listed);
  const rest = players.filter((p) => !inList.has(p.id)).sort((a, b) => (r.get(a.id) ?? 99999) - (r.get(b.id) ?? 99999));
  const out = new Map<string, number>();
  [...listed, ...rest.map((p) => p.id)].forEach((id, i) => out.set(id, i + 1));
  return out;
}
