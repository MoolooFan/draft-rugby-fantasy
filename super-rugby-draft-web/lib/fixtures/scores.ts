// lib/fixtures/scores.ts
// Real Super Rugby final scores on the season's fixtures (Ethan, 26 Nov 2026). The fixtures files
// (data/fixtures-YYYY.json, hand-supplied by Ethan) have no scores for a new season; the scores
// come from the official fantasy game after each game (lib/results/matchScores.ts) into the
// match_results table. This puts them onto the fixtures. Pure code: pages and the server use it.
import { teamCodeFromName } from "@/lib/status/articles";

/** "Crusaders" / "CRU" / "MOP" -> the site's team code ("CRU", "MOA"). */
export function teamCode(team: string | null | undefined): string | null {
  const t = String(team ?? "").trim().toUpperCase();
  if (t === "MOP") return "MOA";
  return /^[A-Z]{3}$/.test(t) ? t : teamCodeFromName(String(team ?? ""));
}

/** Team codes. */
export type MatchScore = { realRound: number; homeTeam: string; awayTeam: string; homeScore: number; awayScore: number };

export const scoreKey = (realRound: number, homeCode: string) => `${realRound}|${homeCode}`;

/**
 * The fixtures with the official final scores on them (and marked "final"). These win over a
 * score typed into the fixtures file (the 2026 file had Waratahs v Brumbies, round 15, the wrong
 * way round), like the win / draw points (lib/results/matchResults.ts). Fixtures need realRound (the Super Rugby round);
 * pages' fixtures have it (lib/season fixturesByFantasyWeek), plain season fixtures use `week`.
 */
export function withScores<
  F extends { realRound?: number; week: number; homeTeam?: string; awayTeam?: string; homeScore?: number | null; awayScore?: number | null; status?: string },
>(fixtures: F[], scores: MatchScore[] | null | undefined): F[] {
  if (!scores?.length) return fixtures;
  const byKey = new Map(scores.map((s) => [scoreKey(s.realRound, s.homeTeam), s]));
  return fixtures.map((f) => {
    const home = teamCode(f.homeTeam);
    const s = home ? byKey.get(scoreKey(f.realRound ?? f.week, home)) : undefined;
    if (!s || s.awayTeam !== teamCode(f.awayTeam)) return f;
    return { ...f, homeScore: s.homeScore, awayScore: s.awayScore, status: "final" };
  });
}
