// lib/league/deadlines.ts
// When a fantasy week's lineups lock, for the server. Rule (lib/season): 1 hour before the
// first kickoff of the week (2027 "Round 10/11": before round 10's first game).
import { getSeason, SEASONS, weekDeadlineMs } from "@/lib/season";

/** Lineup deadline (ms) for a season's fantasy week, or null if that week has no fixtures. */
export function selectionDeadlineMs(seasonYear: number, fantasyWeek: number): number | null {
  if (!SEASONS[seasonYear]) return null;
  return weekDeadlineMs(getSeason(seasonYear), fantasyWeek);
}
