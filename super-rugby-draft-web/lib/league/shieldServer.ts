// lib/league/shieldServer.ts (server only)
// Loads a league's Shield: the results of every season in its lineage, run through the rules
// in lib/league/shield.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { leagueLineage } from "@/lib/league/honours";
import { postMessage } from "@/lib/chat/server";
import { LEAGUE_CHANNEL } from "@/lib/chat/common";
import {
  cleanShieldName, cleanShieldRewards, cleanShieldStart, computeShield, holderAfterWeek, nextShieldGame, shieldLadderPoints, shieldSecuredWeek,
  type ShieldEvent, type ShieldGame, type ShieldReign, type ShieldRewards, type ShieldSeason, type ShieldStart,
} from "@/lib/league/shield";

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
  /** the holder has no home games left this regular season: secured for the season (from that week) */
  secured: { teamId: string; week: number } | null;
  season: number | null;
  /** this league's team holding it before the season's first game (carried over), or null */
  startHolderTeamId: string | null;
  /** the commissioner's rewards for holding it */
  rewards: ShieldRewards;
  /** how it's first given out this season (top score / drawn at random / picked) */
  start: ShieldStart;
  /** this season's holder carried over from last season (then the start setting isn't used) */
  carriedOver: boolean;
};

/** "The Shield" stays as it is; "Ranfurly Shield" -> "the Ranfurly Shield". */
const theShield = (name: string) => (/^the /i.test(name) ? name : `the ${name}`);

export async function loadShield(db: SupabaseClient, leagueId: string): Promise<LeagueShield> {
  const lineage = await leagueLineage(db, leagueId);
  const { data: leagues, error } = await db
    .from("leagues")
    .select("id, season, shield_enabled, shield_name, shield_toggles, shield_rewards, shield_start, draft_status")
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
    start: cleanShieldStart(l.shield_start),
  }));
  const here = seasons.find((s) => s.leagueId === leagueId);
  const row = (leagues ?? []).find((l) => l.id === leagueId);
  let state = computeShield(seasons);
  const carriedOver = !!state.seasonStart[leagueId] && !(here?.start && here.start.method !== "top_score" && here.start.teamId === state.seasonStart[leagueId]);

  // Drawn at random: once the draft has finished (the teams are set), if no one carried it over
  if (here && row && here.start?.method === "random" && !here.start.teamId && row.draft_status === "complete" && !carriedOver && here.teams.length >= 2 && (row.shield_enabled !== false)) {
    const pick = here.teams[Math.floor(Math.random() * here.teams.length)];
    // only if it's still undrawn (two page loads at once draw once)
    const { data: saved, error: dErr } = await db
      .from("leagues")
      .update({ shield_start: { method: "random", teamId: pick.id, drawnAt: new Date().toISOString() } })
      .eq("id", leagueId)
      .filter("shield_start->>teamId", "is", null)
      .select("shield_start");
    if (dErr) throw dErr;
    if (saved?.length) {
      here.start = { method: "random", teamId: pick.id };
      try {
        await postMessage(db, {
          leagueId,
          channel: LEAGUE_CHANNEL,
          senderTeamId: null,
          kind: "system",
          body: `🎲 ${pick.name} has been drawn at random to start the season holding ${theShield(cleanShieldName(row.shield_name))}. Their first home game is their first defence.`,
          dedupeKey: `shield-draw:${leagueId}`,
        });
      } catch (e) {
        console.error("[shield] draw message not posted:", e);
      }
    } else {
      const { data: again } = await db.from("leagues").select("shield_start").eq("id", leagueId).maybeSingle();
      here.start = cleanShieldStart(again?.shield_start);
    }
    state = computeShield(seasons);
  }
  const holderTeamId = state.holder && here ? here.teams.find((t) => t.owner === state.holder!.owner)?.id ?? null : null;
  const next = here && holderTeamId ? nextShieldGame(here, holderTeamId) : null;
  const securedWeek = here && holderTeamId ? shieldSecuredWeek(here, holderTeamId, state.holder?.reign ?? null) : null;
  return {
    enabled: row?.shield_enabled !== false,
    name: cleanShieldName(row?.shield_name),
    holderTeamId,
    holder: state.holder ? { ...state.holder.reign, holderTeamIdHere: holderTeamId } : null,
    next: next && next.awayTeamId ? { week: next.week, homeTeamId: next.homeTeamId, awayTeamId: next.awayTeamId } : null,
    events: state.events.filter((e) => e.leagueId === leagueId),
    reigns: [...state.reigns].reverse(),
    secured: holderTeamId && securedWeek != null ? { teamId: holderTeamId, week: securedWeek } : null,
    season: here?.season ?? null,
    startHolderTeamId: state.seasonStart[leagueId] ?? null,
    rewards: cleanShieldRewards(row?.shield_rewards),
    start: here?.start ?? cleanShieldStart(null),
    carriedOver,
  };
}

/** This league's team holding the shield after a week's games (week 0 = before the season). */
export function holderAfter(shield: LeagueShield, week: number): string | null {
  return holderAfterWeek(shield.events, shield.startHolderTeamId, week);
}

/**
 * Save the shield's ladder rewards on each finished regular-season game (so every ladder counts
 * them): bonus ladder points for a defence / taking it, and (tie-break on) who held it after
 * that game. Worked out again from all the results each time, so re-finalising a round fixes
 * the later ones too.
 */
export async function syncShieldRewards(db: SupabaseClient, leagueId: string): Promise<void> {
  const shield = await loadShield(db, leagueId);
  const { data, error } = await db
    .from("league_matchups")
    .select("id, weeks, status, home_team_id, away_team_id, home_shield_pts, away_shield_pts, shield_holder_after")
    .eq("league_id", leagueId)
    .eq("kind", "regular");
  if (error) throw error;
  for (const m of data ?? []) {
    const final = m.status === "final";
    const weeks = (m.weeks ?? []).map(Number);
    const week = weeks[0];
    const hp = final && m.home_team_id ? shieldLadderPoints(shield.events, shield.rewards, week, m.home_team_id) : 0;
    const ap = final && m.away_team_id ? shieldLadderPoints(shield.events, shield.rewards, week, m.away_team_id) : 0;
    const after = final && shield.rewards.tieBreak ? holderAfter(shield, Math.max(...weeks)) : null;
    if (Number(m.home_shield_pts ?? 0) === hp && Number(m.away_shield_pts ?? 0) === ap && (m.shield_holder_after ?? null) === after) continue;
    const { error: uErr } = await db.from("league_matchups").update({ home_shield_pts: hp, away_shield_pts: ap, shield_holder_after: after }).eq("id", m.id);
    if (uErr) throw uErr;
  }
}
