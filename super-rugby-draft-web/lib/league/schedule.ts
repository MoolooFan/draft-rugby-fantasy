// lib/league/schedule.ts
import type { LeagueTeam, PlayoffFormat } from "./types";

export type MatchupRow = {
  weekNo: number;
  homeTeamId: string | null; // null = BYE
  awayTeamId: string | null; // null = BYE
};

function rotate<T>(arr: T[]) {
  // keeps arr[0] fixed, rotates the rest
  if (arr.length <= 2) return arr;
  const fixed = arr[0];
  const rest = arr.slice(1);
  const last = rest.pop()!;
  return [fixed, last, ...rest];
}

/**
 * Standard "circle method" round robin.
 * - Works for even/odd team counts.
 * - If odd, we add a BYE (null).
 * - Returns exactly `weeks` weeks, repeating the cycle if needed.
 */
export function buildRoundRobinSchedule(params: {
  teams: LeagueTeam[];
  weeks: number;
}): MatchupRow[] {
  const { teams, weeks } = params;

  if (teams.length < 2) return [];

  let ids: Array<string | null> = teams.map((t) => t.id);
  const isOdd = ids.length % 2 === 1;
  if (isOdd) ids = [...ids, null];

  const n = ids.length; // even after BYE padding
  const roundsPerCycle = n - 1;

  let wheel = [...ids];
  const cycle: MatchupRow[] = [];

  for (let round = 1; round <= roundsPerCycle; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = wheel[i];
      const b = wheel[n - 1 - i];

      const home = round % 2 === 1 ? a : b;
      const away = round % 2 === 1 ? b : a;

      cycle.push({
        weekNo: round,
        homeTeamId: home,
        awayTeamId: away,
      });
    }
    wheel = rotate(wheel);
  }

  const out: MatchupRow[] = [];
  for (let w = 1; w <= weeks; w++) {
    const roundIndex = ((w - 1) % roundsPerCycle) + 1;
    const rowsForRound = cycle.filter((r) => r.weekNo === roundIndex);

    for (const row of rowsForRound) {
      out.push({ ...row, weekNo: w });
    }
  }

  return out;
}

export function buildLeagueSchedule(params: {
  teams: LeagueTeam[];
  totalWeeks: number;
  currentWeek: number;
  playoffFormat: PlayoffFormat;
}): MatchupRow[] {
  // For now: just a round-robin for all weeks.
  // (We’ll add playoffs + consolation logic next.)
  return buildRoundRobinSchedule({ teams: params.teams, weeks: params.totalWeeks });
}
