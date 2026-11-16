// lib/waivers/order.ts
// The waiver order for a week: reverse ladder (worst team first), from the regular-season games
// finished before that week. Worked out fresh each time from the league's own results, so it's
// never stale, and the 5-minute job uses the same order as the Transactions page.
//
// Shield reward (Ethan, 16 Nov 2026; lib/league/shield.ts): with "first waiver pick" on, whoever
// holds the Shield going into the week picks first in the FIRST round of claims; the rest of that
// round goes in the usual order without him. From the second round on, the usual order (him in
// his normal place).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";
import { holderAfter, loadShield } from "@/lib/league/shieldServer";

export type WaiverOrder = {
  /** the usual order, first pick first (every round after the first) */
  order: string[];
  /** the first round's order: the shield holder first when that reward is on, else the usual order */
  firstRound: string[];
  /** the team picking first in round 1 because it holds the Shield (null = no shield pick) */
  shieldTeamId: string | null;
};

/** Pure: the two orders from the usual one and the shield holder (if he gets the first pick). */
export function waiverRounds(order: string[], shieldTeamId: string | null): WaiverOrder {
  const holder = shieldTeamId && order.includes(shieldTeamId) ? shieldTeamId : null;
  return { order, firstRound: holder ? [holder, ...order.filter((t) => t !== holder)] : order, shieldTeamId: holder };
}

/** Pure: reverse ladder from games finished before this week; no games yet = the given team order. */
export function waiverOrderFromResults(teamIds: string[], matchups: Array<LadderMatchup & { weeks: number[] }>, week: number): string[] {
  const before = matchups.filter((m) => m.kind === "regular" && m.status === "final" && Math.max(...m.weeks.map(Number)) < week);
  if (!before.length) return [...teamIds];
  return buildLadder(teamIds, before).map((r) => r.teamId).reverse();
}

export async function buildWaiverOrder(db: SupabaseClient, leagueId: string, week: number): Promise<WaiverOrder> {
  const [{ data: teams, error: tErr }, { data: matchups, error: mErr }] = await Promise.all([
    db.from("teams").select("id").eq("league_id", leagueId).order("id"),
    db.from("league_matchups")
      .select("kind, status, weeks, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, home_shield_pts, away_shield_pts, shield_holder_after")
      .eq("league_id", leagueId)
      .eq("kind", "regular"),
  ]);
  if (tErr) throw tErr;
  if (mErr) throw mErr;
  const order = waiverOrderFromResults((teams ?? []).map((t) => String(t.id)), (matchups ?? []) as Array<LadderMatchup & { weeks: number[] }>, week);

  // the Shield's first pick: whoever holds it going into this week (kept while it's off / in the finals)
  let shieldTeamId: string | null = null;
  try {
    const shield = await loadShield(db, leagueId);
    if (shield.rewards.firstWaiverPick) shieldTeamId = holderAfter(shield, week - 1);
  } catch (e) {
    console.error("[waivers] shield holder not found:", e);
  }
  return waiverRounds(order, shieldTeamId);
}

/** Save the usual order (waiver_order table) so it can be looked back on. */
export async function saveWaiverOrder(db: SupabaseClient, leagueId: string, week: number, order: string[]): Promise<void> {
  if (!order.length) return;
  const now = new Date().toISOString();
  const { error } = await db
    .from("waiver_order")
    .upsert(order.map((teamId, i) => ({ league_id: leagueId, week, team_id: teamId, rank: i + 1, updated_at: now })), { onConflict: "league_id,week,team_id" });
  if (error) throw error;
}
