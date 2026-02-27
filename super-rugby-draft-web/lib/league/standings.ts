export type ResultRow = {
  league_id: string;
  week_no: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
};

export type TeamStanding = {
  teamId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pf: number;
  pa: number;
  points: number; // league points (e.g. 4 win, 2 draw)
};

export function buildStandingsFromResults(opts: {
  teams: Array<{ id: string; name: string }>;
  results: ResultRow[];
  pointsForWin?: number;
  pointsForDraw?: number;
}) {
  const pointsForWin = opts.pointsForWin ?? 4;
  const pointsForDraw = opts.pointsForDraw ?? 2;

  const byTeam = new Map<string, TeamStanding>();
  for (const t of opts.teams) {
    byTeam.set(t.id, {
      teamId: t.id,
      name: t.name,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      pf: 0,
      pa: 0,
      points: 0,
    });
  }

  for (const r of opts.results) {
    const home = byTeam.get(r.home_team_id);
    const away = byTeam.get(r.away_team_id);
    if (!home || !away) continue;

    const hs = Number(r.home_score ?? 0);
    const as = Number(r.away_score ?? 0);

    home.played += 1;
    away.played += 1;

    home.pf += hs; home.pa += as;
    away.pf += as; away.pa += hs;

    if (hs > as) {
      home.wins += 1; away.losses += 1;
      home.points += pointsForWin;
    } else if (as > hs) {
      away.wins += 1; home.losses += 1;
      away.points += pointsForWin;
    } else {
      home.draws += 1; away.draws += 1;
      home.points += pointsForDraw;
      away.points += pointsForDraw;
    }
  }

  const arr = Array.from(byTeam.values());
  arr.sort((a, b) => {
    // Points, then points diff, then PF
    const pdA = a.pf - a.pa;
    const pdB = b.pf - b.pa;
    if (b.points !== a.points) return b.points - a.points;
    if (pdB !== pdA) return pdB - pdA;
    return b.pf - a.pf;
  });

  return arr;
}