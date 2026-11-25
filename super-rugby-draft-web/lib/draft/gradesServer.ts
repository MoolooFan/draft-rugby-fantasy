// lib/draft/gradesServer.ts (server)
// Draft grades (lib/draft/grades.ts): worked out and saved the moment a draft finishes (from
// lib/draft/engine.ts), with plain bullet points and a league chat post. The AI coach rewrites
// the bullet points on its next run (lib/coach/draftGrades.ts). Grades never change after that.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSeasonPlayers } from "@/lib/players/db";
import { loadStats } from "@/lib/projections/server";
import { isFrontRow, playerPoints, statCountsFromRaw } from "@/lib/scoring";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { statsSeasonYear } from "@/lib/season";
import { currentStatusKind } from "@/lib/status/kind";
import { rosterSize, squadFormatOf } from "@/lib/league/squad";
import { gradeDraft, type GradePlayer, type TeamGrade } from "@/lib/draft/grades";
import { postMessage } from "@/lib/chat/server";
import { LEAGUE_CHANNEL } from "@/lib/chat/common";

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

/** Work out a finished draft's grades (doesn't save anything). */
export async function computeDraftGrades(db: SupabaseClient, leagueId: string, nowMs = Date.now()): Promise<TeamGrade[]> {
  const league = await q<{ season: number; squad_format: unknown }>(db.from("leagues").select("season, squad_format").eq("id", leagueId).single());
  const state = await q<{ draft_order_team_ids: string[] | null }>(db.from("draft_state").select("draft_order_team_ids").eq("league_id", leagueId).single());
  const order = state.draft_order_team_ids ?? [];
  const teams = await q<Array<{ id: string; name: string }>>(db.from("teams").select("id, name").eq("league_id", leagueId));
  const picks = await q<Array<{ pick_number: number; round: number; team_id: string; player_id: string }>>(
    db.from("draft_picks").select("pick_number, round, team_id, player_id").eq("league_id", leagueId).order("pick_number")
  );
  const format = squadFormatOf(league.squad_format);
  const pool = await loadSeasonPlayers(db, Number(league.season));
  const players: GradePlayer[] = pool.map((p) => {
    const k = currentStatusKind(p as never);
    return {
      id: p.id,
      name: `${p.firstName} ${p.lastName}`.trim(),
      posAbbrev: p.posAbbrev,
      secondaryPosAbbrev: (p as { secondaryPosAbbrev?: string | null }).secondaryPosAbbrev ?? null,
      thirdPosAbbrev: (p as { thirdPosAbbrev?: string | null }).thirdPosAbbrev ?? null,
      draftRank: p.draftRank,
      unavailable: k === "injured" || k === "out" || k === "suspended",
    };
  });

  // each player's points in every game he played: last season's until this one starts (with the
  // league's own scoring)
  const statsYear = statsSeasonYear(nowMs);
  const rules = await getLeagueScoringRules(db, leagueId);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const history = new Map<string, number[]>();
  for (const row of await loadStats(db, statsYear, 99)) {
    const p = byId.get(row.internal_player_id);
    if (!p) continue;
    const counts = statCountsFromRaw(row.stats);
    const pts = playerPoints(counts, isFrontRow(p), rules);
    if (!pts && !(Number(counts.minutesPlayed) > 0)) continue; // didn't play
    history.set(p.id, [...(history.get(p.id) ?? []), pts]);
  }

  return gradeDraft({
    order,
    teamNames: new Map(teams.map((t) => [t.id, t.name])),
    picks: picks.map((p) => ({ pick: p.pick_number, round: p.round, teamId: p.team_id, playerId: p.player_id })),
    players,
    history,
    format,
    size: rosterSize(format),
  });
}

/** Save the grades (once: a league that already has them keeps them) and tell the league chat. */
export async function writeDraftGrades(db: SupabaseClient, leagueId: string, nowMs = Date.now()): Promise<number> {
  const { count } = await db.from("draft_grades").select("team_id", { count: "exact", head: true }).eq("league_id", leagueId);
  if ((count ?? 0) > 0) return 0;
  const grades = await computeDraftGrades(db, leagueId, nowMs);
  if (!grades.length) return 0;
  const { error } = await db.from("draft_grades").upsert(
    grades.map((g) => ({ league_id: leagueId, team_id: g.teamId, grade: g.grade, score: g.score, rank: g.rank, facts: g.facts, bullets: g.bullets, written_by: "rules" })),
    { onConflict: "league_id,team_id", ignoreDuplicates: true }
  );
  if (error) throw error;
  const lines = [...grades].sort((a, b) => a.rank - b.rank).map((g) => `${g.grade}  ${g.facts.teamName}`);
  try {
    await postMessage(db, {
      leagueId,
      channel: LEAGUE_CHANNEL,
      senderTeamId: null,
      kind: "system",
      body: `The draft is done! Draft grades:\n${lines.join("\n")}\nSee why in the Draft Room.`,
      dedupeKey: "draft-grades",
    });
  } catch (e) {
    console.error("[draft grades] chat post", leagueId, e);
  }
  return grades.length;
}
