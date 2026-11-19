// lib/league/powerServer.ts (server only)
// A league's power rankings as of its latest finalised round (lib/league/powerRankings.ts), with
// each team's movement since the previous round's ranking (saved in power_rankings).
import { loadSquadFormat } from "@/lib/league/squadServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestXvProjection, powerRankings, type PowerRow } from "@/lib/league/powerRankings";
import { activeIdsOf } from "@/lib/league/ir";
import { loadSeasonPlayers } from "@/lib/players/db";
import { weekProjections } from "@/lib/projections/server";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { getSeason, SEASONS, totalFantasyWeeks } from "@/lib/season";

export type PowerTable = {
  /** rankings as of this finalised round (0 = before round 1) */
  asOfWeek: number;
  /** the round the roster projections are for */
  projectedWeek: number;
  rows: Array<PowerRow & { movement: number | null }>;
};

export async function loadPower(db: SupabaseClient, leagueId: string): Promise<PowerTable> {
  const { data: league, error } = await db.from("leagues").select("season").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  const season = SEASONS[Number(league?.season)] ? Number(league?.season) : null;
  const [teams, done, regular, rosters] = await Promise.all([
    db.from("teams").select("id").eq("league_id", leagueId),
    db.from("league_week_finalisations").select("week").eq("league_id", leagueId),
    db.from("league_matchups").select("weeks").eq("league_id", leagueId).eq("kind", "regular"),
    db.from("rosters").select("team_id, data").eq("league_id", leagueId),
  ]);
  for (const r of [teams, done, regular, rosters]) if (r.error) throw r.error;
  const teamIds = (teams.data ?? []).map((t) => t.id);
  const finalised = (done.data ?? []).map((d) => Number(d.week));
  const asOfWeek = finalised.length ? Math.max(...finalised) : 0;
  const regularWeeks = new Set((regular.data ?? []).flatMap((m) => (m.weeks ?? []).map(Number)));

  // regular-season scores so far
  const { data: results, error: rErr } = await db.from("team_week_results").select("team_id, week, score").eq("league_id", leagueId);
  if (rErr) throw rErr;
  const scores = (results ?? [])
    .filter((r) => regularWeeks.has(Number(r.week)) && finalised.includes(Number(r.week)))
    .map((r) => ({ teamId: r.team_id, week: Number(r.week), score: Number(r.score) }));

  // roster strength: best possible XV for the next round
  const rosterProjection: Record<string, number> = {};
  let projectedWeek = asOfWeek + 1;
  if (season) {
    const weeks = totalFantasyWeeks(getSeason(season));
    projectedWeek = Math.min(Math.max(1, asOfWeek + 1), weeks);
    const [players, proj] = await Promise.all([
      loadSeasonPlayers(db, season),
      weekProjections(db, season, projectedWeek, await getLeagueScoringRules(db, leagueId)),
    ]);
    const byId = new Map(players.map((p) => [p.id, p]));
    const format = await loadSquadFormat(db, leagueId);
    for (const r of rosters.data ?? []) {
      const squad = activeIdsOf(r.data ?? {}).map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
      rosterProjection[r.team_id] = bestXvProjection(squad, (id) => proj.players[id]?.pts ?? 0, format);
    }
  }

  const rows = powerRankings({ teamIds, scores, rosterProjection });

  // movement since the last saved ranking; save this one the first time it's worked out
  const { data: saved, error: sErr } = await db.from("power_rankings").select("week, team_id, rank").eq("league_id", leagueId).lte("week", asOfWeek);
  if (sErr) throw sErr;
  const prevWeek = Math.max(-1, ...(saved ?? []).map((s) => Number(s.week)).filter((w) => w < asOfWeek));
  const prev = new Map((saved ?? []).filter((s) => Number(s.week) === prevWeek).map((s) => [s.team_id, Number(s.rank)]));
  if (!(saved ?? []).some((s) => Number(s.week) === asOfWeek) && rows.length) {
    const { error: iErr } = await db.from("power_rankings").upsert(
      rows.map((r) => ({ league_id: leagueId, week: asOfWeek, team_id: r.teamId, rank: r.rank, score: r.score })),
      { onConflict: "league_id,week,team_id" }
    );
    if (iErr) throw iErr;
  }
  return {
    asOfWeek,
    projectedWeek,
    rows: rows.map((r) => ({ ...r, movement: prev.has(r.teamId) ? prev.get(r.teamId)! - r.rank : null })),
  };
}
