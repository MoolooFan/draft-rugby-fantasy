// lib/league/eliminated.ts
// Teams knocked out of the title race, for "eliminated teams can't trade" (League Settings, off by
// default; Ethan, 23 Nov 2026). Eliminated teams can still make waiver claims and free agent moves.
//
// A team is eliminated once the regular season is over and it either missed the finals or has
// lost a finals game (every finals game is knock-out; the 3rd / 5th place games are between teams
// already out). Before the regular season ends nobody is eliminated, and a league with no finals
// never has eliminated teams (its season ends with the regular season).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";

type Row = LadderMatchup & { winner_team_id?: string | null };

export function finalsSizeOf(format: string | null | undefined): number {
  const n = Number(String(format ?? "").replace("final", ""));
  return [2, 3, 4, 6].includes(n) ? n : 0;
}

/** Pure: who's out of the title race. */
export function eliminatedTeams(p: {
  teamIds: string[];
  matchups: Row[];
  regularWeeks: number[];
  finalisedWeeks: number[];
  finals: number;
}): Set<string> {
  const out = new Set<string>();
  if (!p.finals || !p.regularWeeks.length) return out;
  const done = new Set(p.finalisedWeeks.map(Number));
  if (!p.regularWeeks.every((w) => done.has(Number(w)))) return out;
  const seeds = buildLadder(p.teamIds, p.matchups).map((r) => r.teamId);
  seeds.slice(p.finals).forEach((t) => out.add(t));
  for (const m of p.matchups) {
    if (m.kind !== "finals" || m.status !== "final" || !m.winner_team_id || !m.home_team_id || !m.away_team_id) continue;
    out.add(m.winner_team_id === m.home_team_id ? m.away_team_id : m.home_team_id);
  }
  return out;
}

export type TradeBlock = { on: boolean; eliminated: Set<string> };

/** The league's setting and its eliminated teams (empty when the setting is off). */
export async function loadTradeBlock(db: SupabaseClient, leagueId: string): Promise<TradeBlock> {
  const { data: league, error } = await db.from("leagues").select("block_eliminated_trades, playoff_format, schedule_plan").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  if (!league?.block_eliminated_trades) return { on: false, eliminated: new Set() };
  const [teams, matchups, weeks] = await Promise.all([
    db.from("teams").select("id").eq("league_id", leagueId),
    db.from("league_matchups").select("kind, status, weeks, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, home_shield_pts, away_shield_pts, shield_holder_after, winner_team_id").eq("league_id", leagueId),
    db.from("league_week_finalisations").select("week").eq("league_id", leagueId),
  ]);
  for (const r of [teams, matchups, weeks]) if (r.error) throw r.error;
  return {
    on: true,
    eliminated: eliminatedTeams({
      teamIds: (teams.data ?? []).map((t) => String(t.id)),
      matchups: (matchups.data ?? []) as Row[],
      regularWeeks: ((league.schedule_plan as { regularWeeks?: number[] } | null)?.regularWeeks ?? []).map(Number),
      finalisedWeeks: (weeks.data ?? []).map((w) => Number(w.week)),
      finals: finalsSizeOf(league.playoff_format),
    }),
  };
}

/** The message for a trade one of these teams can't make (null = fine). */
export function tradeBlockedMessage(block: TradeBlock, yourTeamId: string, otherTeamId: string): string | null {
  if (!block.on) return null;
  if (block.eliminated.has(yourTeamId)) return "Your team has been eliminated, so it can't trade any more (league rule). Waiver claims and free agents are still open.";
  if (block.eliminated.has(otherTeamId)) return "That team has been eliminated, so it can't trade any more (league rule).";
  return null;
}
