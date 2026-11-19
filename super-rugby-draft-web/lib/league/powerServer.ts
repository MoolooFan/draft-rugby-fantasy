// lib/league/powerServer.ts (server only)
// A league's power rankings and finals / title chances (Ethan, 19 Nov 2026), as of its latest
// finalised round. The rest of the season and the finals are simulated (lib/league/odds.ts) from
// each team's scores so far and its roster; the power rankings are the teams in order of their
// chance of winning the title (then of making the finals, then strength). Movement is against
// the previous round's ranking (saved in power_rankings).
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSquadFormat } from "@/lib/league/squadServer";
import { bestXvProjection } from "@/lib/league/powerRankings";
import { DEFAULT_SIMS, seededRandom, seedFrom, simulateOdds, type OddsMatchup, type TeamOdds } from "@/lib/league/odds";
import { bonusRulesFromRow } from "@/lib/league/bonus";
import { cleanShieldRewards } from "@/lib/league/shield";
import { activeIdsOf } from "@/lib/league/ir";
import { finalsSizeFromFormat } from "@/lib/results/engine";
import { loadSeasonPlayers } from "@/lib/players/db";
import { weekProjections } from "@/lib/projections/server";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { getSeason, SEASONS, totalFantasyWeeks } from "@/lib/season";

export type PowerRow = TeamOdds & { rank: number; movement: number | null };

export type PowerTable = {
  /** rankings as of this finalised round (0 = before round 1) */
  asOfWeek: number;
  /** finals places (0 = no finals: the title goes to the top of the ladder) */
  finalsSize: number;
  /** false before the season's schedule is made (no draft yet): then it's roster strength only */
  simulated: boolean;
  rows: PowerRow[];
};

/**
 * Each team's best possible team for the coming rounds, by projection. A player on a bye next
 * round counts with the round after's projection (so a bye doesn't make a team look weak for
 * the whole season).
 */
async function rosterProjections(db: SupabaseClient, leagueId: string, season: number, week: number, rosters: Array<{ team_id: string; data: unknown }>) {
  const weeks = totalFantasyWeeks(getSeason(season));
  const w1 = Math.min(Math.max(1, week), weeks);
  const w2 = Math.min(w1 + 1, weeks);
  const rules = await getLeagueScoringRules(db, leagueId);
  const [players, p1, p2, format] = await Promise.all([
    loadSeasonPlayers(db, season),
    weekProjections(db, season, w1, rules),
    w2 !== w1 ? weekProjections(db, season, w2, rules) : Promise.resolve(null),
    loadSquadFormat(db, leagueId),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const pts = (id: string) => {
    const a = p1.players[id];
    if (a && a.kickoffMs == null && p2?.players[id]) return p2.players[id].pts; // bye next round
    return a?.pts ?? 0;
  };
  const out: Record<string, number> = {};
  for (const r of rosters) {
    const squad = activeIdsOf((r.data ?? {}) as never).map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
    out[r.team_id] = bestXvProjection(squad, pts, format);
  }
  return out;
}

export async function loadPower(db: SupabaseClient, leagueId: string): Promise<PowerTable> {
  const { data: league, error } = await db.from("leagues").select("season, playoff_format, bonus_rules, bonus_points, shield_rewards, shield_enabled").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  const season = SEASONS[Number(league?.season)] ? Number(league?.season) : null;
  const [teams, done, matchups, rosters] = await Promise.all([
    db.from("teams").select("id").eq("league_id", leagueId),
    db.from("league_week_finalisations").select("week").eq("league_id", leagueId),
    db
      .from("league_matchups")
      .select("kind, status, weeks, playoff_key, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, home_shield_pts, away_shield_pts, shield_holder_after, home_source, away_source, decides, winner_team_id")
      .eq("league_id", leagueId),
    db.from("rosters").select("team_id, data").eq("league_id", leagueId),
  ]);
  for (const r of [teams, done, matchups, rosters]) if (r.error) throw r.error;
  const teamIds = (teams.data ?? []).map((t) => t.id as string);
  const games = (matchups.data ?? []) as unknown as OddsMatchup[];
  // the latest finalised round: from the finalisations, else the latest regular round with scores
  const finalised = (done.data ?? []).map((d) => Number(d.week));
  const scoredWeeks = games.filter((m) => m.kind === "regular" && m.status === "final").flatMap((m) => (m.weeks ?? []).map(Number));
  const asOfWeek = Math.max(0, ...finalised, ...scoredWeeks);

  const rosterProjection = season ? await rosterProjections(db, leagueId, season, asOfWeek + 1, (rosters.data ?? []) as never) : {};
  const finalsSize = finalsSizeFromFormat(league?.playoff_format);
  const rewards = cleanShieldRewards(league?.shield_rewards);
  const simulated = games.length > 0;

  const odds: TeamOdds[] = simulated
    ? simulateOdds({
        teamIds,
        matchups: games,
        rosterProjection,
        finalsSize,
        bonusRules: bonusRulesFromRow(league ?? {}),
        maxShieldPoints: league?.shield_enabled ? Math.max(rewards.defencePoints, rewards.winPoints) : 0,
        sims: DEFAULT_SIMS,
        // the same numbers on every reload until something changes
        rng: seededRandom(seedFrom(`${leagueId}:${asOfWeek}:${JSON.stringify(rosterProjection)}`)),
      })
    : teamIds.map((id) => ({ teamId: id, playoffPct: 0, titlePct: 0, clinched: false, eliminated: false, strength: rosterProjection[id] ?? 0 }));

  const ranked = odds
    .slice()
    .sort((a, b) => b.titlePct - a.titlePct || b.playoffPct - a.playoffPct || b.strength - a.strength || a.teamId.localeCompare(b.teamId))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // movement since the last saved ranking; save this one the first time it's worked out
  const { data: saved, error: sErr } = await db.from("power_rankings").select("week, team_id, rank").eq("league_id", leagueId).lte("week", asOfWeek);
  if (sErr) throw sErr;
  const prevWeek = Math.max(-1, ...(saved ?? []).map((s) => Number(s.week)).filter((w) => w < asOfWeek));
  const prev = new Map((saved ?? []).filter((s) => Number(s.week) === prevWeek).map((s) => [s.team_id, Number(s.rank)]));
  if (simulated && !(saved ?? []).some((s) => Number(s.week) === asOfWeek) && ranked.length) {
    const { error: iErr } = await db.from("power_rankings").upsert(
      ranked.map((r) => ({ league_id: leagueId, week: asOfWeek, team_id: r.teamId, rank: r.rank, score: Math.round(r.titlePct * 10) / 10 })),
      { onConflict: "league_id,week,team_id" }
    );
    if (iErr) throw iErr;
  }
  return {
    asOfWeek,
    finalsSize,
    simulated,
    rows: ranked.map((r) => ({ ...r, movement: prev.has(r.teamId) ? prev.get(r.teamId)! - r.rank : null })),
  };
}
