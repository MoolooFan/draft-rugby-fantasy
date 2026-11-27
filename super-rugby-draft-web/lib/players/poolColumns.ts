"use client";
// lib/players/poolColumns.ts
// The stat columns in player lists on a computer (Ethan, 27 Nov 2026): pick up to 5 in Filters
// (Draft Room Player Pool; Transactions too). Stats follow the Per game / Total / Per 80 switch
// (lib/players/statView); Games, Pts and Pts/G always mean what they say. Remembered on this
// device.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StatKey } from "@/lib/scoring";
import { COMPARE_STATS, type SeasonTotals } from "@/lib/players/seasonTotals";
import { applyStatView, formatStatView, type StatView } from "@/lib/players/statView";

export const MAX_POOL_COLUMNS = 5;
export const DEFAULT_POOL_COLUMNS = ["DRAFT_RANK", "GAMES", "PTS", "PTS_G", "tries"];

/** Short names for the column headings (the full name shows when you hover). */
const SHORT: Partial<Record<string, string>> = {
  minutesPlayed: "Min",
  tryAssists: "TA",
  lineBreaks: "LB",
  lineBreakAssists: "LBA",
  defendersBeaten: "DB",
  metresGained: "Metres",
  offloads: "Offl",
  tackles: "Tkl",
  tacklesMissed: "MT",
  turnoversForced: "TO",
  interceptions: "Int",
  fiftyTwentyTwos: "50:22",
  penaltiesConceded: "PC",
  errors: "Err",
  lineoutsWon: "LO",
  lineoutSteals: "LO St",
  scrumsWon: "Scr",
  conversions: "Con",
  penaltyGoals: "PG",
  dropGoals: "DG",
  yellowCards: "YC",
  redCards: "RC",
};

export type PoolColumn = { key: string; label: string; short: string };

/** Every column you can pick (My Rank only once you have a draft strategy). */
export function poolColumnOptions(withMyRank: boolean): PoolColumn[] {
  return [
    { key: "DRAFT_RANK", label: "Draft Rank", short: "Rank" },
    ...(withMyRank ? [{ key: "MY_RANK", label: "My Rank", short: "My Rk" }] : []),
    { key: "GAMES", label: "Games", short: "Games" },
    { key: "PTS", label: "Fantasy Points (total)", short: "Pts" },
    { key: "PTS_G", label: "Fantasy Points per game", short: "Pts/G" },
    ...COMPARE_STATS.filter((c) => c.key !== "points").map((c) => ({ key: c.key, label: c.label, short: SHORT[c.key] ?? c.label })),
  ];
}

/** What the Sort by menu calls the same thing (null: can't sort by it, e.g. Games). */
export function sortKeyForColumn(key: string): string | null {
  if (key === "GAMES") return null;
  if (key === "PTS" || key === "PTS_G") return "points";
  return key;
}

/** One column's value for a player. */
export function poolColumnText(
  key: string,
  t: SeasonTotals | undefined,
  view: StatView,
  ranks: { draftRank: number | null; myRank: number | null }
): string {
  if (key === "DRAFT_RANK") return ranks.draftRank != null && ranks.draftRank < 9999 ? String(ranks.draftRank) : "–";
  if (key === "MY_RANK") return ranks.myRank != null ? String(ranks.myRank) : "–";
  if (!t || !t.games) return "–";
  if (key === "GAMES") return String(t.games);
  if (key === "PTS") return String(Math.round(t.points));
  if (key === "PTS_G") return (t.points / t.games).toFixed(1);
  return formatStatView(applyStatView(t.counts[key as StatKey], t.games, t.minutes, view), view);
}

export const usePoolColumnsStore = create<{ columns: string[]; setColumns: (c: string[]) => void }>()(
  persist((set) => ({ columns: DEFAULT_POOL_COLUMNS, setColumns: (columns) => set({ columns: columns.slice(0, MAX_POOL_COLUMNS) }) }), { name: "sr-pool-columns-v1" })
);

/** Add a column (if there's room) or take it away. */
export function toggleColumn(columns: string[], key: string): string[] {
  if (columns.includes(key)) return columns.filter((c) => c !== key);
  return columns.length >= MAX_POOL_COLUMNS ? columns : [...columns, key];
}

// ---------------------------------------------------------------------------
// Transactions' Player Pool on a computer: its own numbers (Projected, Match Average, Form, ...;
// components/transactions/playerMetrics.ts), up to 5 of them, remembered on this device.

export const DEFAULT_TX_COLUMNS = ["PROJECTED", "MATCH_AVG", "FORM_3", "TOTAL_PTS", "TRIES"];

const TX_SHORT: Record<string, string> = {
  DRAFT_RANK: "Rank", PROJECTED: "Proj", MATCH_AVG: "Avg", TOTAL_PTS: "Pts", FORM_3: "Form", LAST_SCORE: "Last", GAMES_PLAYED: "Games",
  TRIES: "Tries", TRY_ASSISTS: "TA", LINEBREAKS: "LB", LINEBREAK_ASSISTS: "LBA", DEFENDERS_BEATEN: "DB", METRES_GAINED: "Metres",
  OFFLOADS: "Offl", TACKLES: "Tkl", MISSED_TACKLES: "MT", TURNOVERS_FORCED: "TO", INTERCEPTIONS: "Int", KICKS_50_22: "50:22",
  PENALTIES_CONCEDED: "PC", ERRORS: "Err", LINEOUTS_WON: "LO", LINEOUT_STEALS: "LO St", LINEOUT_ERRORS: "LO Err", SCRUMS_WON: "Scr",
  CONVERSIONS: "Con", PENALTY_GOALS: "PG", DROP_GOALS: "DG", YELLOW_CARDS: "YC", RED_CARDS: "RC",
};
export const txColumnShort = (mode: string) => TX_SHORT[mode] ?? mode;

export const useTxColumnsStore = create<{ columns: string[]; setColumns: (c: string[]) => void }>()(
  persist((set) => ({ columns: DEFAULT_TX_COLUMNS, setColumns: (columns) => set({ columns: columns.slice(0, MAX_POOL_COLUMNS) }) }), { name: "sr-tx-columns-v1" })
);
