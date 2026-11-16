// lib/league/ladder.ts
// The league ladder (standings) from finalised regular-season matchups.
// 4 points for a win, 2 for a draw, plus bonus points (if the league uses them), plus the
// Shield's ladder rewards (lib/league/shield.ts, saved on each game when it's finalised).
// Order: ladder points, then the shield holder if the league uses that tie-break, then points
// for, then points difference.
// A bye: the team's score counts toward points for, but no win, loss or ladder points.
import { BONUS_POINTS, LADDER_POINTS } from "@/lib/season";
import { cleanBonusRules, type BonusRules } from "@/lib/league/bonus";
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
  /** the Shield's ladder points (defence / taking it) */
  home_shield_pts?: number | null;
  away_shield_pts?: number | null;
  /** who held the Shield after this game (only saved when the league uses the tie-break) */
  shield_holder_after?: string | null;
  weeks?: number[] | null;
};

export type LadderRow = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  byes: number;
  bonus: number;
  /** ladder points from the Shield */
  shieldPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  ladderPoints: number;
};

/**
 * Bonus ladder points for a finished regular-season game. `rules`: the league's bonus rules
 * (lib/league/bonus.ts: each bonus on/off with its own margin), or the old on/off switch.
 */
export function bonusPoints(homeScore: number, awayScore: number, rules: BonusRules | boolean): { home: number; away: number } {
  const r = typeof rules === "boolean" ? cleanBonusRules(null, rules) : rules;
  if (homeScore === awayScore) return { home: 0, away: 0 };
  const margin = Math.abs(homeScore - awayScore);
  const winnerBonus = r.win.on && margin >= r.win.margin ? BONUS_POINTS.ladderPoints : 0;
  const loserBonus = r.lose.on && margin <= r.lose.margin ? BONUS_POINTS.ladderPoints : 0;
  return homeScore > awayScore ? { home: winnerBonus, away: loserBonus } : { home: loserBonus, away: winnerBonus };
}

export function buildLadder(teamIds: string[], matchups: LadderMatchup[]): LadderRow[] {
  const rows = new Map<string, LadderRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, byes: 0, bonus: 0, shieldPoints: 0, pointsFor: 0, pointsAgainst: 0, pointsDiff: 0, ladderPoints: 0 }])
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
    const hsp = Number(m.home_shield_pts ?? 0), asp = Number(m.away_shield_pts ?? 0);
    home.shieldPoints += hsp; away.shieldPoints += asp;
    home.ladderPoints += hsp; away.ladderPoints += asp;
  }
  const holder = tieBreakHolder(
    matchups
      .filter((m) => m.kind === "regular" && m.status === "final")
      .map((m) => ({ week: Math.max(0, ...((m.weeks ?? []).map(Number))), holder: m.shield_holder_after ?? null }))
  );
  for (const r of rows.values()) {
    r.pointsFor = roundPoints(r.pointsFor);
    r.pointsAgainst = roundPoints(r.pointsAgainst);
    r.pointsDiff = roundPoints(r.pointsFor - r.pointsAgainst);
  }
  return [...rows.values()].sort(ladderOrder(holder, (r) => r.teamId, (r) => r.ladderPoints, (r) => r.pointsFor, (r) => r.pointsDiff));
}

/** The shield holder for the ladder tie-break: as saved on the latest finished game (null = none / tie-break off). */
export function tieBreakHolder(games: Array<{ week: number; holder: string | null | undefined }>): string | null {
  let best: { week: number; holder: string | null } | null = null;
  for (const g of games) if (!best || g.week > best.week) best = { week: g.week, holder: g.holder ?? null };
  return best?.holder ?? null;
}

/** Ladder order (shared with the pages' own ladders): points, shield holder if level, points for, difference. */
export function ladderOrder<T>(holder: string | null, id: (r: T) => string, pts: (r: T) => number, pf: (r: T) => number, pd: (r: T) => number) {
  return (a: T, b: T) =>
    pts(b) - pts(a) || (holder ? Number(id(b) === holder) - Number(id(a) === holder) : 0) || pf(b) - pf(a) || pd(b) - pd(a);
}
