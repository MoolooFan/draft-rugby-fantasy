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
  /** Points for getting on the field (appearance). */
  minutesUpTo60: number;
  /** Points instead, once a player reaches minutesFullAt minutes. */
  minutes61Plus: number;
  /** Minutes needed for minutes61Plus (Standard 61, Alternate 60). */
  minutesFullAt: number;
  /** Points per event. For metresGained it is points per full metresPer metres. */
  perEvent: Record<EventStatKey, number>;
  /** Metres needed for each metresGained point (Standard 10, Alternate 5). */
  metresPer: number;
  /** Positions that get scrum points (Standard props and hookers, Alternate props only). */
  scrumPositions: string[];
};

export const STANDARD_SCORING: ScoringRules = {
  minutesUpTo60: 1,
  minutes61Plus: 2,
  minutesFullAt: 61,
  metresPer: 10,
  scrumPositions: ["PR", "HO"],
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

/**
 * Ethan's alternate scoring (8 Nov 2026). These are only the starting values: the live values
 * are in the database (scoring_systems) and Ethan edits them on the admin page.
 */
export const ALTERNATE_SCORING: ScoringRules = {
  minutesUpTo60: 1, // appearance
  minutes61Plus: 2, // appearance + 1 more at 60 minutes
  minutesFullAt: 60,
  metresPer: 5,
  scrumPositions: ["PR"],
  perEvent: {
    tries: 7,
    tryAssists: 4,
    lineBreaks: 3.5,
    lineBreakAssists: 2.5,
    defendersBeaten: 1.2,
    metresGained: 0.2, // per complete 5 m
    offloads: 0.8,
    tackles: 0.5,
    tacklesMissed: -1,
    turnoversForced: 3,
    interceptions: 3,
    fiftyTwentyTwos: 4,
    penaltiesConceded: -2.5,
    errors: -1,
    lineoutsWon: 0.4,
    lineoutSteals: 4,
    lineoutErrors: -1.5,
    scrumsWon: 2.5, // props only
    conversions: 1.5,
    conversionsMissed: -1,
    penaltyGoals: 2,
    penaltyGoalsMissed: -1,
    dropGoals: 2,
    dropGoalsMissed: -1,
    yellowCards: -6,
    redCards: -12,
  },
};

/** Older saved rules may miss newer fields: fill them from Standard. */
export function completeRules(r: Partial<ScoringRules> | null | undefined): ScoringRules {
  const base = STANDARD_SCORING;
  return {
    minutesUpTo60: num(r?.minutesUpTo60 ?? base.minutesUpTo60),
    minutes61Plus: num(r?.minutes61Plus ?? base.minutes61Plus),
    minutesFullAt: num(r?.minutesFullAt ?? base.minutesFullAt) || base.minutesFullAt,
    metresPer: num(r?.metresPer ?? base.metresPer) || base.metresPer,
    scrumPositions: Array.isArray(r?.scrumPositions) ? r!.scrumPositions.map((p) => String(p).toUpperCase()) : base.scrumPositions,
    perEvent: Object.fromEntries(
      (Object.keys(base.perEvent) as EventStatKey[]).map((k) => [k, num(r?.perEvent?.[k] ?? base.perEvent[k])])
    ) as Record<EventStatKey, number>,
  };
}

// The scoring the pages use: the active league's (set when a league is loaded). The server
// always passes a league's rules explicitly.
let activeRules: ScoringRules = STANDARD_SCORING;
export function setActiveScoringRules(rules: Partial<ScoringRules> | null | undefined) {
  activeRules = rules ? completeRules(rules) : STANDARD_SCORING;
}
export function activeScoringRules(): ScoringRules {
  return activeRules;
}

/** Points to one decimal place (Alternate scoring uses decimals). */
export function roundPoints(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Captain scores double. Fixed for every league. */
export const CAPTAIN_MULTIPLIER = 2;

export type StatCounts = Partial<Record<StatKey, number>>;

type PositionInfo = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null } | null | undefined;

/** Does this player get scrum points under these rules (Standard: props and hookers; Alternate: props only)? */
export function isFrontRow(player: PositionInfo, rules: ScoringRules = activeScoringRules()): boolean {
  const all = [player?.posAbbrev, player?.secondaryPosAbbrev, player?.thirdPosAbbrev].map((v) => String(v ?? "").trim().toUpperCase());
  return all.some((p) => rules.scrumPositions.includes(p));
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

export function minutesPoints(minutes: number, rules: ScoringRules = activeScoringRules()): number {
  if (minutes >= rules.minutesFullAt) return rules.minutes61Plus;
  if (minutes > 0) return rules.minutesUpTo60;
  return 0;
}

/** Points one stat is worth for a player (before any captain bonus). */
export function statPoints(
  key: StatKey,
  count: number,
  frontRow: boolean,
  rules: ScoringRules = activeScoringRules()
): number {
  if (!count) return 0;
  if (key === "minutesPlayed") return minutesPoints(count, rules);
  if (key === "scrumsWon" && !frontRow) return 0;
  if (key === "metresGained") return Math.round(Math.floor(count / rules.metresPer) * rules.perEvent.metresGained * 100) / 100;
  return Math.round(count * rules.perEvent[key] * 100) / 100;
}

/** True when the player got on the field (0 minutes = didn't play, scores nothing, can be auto-subbed). */
export function playedInRound(counts: StatCounts): boolean {
  return num(counts.minutesPlayed) > 0;
}

/** A player's fantasy points for one round (before any captain bonus). */
export function playerPoints(
  counts: StatCounts,
  frontRow: boolean,
  rules: ScoringRules = activeScoringRules()
): number {
  if (!playedInRound(counts)) return 0;
  let total = 0;
  for (const s of STATS) total += statPoints(s.key, num(counts[s.key]), frontRow, rules);
  return roundPoints(total);
}

/** Shortcut for page-style stat rows. */
export function pointsFromRow(row: unknown, player: PositionInfo, rules: ScoringRules = activeScoringRules()): number {
  return playerPoints(statCountsFromRow(row), isFrontRow(player, rules), rules);
}

/** Per-stat points, in STATS order (for points breakdown pop-ups). */
export function pointsBreakdown(
  counts: StatCounts,
  frontRow: boolean,
  rules: ScoringRules = activeScoringRules()
): Array<{ stat: StatDef; count: number; points: number }> {
  return STATS.map((stat) => {
    const count = num(counts[stat.key]);
    return { stat, count, points: statPoints(stat.key, count, frontRow, rules) };
  });
}
