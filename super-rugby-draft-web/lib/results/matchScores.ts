// lib/results/matchScores.ts
// Real Super Rugby final scores from the official fantasy game (playfantasyrugby.com, where the
// player stats come from; Ethan, 26 Nov 2026). Its rounds.json lists every game of the season with
// its score once it's "completed". The scores go into match_results, which:
//   - shows them on the Fixtures page, player cards, Matchup and Team Selection
//     (lib/fixtures/scores.ts puts them on the fixtures), and
//   - gives the team-win / draw points some leagues score (lib/results/matchResults.ts).
//
// Safety: a game is only saved when it matches one of the season's fixtures (the fixtures file
// Ethan supplies): the same two teams, kicking off within a day and a half of the fixture's time.
// So last season's feed in the off-season, or a game the feed has that we don't, saves nothing.
// The fixture's own home team and real round are used (scores swapped if the feed has the teams
// the other way round).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSeason, kickoffMs, recentlyFinishedFixtures, type SeasonFixture } from "@/lib/season";
import { FANTASY_ROUNDS_URL, getJson } from "@/lib/status/fantasyFeed";
import { scoreKey, teamCode, type MatchScore } from "@/lib/fixtures/scores";

const MATCH_WINDOW_MS = 36 * 3600_000;

/** A finished game in the feed. */
export type FeedGame = { round: number; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; kickoffMs: number };

/** The feed's finished games (status "completed" with both scores). */
export function feedGames(rounds: unknown): FeedGame[] {
  const out: FeedGame[] = [];
  for (const r of Array.isArray(rounds) ? rounds : []) {
    const round = Number((r as { number?: unknown; id?: unknown })?.number ?? (r as { id?: unknown })?.id);
    for (const g of ((r as { tournaments?: unknown[] })?.tournaments ?? []) as Array<Record<string, unknown>>) {
      if (String(g?.status ?? "").toLowerCase() !== "completed") continue;
      const hs = g.homeScore, as = g.awayScore;
      if (hs == null || as == null || hs === "" || as === "") continue;
      if (!Number.isFinite(Number(hs)) || !Number.isFinite(Number(as))) continue;
      out.push({
        round,
        homeTeam: String(g.homeSquadName ?? g.homeSquadAbbr ?? ""),
        awayTeam: String(g.awaySquadName ?? g.awaySquadAbbr ?? ""),
        homeScore: Number(hs),
        awayScore: Number(as),
        kickoffMs: Date.parse(String(g.date ?? "")) || 0,
      });
    }
  }
  return out;
}

/** Each feed game matched to one of the season's fixtures; what couldn't be matched is listed. */
export function planMatchScores(games: FeedGame[], fixtures: SeasonFixture[]): { scores: MatchScore[]; unmatched: string[] } {
  const scores: MatchScore[] = [];
  const unmatched: string[] = [];
  const used = new Set<string>();
  for (const g of games) {
    const a = teamCode(g.homeTeam), b = teamCode(g.awayTeam);
    const f = a && b
      ? fixtures.find((x) => {
          const h = teamCode(x.homeTeam), w = teamCode(x.awayTeam);
          const k = kickoffMs(x);
          return ((h === a && w === b) || (h === b && w === a)) && k > 0 && g.kickoffMs > 0 && Math.abs(k - g.kickoffMs) <= MATCH_WINDOW_MS;
        })
      : undefined;
    if (!f) {
      unmatched.push(`Round ${g.round}: ${g.homeTeam} v ${g.awayTeam}`);
      continue;
    }
    const home = teamCode(f.homeTeam)!, away = teamCode(f.awayTeam)!;
    const key = scoreKey(Number(f.week), home);
    if (used.has(key)) continue;
    used.add(key);
    const flipped = home !== a;
    scores.push({ realRound: Number(f.week), homeTeam: home, awayTeam: away, homeScore: flipped ? g.awayScore : g.homeScore, awayScore: flipped ? g.homeScore : g.awayScore });
  }
  return { scores, unmatched };
}

/** The season's saved scores. */
export async function savedMatchScores(db: SupabaseClient, season: number): Promise<MatchScore[]> {
  const { data, error } = await db.from("match_results").select("real_round, home_team, away_team, home_score, away_score").eq("season", season);
  if (error) throw error;
  return ((data ?? []) as Array<{ real_round: number; home_team: string; away_team: string; home_score: number; away_score: number }>).map((r) => ({
    realRound: Number(r.real_round),
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    homeScore: Number(r.home_score),
    awayScore: Number(r.away_score),
  }));
}

export type MatchScoreReport = { checked: boolean; saved: number; unmatched: string[]; error?: string };

/**
 * Save the feed's final scores. From the cron (every 5 minutes) it only reads the feed while a game
 * finished in the last few days is still missing its score; `force` reads it anyway (the
 * import-match-scores script).
 */
export async function importMatchScores(db: SupabaseClient, season: number, nowMs: number, opts: { force?: boolean } = {}): Promise<MatchScoreReport> {
  const s = getSeason(season);
  const have = await savedMatchScores(db, season);
  if (!opts.force) {
    const haveKeys = new Set(have.map((m) => scoreKey(m.realRound, m.homeTeam)));
    const missing = recentlyFinishedFixtures(s, nowMs).filter((f) => {
      const h = teamCode(f.homeTeam);
      return h && !haveKeys.has(scoreKey(Number(f.week), h));
    });
    if (!missing.length) return { checked: false, saved: 0, unmatched: [] };
  }

  const { scores, unmatched } = planMatchScores(feedGames(await getJson(FANTASY_ROUNDS_URL)), s.fixtures);
  const same = new Map(have.map((m) => [scoreKey(m.realRound, m.homeTeam), m]));
  const changed = scores.filter((m) => {
    const old = same.get(scoreKey(m.realRound, m.homeTeam));
    return !old || old.awayTeam !== m.awayTeam || old.homeScore !== m.homeScore || old.awayScore !== m.awayScore;
  });
  if (changed.length) {
    const now = new Date(nowMs).toISOString();
    const { error } = await db.from("match_results").upsert(
      changed.map((m) => ({ season, real_round: m.realRound, home_team: m.homeTeam, away_team: m.awayTeam, home_score: m.homeScore, away_score: m.awayScore, updated_at: now })),
      { onConflict: "season,real_round,home_team" }
    );
    if (error) throw error;
  }
  return { checked: true, saved: changed.length, unmatched };
}
