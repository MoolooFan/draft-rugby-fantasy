// lib/trades/deadlines.ts
// Trade offers are for a fantasy week and expire at that week's lineup deadline (1 hour before
// its first kickoff, from the season settings). One copy for all the trade routes.
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentSeasonYear, getSeason, totalFantasyWeeks, weekDeadlineMs } from "@/lib/season";

/** Has this week's lineup deadline passed? */
export function isPastWeekDeadline(week: number, nowMs: number, seasonYear: number = currentSeasonYear()): boolean {
  const dl = weekDeadlineMs(getSeason(seasonYear), week);
  return dl != null && nowMs >= dl;
}

/** Fantasy weeks whose deadline has passed. */
export function weeksPastDeadline(nowMs: number, seasonYear: number = currentSeasonYear()): number[] {
  const season = getSeason(seasonYear);
  const out: number[] = [];
  for (let w = 1; w <= totalFantasyWeeks(season); w++) {
    const dl = weekDeadlineMs(season, w);
    if (dl != null && nowMs >= dl) out.push(w);
  }
  return out;
}

/** Pending offers for weeks whose deadline has passed are cancelled (expired). */
export async function cancelExpiredPendingTrades(leagueId: string, nowMs: number): Promise<void> {
  const weeks = weeksPastDeadline(nowMs);
  if (!weeks.length) return;
  const { error } = await supabaseAdmin
    .from("trade_offers")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .in("week", weeks);
  if (error) throw error;
}
