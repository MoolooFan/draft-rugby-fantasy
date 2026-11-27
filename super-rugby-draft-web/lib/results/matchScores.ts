// lib/results/matchScores.ts
// Real Super Rugby scores from the official fantasy game (playfantasyrugby.com, where the player
// stats come from; Ethan, 26 + 27 Nov 2026). Its rounds.json lists every game of the season with
// its score: live while it's being played (saved with final = false, read every 5 minutes like
// the live player stats), and final once it's "completed". The scores go into match_results, which:
//   - shows them on the Fixtures page, player cards, Matchup and Team Selection
//     (lib/fixtures/scores.ts puts them on the fixtures), and
//   - gives the team-win / draw points some leagues score (final scores only;
//     lib/results/matchResults.ts), and
//   - gives the team scores used for team strength in projections (lib/projections/server.ts).
// The site never adds up team scores itself when the official one is there.
//
// Safety: a game is only saved when it matches one of the season's fixtures (the fixtures file
// Ethan supplies): the same two teams, kicking off within a day and a half of the fixture's time.
// So last season's feed in the off-season, or a game the feed has that we don't, saves nothing.
// The fixture's own home team and real round are used (scores swapped if the feed has the teams
// the other way round).
import type { SupabaseClient } from "@supabase/supabase-js";
import { GAME_LIVE_MS, getSeason, kickoffMs, recentlyFinishedFixtures, type SeasonFixture } from "@/lib/season";
import { FANTASY_ROUNDS_URL, getJson } from "@/lib/status/fantasyFeed";
import { scoreKey, teamCode, type MatchScore } from "@/lib/fixtures/scores";

const MATCH_WINDOW_MS = 36 * 3600_000;

/** A game in the feed with a score: finished, or (final false) being played. */
export type FeedGame = { round: number; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; kickoffMs: number; final: boolean };

/** Status words for a finished game ("completed" is the one seen in 2026). */
const FINISHED = /^(completed?|finished|final|full ?time|ft|result)$/;
/** Status words for a game that isn't on (anything else after kickoff counts as live). */
const NOT_ON = /^(scheduled|upcoming|not ?started|pending|pre[- ]?match|postponed|cancell?ed|abandoned|tbc|)$/;

/**
 * The feed's games with a score: finished ones (status "completed"), and with `nowMs` also the
 * ones being played (kicked off, not finished, with a score). The feed's live status words are
 * checked in Round 1 2027 (memory: round1-2027-fantasy-feed-check).
 */
export function feedGames(rounds: unknown, nowMs?: number): FeedGame[] {
  const out: FeedGame[] = [];
  for (const r of Array.isArray(rounds) ? rounds : []) {
    const round = Number((r as { number?: unknown; id?: unknown })?.number ?? (r as { id?: unknown })?.id);
    for (const g of ((r as { tournaments?: unknown[] })?.tournaments ?? []) as Array<Record<string, unknown>>) {
      const status = String(g?.status ?? "").toLowerCase().trim();
      const ko = Date.parse(String(g?.date ?? "")) || 0;
      const final = FINISHED.test(status);
      if (!final && (nowMs == null || NOT_ON.test(status) || !ko || ko > nowMs)) continue;
      const hs = g.homeScore, as = g.awayScore;
      if (hs == null || as == null || hs === "" || as === "") continue;
      if (!Number.isFinite(Number(hs)) || !Number.isFinite(Number(as))) continue;
      out.push({
        round,
        homeTeam: String(g.homeSquadName ?? g.homeSquadAbbr ?? ""),
        awayTeam: String(g.awaySquadName ?? g.awaySquadAbbr ?? ""),
        homeScore: Number(hs),
        awayScore: Number(as),
        kickoffMs: ko,
        final,
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
    scores.push({ realRound: Number(f.week), homeTeam: home, awayTeam: away, homeScore: flipped ? g.awayScore : g.homeScore, awayScore: flipped ? g.homeScore : g.awayScore, final: g.final });
  }
  return { scores, unmatched };
}

/** The season's saved scores. */
export async function savedMatchScores(db: SupabaseClient, season: number): Promise<MatchScore[]> {
  const { data, error } = await db.from("match_results").select("real_round, home_team, away_team, home_score, away_score, final").eq("season", season);
  if (error) throw error;
  return ((data ?? []) as Array<{ real_round: number; home_team: string; away_team: string; home_score: number; away_score: number; final: boolean | null }>).map((r) => ({
    realRound: Number(r.real_round),
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    homeScore: Number(r.home_score),
    awayScore: Number(r.away_score),
    final: r.final !== false,
  }));
}

export type MatchScoreReport = { checked: boolean; saved: number; unmatched: string[]; error?: string };

/**
 * Save the feed's scores. From the cron (every 5 minutes) it only reads the feed while a game is
 * on, or one finished in the last few days is still missing its final score; `force` reads it
 * anyway (the import-match-scores script). A final score is never replaced by a live one.
 */
export async function importMatchScores(db: SupabaseClient, season: number, nowMs: number, opts: { force?: boolean } = {}): Promise<MatchScoreReport> {
  const s = getSeason(season);
  const have = await savedMatchScores(db, season);
  if (!opts.force) {
    const finalKeys = new Set(have.filter((m) => m.final !== false).map((m) => scoreKey(m.realRound, m.homeTeam)));
    const on = s.fixtures.filter((f) => kickoffMs(f) > 0 && kickoffMs(f) <= nowMs && nowMs < kickoffMs(f) + GAME_LIVE_MS);
    const missing = [...on, ...recentlyFinishedFixtures(s, nowMs)].filter((f) => {
      const h = teamCode(f.homeTeam);
      return h && !finalKeys.has(scoreKey(Number(f.week), h));
    });
    if (!missing.length) return { checked: false, saved: 0, unmatched: [] };
  }

  const { scores, unmatched } = planMatchScores(feedGames(await getJson(FANTASY_ROUNDS_URL), nowMs), s.fixtures);
  const same = new Map(have.map((m) => [scoreKey(m.realRound, m.homeTeam), m]));
  const changed = scores.filter((m) => {
    const old = same.get(scoreKey(m.realRound, m.homeTeam));
    if (old && old.final !== false && m.final === false) return false; // never back from final to live
    return !old || old.awayTeam !== m.awayTeam || old.homeScore !== m.homeScore || old.awayScore !== m.awayScore || (old.final !== false) !== (m.final !== false);
  });
  if (changed.length) {
    const now = new Date(nowMs).toISOString();
    const { error } = await db.from("match_results").upsert(
      changed.map((m) => ({ season, real_round: m.realRound, home_team: m.homeTeam, away_team: m.awayTeam, home_score: m.homeScore, away_score: m.awayScore, final: m.final !== false, updated_at: now })),
      { onConflict: "season,real_round,home_team" }
    );
    if (error) throw error;
  }
  return { checked: true, saved: changed.length, unmatched };
}
