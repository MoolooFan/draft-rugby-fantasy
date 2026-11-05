// lib/league/ladder.ts
// The league ladder (standings) from finalised regular-season matchups.
// 4 points for a win, 2 for a draw, plus bonus points (if the league uses them).
// Order: ladder points, then points for, then points difference.
// A bye: the team's score counts toward points for, but no win, loss or ladder points.
import { BONUS_POINTS, LADDER_POINTS } from "@/lib/season";
import { roundPoints } from "@/lib/scoring";

export type LadderMatchup = {
  kind: string;
  status: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  home_bonus?: number | null;
  away_bonus?: number | null;
};

export type LadderRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  byes: number;
  bonus: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  ladderPoints: number;
};

/** Bonus ladder points for a finished regular-season game. */
export function bonusPoints(homeScore: number, awayScore: number, enabled: boolean): { home: number; away: number } {
  if (!enabled || homeScore === awayScore) return { home: 0, away: 0 };
  const margin = Math.abs(homeScore - awayScore);
  const winnerBonus = margin >= BONUS_POINTS.winMarginAtLeast ? BONUS_POINTS.ladderPoints : 0;
  const loserBonus = margin <= BONUS_POINTS.loseMarginAtMost ? BONUS_POINTS.ladderPoints : 0;
  return homeScore > awayScore ? { home: winnerBonus, away: loserBonus } : { home: loserBonus, away: winnerBonus };
}

export function buildLadder(teamIds: string[], matchups: LadderMatchup[]): LadderRow[] {
  const rows = new Map<string, LadderRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, byes: 0, bonus: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, ladderPoints: 0 }])
  );
  for (const m of matchups) {
    if (m.kind !== "regular" || m.status !== "final" || !m.home_team_id || m.home_score == null) continue;
    const home = rows.get(m.home_team_id);
    if (!home) continue;
    if (!m.away_team_id) {
      home.byes++;
      home.pointsFor += Number(m.home_score);
      continue;
    }
    const away = rows.get(m.away_team_id);
    if (!away || m.away_score == null) continue;
    const hs = Number(m.home_score), as = Number(m.away_score);
    home.played++; away.played++;
    home.pointsFor += hs; home.pointsAgainst += as;
    away.pointsFor += as; away.pointsAgainst += hs;
    if (hs > as) { home.won++; away.lost++; home.ladderPoints += LADDER_POINTS.win; }
    else if (as > hs) { away.won++; home.lost++; away.ladderPoints += LADDER_POINTS.win; }
    else { home.drawn++; away.drawn++; home.ladderPoints += LADDER_POINTS.draw; away.ladderPoints += LADDER_POINTS.draw; }
    const hb = Number(m.home_bonus ?? 0), ab = Number(m.away_bonus ?? 0);
    home.bonus += hb; away.bonus += ab;
    home.ladderPoints += hb; away.ladderPoints += ab;
  }
  for (const r of rows.values()) {
    r.pointsFor = roundPoints(r.pointsFor);
    r.pointsAgainst = roundPoints(r.pointsAgainst);
    r.pointsDiff = roundPoints(r.pointsFor - r.pointsAgainst);
  }
  return [...rows.values()].sort(
    (a, b) => b.ladderPoints - a.ladderPoints || b.pointsFor - a.pointsFor || b.pointsDiff - a.pointsDiff
  );
}
