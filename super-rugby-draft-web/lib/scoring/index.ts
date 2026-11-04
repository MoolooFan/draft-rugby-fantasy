// lib/scoring/index.ts
// The ONE place the fantasy scoring rules live. Every page and the server use this.
// Safe to import from both browser and server code (no dependencies).
//
// Leagues will later be able to pick a different set of point values (or a custom set)
// — see REBUILD-PLAN item 12. Everything here takes `rules` so that slots straight in.

export type StatKey =
  | "minutesPlayed"
  | "tries"
  | "tryAssists"
  | "lineBreaks"
  | "lineBreakAssists"
  | "defendersBeaten"
  | "metresGained"
  | "offloads"
  | "tackles"
  | "tacklesMissed"
  | "turnoversForced"
  | "interceptions"
  | "fiftyTwentyTwos"
  | "penaltiesConceded"
  | "errors"
  | "lineoutsWon"
  | "lineoutSteals"
  | "lineoutErrors"
  | "scrumsWon"
  | "conversions"
  | "conversionsMissed"
  | "penaltyGoals"
  | "penaltyGoalsMissed"
  | "dropGoals"
  | "dropGoalsMissed"
  | "yellowCards"
  | "redCards";

/** Every stat that is worth points per event (minutes are scored in bands instead). */
export type EventStatKey = Exclude<StatKey, "minutesPlayed">;

export type StatDef = {
  key: StatKey;
  /** Key in playfantasyrugby.com's stats JSON (player_round_stats.raw_json.stats). */
  code: string;
  /** Column name the pages use for stat rows (from the old Google Sheet days). */
  header: string;
};

/** All scored stats, in the order the points breakdown lists them. */
export const STATS: readonly StatDef[] = [
  { key: "minutesPlayed", code: "MP", header: "Minutes played" },
  { key: "tries", code: "T", header: "Tries" },
  { key: "tryAssists", code: "TA", header: "Try Assists" },
  { key: "lineBreaks", code: "LB", header: "Linebreaks" },
  { key: "lineBreakAssists", code: "LC", header: "Linebreak assists" },
  { key: "defendersBeaten", code: "TB", header: "Defenders beaten" },
  { key: "metresGained", code: "MG", header: "Carries (m)" },
  { key: "offloads", code: "O", header: "Offloads" },
  { key: "tackles", code: "TK", header: "Tackles" },
  { key: "tacklesMissed", code: "MT", header: "Missed tackles" },
  { key: "turnoversForced", code: "TW", header: "Turnover Forced" },
  { key: "interceptions", code: "I", header: "Interceptions" },
  { key: "fiftyTwentyTwos", code: "K_50_22", header: "50:22 Kicks" },
  { key: "penaltiesConceded", code: "PC", header: "Penalties Conceded" },
  { key: "errors", code: "E", header: "Errors" },
  { key: "lineoutsWon", code: "LT", header: "Lineouts won" },
  { key: "lineoutSteals", code: "LS", header: "Lineout steals" },
  { key: "lineoutErrors", code: "LE", header: "Lineout errors" },
  { key: "scrumsWon", code: "SW", header: "Scrums won outright" },
  { key: "conversions", code: "C", header: "Conversions" },
  { key: "conversionsMissed", code: "CM", header: "Conversions missed" },
  { key: "penaltyGoals", code: "PG", header: "Penalty scored" },
  { key: "penaltyGoalsMissed", code: "PGM", header: "Penalty missed" },
  { key: "dropGoals", code: "DG", header: "Drop goal scored" },
  { key: "dropGoalsMissed", code: "DGM", header: "Drop goal missed" },
  { key: "yellowCards", code: "YC", header: "Yellow cards" },
  { key: "redCards", code: "RC", header: "Red cards" },
];

export type ScoringRules = {
  /** Points for playing 1–60 minutes. */
  minutesUpTo60: number;
  /** Points for playing 61+ minutes. */
  minutes61Plus: number;
  /** Points per event. For metresGained it is points per full 10 metres. */
  perEvent: Record<EventStatKey, number>;
};

