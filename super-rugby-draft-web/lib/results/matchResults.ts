// lib/results/matchResults.ts
// Who won each real Super Rugby game, for leagues whose scoring gives points for a team win or
// draw (Ethan, 19 Nov 2026). Server only.
//
// Results come from the match_results table (to be filled with the player stats); any game not
// there yet falls back to the season's fixtures file, if it has a final score.
//
// addMatchResults() puts WIN / DRW (1 per game) into a player's raw stats for the rounds he
// played (more than 0 minutes) and his team won / drew, so lib/scoring reads them like stats.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEASONS } from "@/lib/season";
import { teamCodeFromName } from "@/lib/status/articles";

type Result = "W" | "D" | "L";
const code = (team: string): string | null => {
  const t = String(team ?? "").trim().toUpperCase();
  if (t === "MOP") return "MOA";
  return /^[A-Z]{3}$/.test(t) ? t : teamCodeFromName(team);
};
const key = (realRound: number, team: string) => `${realRound}|${team}`;

/** Each team's result per real round: "round|CODE" -> W / D / L. */
export async function teamResults(db: SupabaseClient, season: number, realRounds?: number[]): Promise<Map<string, Result>> {
  const out = new Map<string, Result>();
  const put = (round: number, home: string | null, away: string | null, hs: number, as: number) => {
    if (!home || !away || !Number.isFinite(hs) || !Number.isFinite(as)) return;
    out.set(key(round, home), hs > as ? "W" : hs < as ? "L" : "D");
    out.set(key(round, away), as > hs ? "W" : as < hs ? "L" : "D");
  };
  const wanted = realRounds ? new Set(realRounds) : null;

  // 1) the fixtures file (only games with a final score)
  for (const f of SEASONS[season]?.fixtures ?? []) {
    if (wanted && !wanted.has(f.week)) continue;
    if (f.status !== "final" || f.homeScore == null || f.awayScore == null) continue;
    put(f.week, code(f.homeTeam), code(f.awayTeam), Number(f.homeScore), Number(f.awayScore));
  }

  // 2) the table wins where it has the game
  let query = db.from("match_results").select("real_round, home_team, away_team, home_score, away_score").eq("season", season);
  if (realRounds) query = query.in("real_round", realRounds);
  const { data, error } = await query;
  if (!error) {
    for (const r of (data ?? []) as Array<{ real_round: number; home_team: string; away_team: string; home_score: number; away_score: number }>) {
      put(Number(r.real_round), code(r.home_team), code(r.away_team), Number(r.home_score), Number(r.away_score));
    }
  }
  return out;
}

type StatRow = { internal_player_id: string; round?: number | null; raw_json?: { stats?: Record<string, unknown>; roundId?: unknown } | null };

/**
 * Add WIN / DRW to each row's raw_json.stats (in place) for games the player played in that his
 * team won / drew. Rows need internal_player_id and the real round (round or raw_json.roundId).
 */
export async function addMatchResults<T extends StatRow>(db: SupabaseClient, season: number, rows: T[]): Promise<T[]> {
  if (!rows.length) return rows;
  const roundOf = (r: StatRow) => Number(r.raw_json?.roundId ?? r.round ?? 0);
  const rounds = [...new Set(rows.map(roundOf).filter((n) => n > 0))];
  const results = await teamResults(db, season, rounds);
  if (!results.size) return rows;

  const ids = [...new Set(rows.map((r) => String(r.internal_player_id)))];
  const teamOf = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("players").select("id, team_code").eq("season", season).in("id", ids.slice(i, i + 500));
    for (const p of (data ?? []) as Array<{ id: string; team_code: string | null }>) {
      const c = p.team_code ? code(p.team_code) : null;
      if (c) teamOf.set(String(p.id), c);
    }
  }

  for (const r of rows) {
    const stats = r.raw_json?.stats;
    if (!stats || !(Number(stats.MP) > 0)) continue;
    const team = teamOf.get(String(r.internal_player_id));
    const res = team ? results.get(key(roundOf(r), team)) : undefined;
    if (res === "W") stats.WIN = 1;
    else if (res === "D") stats.DRW = 1;
  }
  return rows;
}
