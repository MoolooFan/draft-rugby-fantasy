// lib/league/powerRankings.ts
// Weekly power rankings (plan item F2, a League tab updated each finalised round). Each team's
// power score mixes three things, each against the league average (100 = average team):
//   35%  season average score (regular-season rounds so far)
//   25%  recent form: average of the last 3 rounds
//   40%  roster strength: projected score of its best possible XV for the next round
//        (expected points, captain x2 on the best projection)
// Before any round is played it's roster strength only. Pure code (scripts/tests/power.test.ts).
import { startersOf } from "@/lib/scoring/week";
import { slotAccepts, type SquadFormat } from "@/lib/league/squad";
import type { HasPositions } from "@/lib/players/positions";

export const POWER_WEIGHTS = { season: 0.35, recent: 0.25, roster: 0.4 };
export const RECENT_ROUNDS = 3;

export type PowerRow = {
  teamId: string;
  rank: number;
  score: number;
  seasonAvg: number | null;
  recentAvg: number | null;
  rosterProjection: number;
};

type Player = HasPositions & { id: string };

/** Best possible team by projection (each starting spot filled by someone who can play it), captain x2. */
export function bestXvProjection(players: Player[], projection: (id: string) => number, format?: SquadFormat | null): number {
  const slots = startersOf(format);
  const n = slots.length, m = players.length;
  if (!m) return 0;
  // Hungarian method (rows = slots, columns = players; m >= n via dummy players worth 0)
  const cols = Math.max(m, n);
  const BIG = 1e6;
  const cost = (i: number, j: number) => (j >= m || !slotAccepts(slots[i], players[j]) ? BIG : -Math.max(0, projection(players[j].id)));
  const u = new Array(n + 1).fill(0), v = new Array(cols + 1).fill(0), p = new Array(cols + 1).fill(0), way = new Array(cols + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(cols + 1).fill(Infinity), used = new Array(cols + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= cols; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= cols; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const picked: number[] = [];
  for (let j = 1; j <= cols; j++) {
    if (p[j] && j - 1 < m && cost(p[j] - 1, j - 1) < BIG) picked.push(Math.max(0, projection(players[j - 1].id)));
  }
  const total = picked.reduce((a, b) => a + b, 0);
  return Math.round((total + Math.max(0, ...picked)) * 10) / 10; // + captain's second helping
}

export function powerRankings(input: {
  teamIds: string[];
  /** finalised regular-season scores so far */
  scores: Array<{ teamId: string; week: number; score: number }>;
  /** each team's best-XV projection for the next round */
  rosterProjection: Record<string, number>;
}): PowerRow[] {
  const weeks = [...new Set(input.scores.map((s) => s.week))].sort((a, b) => a - b);
  const recentWeeks = weeks.slice(-RECENT_ROUNDS);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const rows = input.teamIds.map((teamId) => {
    const mine = input.scores.filter((s) => s.teamId === teamId);
    return {
      teamId,
      seasonAvg: avg(mine.map((s) => s.score)),
      recentAvg: avg(mine.filter((s) => recentWeeks.includes(s.week)).map((s) => s.score)),
      rosterProjection: input.rosterProjection[teamId] ?? 0,
    };
  });
  const leagueAvg = (k: "seasonAvg" | "recentAvg" | "rosterProjection") => avg(rows.map((r) => r[k]).filter((x): x is number => x != null && x > 0));
  const la = { season: leagueAvg("seasonAvg"), recent: leagueAvg("recentAvg"), roster: leagueAvg("rosterProjection") };
  const parts = (r: (typeof rows)[number]) => {
    const out: Array<[number, number]> = [];
    if (la.season && r.seasonAvg != null) out.push([POWER_WEIGHTS.season, r.seasonAvg / la.season]);
    if (la.recent && r.recentAvg != null) out.push([POWER_WEIGHTS.recent, r.recentAvg / la.recent]);
    if (la.roster) out.push([POWER_WEIGHTS.roster, r.rosterProjection / la.roster]);
    const w = out.reduce((a, [x]) => a + x, 0);
    return w ? (out.reduce((a, [x, v]) => a + x * v, 0) / w) * 100 : 100;
  };
  return rows
    .map((r) => ({ ...r, score: Math.round(parts(r) * 10) / 10 }))
    .sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId))
    .map((r, i) => ({ ...r, rank: i + 1, seasonAvg: r.seasonAvg == null ? null : Math.round(r.seasonAvg), recentAvg: r.recentAvg == null ? null : Math.round(r.recentAvg) }));
}
