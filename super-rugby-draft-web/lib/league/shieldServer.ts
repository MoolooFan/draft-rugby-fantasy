// lib/league/shieldServer.ts (server only)
// Loads a league's Shield: the results of every season in its lineage, run through the rules
// in lib/league/shield.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { leagueLineage } from "@/lib/league/honours";
import { cleanShieldName, computeShield, nextShieldGame, type ShieldEvent, type ShieldGame, type ShieldReign, type ShieldSeason } from "@/lib/league/shield";

export type LeagueShield = {
  enabled: boolean;
  name: string;
  /** this league's team holding it (null = not awarded yet, or the holder isn't in this league) */
  holderTeamId: string | null;
  holder: (ShieldReign & { holderTeamIdHere: string | null }) | null;
  /** the holder's next home game this season */
  next: { week: number; homeTeamId: string; awayTeamId: string } | null;
  /** this league's season: what happened each week */
  events: ShieldEvent[];
  /** every holder, newest first (all seasons) */
  reigns: ShieldReign[];
};

export async function loadShield(db: SupabaseClient, leagueId: string): Promise<LeagueShield> {
  const lineage = await leagueLineage(db, leagueId);
  const { data: leagues, error } = await db
    .from("leagues")
    .select("id, season, shield_enabled, shield_name, shield_toggles")
    .or(`lineage_id.eq.${lineage},id.eq.${lineage}`);
  if (error) throw error;
  const ids = (leagues ?? []).map((l) => l.id);
  if (!ids.includes(leagueId)) ids.push(leagueId);
  const [teams, matchups] = await Promise.all([
    db.from("teams").select("id, league_id, owner_username, name").in("league_id", ids),
    db.from("league_matchups")
      .select("league_id, weeks, home_team_id, away_team_id, home_score, away_score, home_tries, away_tries, status")
      .in("league_id", ids)
      .eq("kind", "regular"),
  ]);
  if (teams.error) throw teams.error;
  if (matchups.error) throw matchups.error;

  const seasons: ShieldSeason[] = (leagues ?? []).map((l) => ({
    leagueId: l.id,
    season: Number(l.season),
    enabled: l.shield_enabled !== false,
    toggles: Array.isArray(l.shield_toggles) ? l.shield_toggles : [],
    teams: (teams.data ?? []).filter((t) => t.league_id === l.id).map((t) => ({ id: t.id, owner: String(t.owner_username ?? t.id), name: t.name })),
    games: (matchups.data ?? [])
      .filter((m) => m.league_id === l.id && m.home_team_id)
      .map((m): ShieldGame => ({
        week: Number(m.weeks?.[0]),
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: m.home_score,
        awayScore: m.away_score,
        homeTries: m.home_tries,
        awayTries: m.away_tries,
        final: m.status === "final",
      })),
  }));
  const here = seasons.find((s) => s.leagueId === leagueId);
  const row = (leagues ?? []).find((l) => l.id === leagueId);
  const state = computeShield(seasons);
  const holderTeamId = state.holder && here ? here.teams.find((t) => t.owner === state.holder!.owner)?.id ?? null : null;
  const next = here && holderTeamId ? nextShieldGame(here, holderTeamId) : null;
  return {
    enabled: row?.shield_enabled !== false,
    name: cleanShieldName(row?.shield_name),
    holderTeamId,
    holder: state.holder ? { ...state.holder.reign, holderTeamIdHere: holderTeamId } : null,
    next: next && next.awayTeamId ? { week: next.week, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId } : null,
    events: state.events.filter((e) => e.leagueId === leagueId),
    reigns: [...state.reigns].reverse(),
  };
}
