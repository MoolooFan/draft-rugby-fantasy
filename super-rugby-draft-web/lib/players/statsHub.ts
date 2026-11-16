// lib/players/statsHub.ts
// Season stats for the Stats Hub and the player comparison (Ethan, 16 Nov 2026): every stat for
// every player over a chosen range (a whole season, the last 3 / 5 rounds, or one round), shown
// per game / total / per 80 (lib/players/statView.ts). Pure code (tested in
// scripts/tests/stats-hub.test.ts).
import { isFrontRow, playedInRound, playerPoints, roundPoints, statCountsFromRow, STATS, type ScoringRules, type StatKey } from "@/lib/scoring";
import { applyStatView, type StatView } from "@/lib/players/statView";

type PositionInfo = Parameters<typeof isFrontRow>[0];

/** What range of games the stats cover (the season is chosen separately). */
export type StatRange = { kind: "season" } | { kind: "last"; n: number } | { kind: "round"; round: number };

/** Short column headings and full names for every stat. */
export const STAT_LABELS: Record<StatKey, { short: string; long: string }> = {
  minutesPlayed: { short: "MIN", long: "Minutes" },
  tries: { short: "T", long: "Tries" },
  tryAssists: { short: "TA", long: "Try assists" },
  lineBreaks: { short: "LB", long: "Line breaks" },
  lineBreakAssists: { short: "LBA", long: "Line break assists" },
  defendersBeaten: { short: "DB", long: "Defenders beaten" },
  metresGained: { short: "M", long: "Metres" },
  offloads: { short: "OFF", long: "Offloads" },
  tackles: { short: "TK", long: "Tackles" },
  tacklesMissed: { short: "MT", long: "Missed tackles" },
  turnoversForced: { short: "TO", long: "Turnovers won" },
  interceptions: { short: "INT", long: "Intercepts" },
  fiftyTwentyTwos: { short: "50:22", long: "50:22 kicks" },
  penaltiesConceded: { short: "PC", long: "Penalties conceded" },
  errors: { short: "ERR", long: "Errors" },
  lineoutsWon: { short: "LO", long: "Lineouts won" },
  lineoutSteals: { short: "LS", long: "Lineout steals" },
  lineoutErrors: { short: "LOE", long: "Lineout errors" },
  scrumsWon: { short: "SW", long: "Scrums won" },
  conversions: { short: "CON", long: "Conversions" },
  conversionsMissed: { short: "CM", long: "Conversions missed" },
  penaltyGoals: { short: "PG", long: "Penalty goals" },
  penaltyGoalsMissed: { short: "PGM", long: "Penalty goals missed" },
  dropGoals: { short: "DG", long: "Drop goals" },
  dropGoalsMissed: { short: "DGM", long: "Drop goals missed" },
  yellowCards: { short: "YC", long: "Yellow cards" },
  redCards: { short: "RC", long: "Red cards" },
};

/** Stats where fewer is better (the comparison highlights the lower one). */
export const LOWER_IS_BETTER = new Set<StatKey>([
  "tacklesMissed", "penaltiesConceded", "errors", "lineoutErrors", "conversionsMissed",
  "penaltyGoalsMissed", "dropGoalsMissed", "yellowCards", "redCards",
]);

/** Stat groups, to show fewer columns at once. */
export const STAT_GROUPS: Array<{ id: string; label: string; keys: StatKey[] }> = [
  { id: "attack", label: "Attack", keys: ["tries", "tryAssists", "lineBreaks", "lineBreakAssists", "defendersBeaten", "metresGained", "offloads"] },
  { id: "defence", label: "Defence", keys: ["tackles", "tacklesMissed", "turnoversForced", "interceptions"] },
  { id: "setpiece", label: "Set piece", keys: ["lineoutsWon", "lineoutSteals", "lineoutErrors", "scrumsWon"] },
  { id: "kicking", label: "Kicking", keys: ["conversions", "conversionsMissed", "penaltyGoals", "penaltyGoalsMissed", "dropGoals", "dropGoalsMissed", "fiftyTwentyTwos"] },
  { id: "discipline", label: "Discipline", keys: ["penaltiesConceded", "errors", "yellowCards", "redCards"] },
];

/** Every stat except minutes (minutes has its own column), in the usual order. */
export const COUNTING_STATS: StatKey[] = STATS.map((s) => s.key).filter((k) => k !== "minutesPlayed");

const roundOf = (row: Record<string, unknown>) => Number(row.round) || 0;

/** The rounds that have stats (with at least one player on the field), oldest first. */
export function roundsWithStats(rows: Array<Record<string, unknown>>): number[] {
  const set = new Set<number>();
  for (const r of rows) if (roundOf(r) > 0 && playedInRound(statCountsFromRow(r))) set.add(roundOf(r));
  return [...set].sort((a, b) => a - b);
}

/** The rounds a range covers (null = all of them). */
export function roundsForRange(range: StatRange, rounds: number[]): Set<number> | null {
  if (range.kind === "season") return null;
  if (range.kind === "round") return new Set([range.round]);
  return new Set(rounds.slice(-Math.max(1, range.n)));
}

export type PlayerAgg = {
  games: number;
  minutes: number;
  /** fantasy points (the league's scoring) */
  points: number;
  counts: Record<StatKey, number>;
  /** each game played: round and fantasy points, oldest first */
  log: Array<{ round: number; points: number }>;
};

/** One player's totals over the chosen rounds, from his stat rows. */
export function aggregatePlayer(rows: Array<Record<string, unknown>>, player: PositionInfo, rules: ScoringRules, rounds: Set<number> | null): PlayerAgg {
  const counts = Object.fromEntries(STATS.map((s) => [s.key, 0])) as Record<StatKey, number>;
  const front = isFrontRow(player, rules);
  let games = 0, minutes = 0, points = 0;
  const log: PlayerAgg["log"] = [];
  for (const r of [...rows].sort((a, b) => roundOf(a) - roundOf(b))) {
    if (rounds && !rounds.has(roundOf(r))) continue;
    const c = statCountsFromRow(r);
    if (!playedInRound(c)) continue;
    games++;
    minutes += Number(c.minutesPlayed) || 0;
    const p = playerPoints(c, front, rules);
    points += p;
    log.push({ round: roundOf(r), points: p });
    for (const s of STATS) counts[s.key] += Number(c[s.key]) || 0;
  }
  return { games, minutes, points: roundPoints(points), counts, log };
}

export type StatColumn = "points" | "games" | StatKey;

/** A column's value for a player in the chosen view (games is always the count; null = "–"). */
export function statValue(agg: PlayerAgg | null | undefined, col: StatColumn, view: StatView): number | null {
  if (!agg || !agg.games) return null;
  if (col === "games") return agg.games;
  if (col === "minutesPlayed") return view === "per80" ? null : applyStatView(agg.minutes, agg.games, agg.minutes, view);
  const total = col === "points" ? agg.points : agg.counts[col];
  return applyStatView(total, agg.games, agg.minutes, view);
}

/** Which of two values is better: "a", "b", or null (level / missing). */
export function better(col: StatColumn, a: number | null, b: number | null): "a" | "b" | null {
  if (a == null || b == null || a === b) return null;
  const lower = col !== "points" && col !== "games" && LOWER_IS_BETTER.has(col);
  return (lower ? a < b : a > b) ? "a" : "b";
}