export const STANDARD_SCORING: ScoringRules = {
  minutesUpTo60: 1,
  minutes61Plus: 2,
  perEvent: {
    tries: 15,
    tryAssists: 9,
    lineBreaks: 7,
    lineBreakAssists: 5,
    defendersBeaten: 2,
    metresGained: 1, // per 10 m
    offloads: 2,
    tackles: 1,
    tacklesMissed: -1,
    turnoversForced: 4,
    interceptions: 5,
    fiftyTwentyTwos: 10,
    penaltiesConceded: -1,
    errors: -1,
    lineoutsWon: 1,
    lineoutSteals: 5,
    lineoutErrors: -2,
    scrumsWon: 3, // props and hookers only
    conversions: 2,
    conversionsMissed: -1,
    penaltyGoals: 3,
    penaltyGoalsMissed: -1,
    dropGoals: 3,
    dropGoalsMissed: -1,
    yellowCards: -5,
    redCards: -10,
  },
};

/** Captain scores double. Fixed for every league. */
export const CAPTAIN_MULTIPLIER = 2;

export type StatCounts = Partial<Record<StatKey, number>>;

type PositionInfo = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null } | null | undefined;

/** Only props (PR) and hookers (HO) get scrum points. */
export function isFrontRow(player: PositionInfo): boolean {
  const a = String(player?.posAbbrev ?? "").trim().toUpperCase();
  const b = String(player?.secondaryPosAbbrev ?? "").trim().toUpperCase();
  return a === "PR" || a === "HO" || b === "PR" || b === "HO";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const normHeader = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** Read stat counts from a page-style stat row (keys like "Minutes played", any case/spacing). */
export function statCountsFromRow(row: unknown): StatCounts {
  const out: StatCounts = {};
  if (!row || typeof row !== "object") return out;
  const byNorm = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
    if (v !== undefined && v !== null && v !== "") byNorm.set(normHeader(k), v);
  }
  for (const s of STATS) out[s.key] = num(byNorm.get(normHeader(s.header)));
  return out;
}

/** Read stat counts from playfantasyrugby.com's stats JSON (raw_json.stats). */
export function statCountsFromRaw(stats: unknown): StatCounts {
  const out: StatCounts = {};
  const src = (stats ?? {}) as Record<string, unknown>;
  for (const s of STATS) out[s.key] = num(src[s.code]);
  return out;
}

export function minutesPoints(minutes: number, rules: ScoringRules = STANDARD_SCORING): number {
  if (minutes >= 61) return rules.minutes61Plus;
  if (minutes > 0) return rules.minutesUpTo60;
  return 0;
}

/** Points one stat is worth for a player (before any captain bonus). */
export function statPoints(
  key: StatKey,
  count: number,
  frontRow: boolean,
  rules: ScoringRules = STANDARD_SCORING
): number {
  if (!count) return 0;
  if (key === "minutesPlayed") return minutesPoints(count, rules);
  if (key === "scrumsWon" && !frontRow) return 0;
  if (key === "metresGained") return Math.floor(count / 10) * rules.perEvent.metresGained;
  return count * rules.perEvent[key];
}

/** True when the player got on the field (0 minutes = didn't play, scores nothing, can be auto-subbed). */
export function playedInRound(counts: StatCounts): boolean {
  return num(counts.minutesPlayed) > 0;
}

/** A player's fantasy points for one round (before any captain bonus). */
export function playerPoints(
  counts: StatCounts,
  frontRow: boolean,
  rules: ScoringRules = STANDARD_SCORING
): number {
  if (!playedInRound(counts)) return 0;
  let total = 0;
  for (const s of STATS) total += statPoints(s.key, num(counts[s.key]), frontRow, rules);
  return total;
}

/** Shortcut for page-style stat rows. */
export function pointsFromRow(row: unknown, player: PositionInfo, rules: ScoringRules = STANDARD_SCORING): number {
  return playerPoints(statCountsFromRow(row), isFrontRow(player), rules);
}

/** Per-stat points, in STATS order (for points breakdown pop-ups). */
export function pointsBreakdown(
  counts: StatCounts,
  frontRow: boolean,
  rules: ScoringRules = STANDARD_SCORING
): Array<{ stat: StatDef; count: number; points: number }> {
  return STATS.map((stat) => {
    const count = num(counts[stat.key]);
    return { stat, count, points: statPoints(stat.key, count, frontRow, rules) };
  });
}
