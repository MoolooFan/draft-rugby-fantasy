// lib/stats/gameStatus.ts
// Where each Super Rugby game's fantasy points stand (Ethan, 20 Nov 2026), for the dashboard's
// games box and the stats sync (lib/stats/gameRuns.ts). Pure code.
//   Upcoming (not_started): before kickoff
//   Live:        kickoff to 3 hours after (stats pulled every few minutes)
//   Complete:    the game is over; stats still pulled hourly in case they're corrected
//   Finalised:   the last stats run has happened (about 13.5 hours after kickoff); its points
//                won't change any more
import { FINALISE_AFTER_LAST_KICKOFF_MS, GAME_LIVE_MS } from "@/lib/season";

export type GameStatus = "not_started" | "live" | "complete" | "finalised";

export const GAME_STATUS_LABEL: Record<GameStatus, string> = {
  not_started: "Upcoming", // Ethan, 26 Nov 2026: was "Not started"
  live: "Live",
  complete: "Complete",
  finalised: "Finalised",
};

/** When a game gets its last stats run. */
export const gameFinalRunAtMs = (kickoffMs: number) => kickoffMs + FINALISE_AFTER_LAST_KICKOFF_MS;

export function gameStatus(kickoffMs: number, nowMs: number, finalised: boolean): GameStatus {
  if (finalised) return "finalised";
  if (!(kickoffMs > 0) || nowMs < kickoffMs) return "not_started";
  if (nowMs < kickoffMs + GAME_LIVE_MS) return "live";
  return "complete";
}

/**
 * Should this game's stats be pulled on this run? "final" = it's time for its last run (then it's
 * recorded as finalised). Live games every run; finished ones on the first run of each hour.
 */
export function gameSyncDue(kickoffMs: number, nowMs: number, finalised: boolean, firstCallOfHour: boolean): "live" | "hourly" | "final" | null {
  if (finalised || !(kickoffMs > 0) || nowMs < kickoffMs) return null;
  if (nowMs >= gameFinalRunAtMs(kickoffMs)) return "final";
  if (nowMs < kickoffMs + GAME_LIVE_MS) return "live";
  return firstCallOfHour ? "hourly" : null;
}
