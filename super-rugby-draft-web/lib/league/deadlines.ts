// lib/league/deadlines.ts
// When a fantasy week's lineups lock, for the server. Rule (lib/season): 1 hour before the
// first kickoff of the week (2027 "Round 10/11": before round 10's first game).
import { getSeason, SEASONS, weekDeadlineMs } from "@/lib/season";

/** Lineup deadline (ms) for a season's fantasy week, or null if that week has no fixtures. */
export function selectionDeadlineMs(seasonYear: number, fantasyWeek: number): number | null {
  if (!SEASONS[seasonYear]) return null;
  return weekDeadlineMs(getSeason(seasonYear), fantasyWeek);
}

/** Waiver claims for a week are processed from 24 hours before that week's lineup deadline. */
export const WAIVERS_BEFORE_SELECTION_MS = 24 * 60 * 60 * 1000;

/** When a week's waiver claims can be processed (ms), or null if that week has no fixtures. */
export function waiverProcessFromMs(seasonYear: number, fantasyWeek: number): number | null {
  const d = selectionDeadlineMs(seasonYear, fantasyWeek);
  return d == null ? null : d - WAIVERS_BEFORE_SELECTION_MS;
}
