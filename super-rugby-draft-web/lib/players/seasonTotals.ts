// lib/players/seasonTotals.ts
// A player's season so far from the stat rows: games played, minutes, fantasy points and the
// count of every stat. Used with the Per game / Total / Per 80 switch (lib/players/statView).
import { STATS, isFrontRow, playedInRound, playerPoints, roundPoints, statCountsFromRow, type StatKey } from "@/lib/scoring";
import { playerRoundRows } from "@/lib/players/roundIndex";

export type SeasonTotals = { games: number; minutes: number; points: number; counts: Record<StatKey, number> };

type PlayerLike = { id: string; posAbbrev?: string | null; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null };

export function seasonTotals(rows: any[] | null | undefined, player: PlayerLike): SeasonTotals {
  const counts = Object.fromEntries(STATS.map((s) => [s.key, 0])) as Record<StatKey, number>;
  let games = 0;
  let points = 0;
  for (const r of playerRoundRows(rows, player.id)) {
    const c = statCountsFromRow(r);
    if (!playedInRound(c)) continue;
    games++;
    points += playerPoints(c, isFrontRow(player));
    for (const s of STATS) counts[s.key] += Number(c[s.key]) || 0;
  }
  return { games, minutes: counts.minutesPlayed, points: roundPoints(points), counts };
}

/** Stats people can compare (the names shown on the pages). */
export const COMPARE_STATS: Array<{ key: StatKey | "points"; label: string }> = [
  { key: "points", label: "Fantasy Points" },
  { key: "minutesPlayed", label: "Minutes" },
  { key: "tries", label: "Tries" },
  { key: "tryAssists", label: "Try Assists" },
  { key: "lineBreaks", label: "Line Breaks" },
  { key: "lineBreakAssists", label: "Line Break Assists" },
  { key: "defendersBeaten", label: "Defenders Beaten" },
  { key: "metresGained", label: "Metres" },
  { key: "offloads", label: "Offloads" },
  { key: "tackles", label: "Tackles" },
  { key: "tacklesMissed", label: "Missed Tackles" },
  { key: "turnoversForced", label: "Turnovers Forced" },
  { key: "interceptions", label: "Interceptions" },
  { key: "fiftyTwentyTwos", label: "50:22s" },
  { key: "penaltiesConceded", label: "Penalties Conceded" },
  { key: "errors", label: "Errors" },
  { key: "lineoutsWon", label: "Lineouts Won" },
  { key: "lineoutSteals", label: "Lineout Steals" },
  { key: "scrumsWon", label: "Scrums Won" },
  { key: "conversions", label: "Conversions" },
  { key: "penaltyGoals", label: "Penalty Goals" },
  { key: "dropGoals", label: "Drop Goals" },
  { key: "yellowCards", label: "Yellow Cards" },
  { key: "redCards", label: "Red Cards" },
];

export function totalFor(t: SeasonTotals, key: StatKey | "points"): number {
  return key === "points" ? t.points : t.counts[key] ?? 0;
}
