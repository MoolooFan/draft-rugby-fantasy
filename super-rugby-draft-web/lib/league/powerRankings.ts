// lib/league/powerRankings.ts
// A team's roster strength: the projected score of its best possible team (each starting spot
// filled by someone who can play it, captain x2). Used by the power rankings and finals / title
// chances (lib/league/powerServer.ts, lib/league/odds.ts). Pure code (scripts/tests/power.test.ts).
import { startersOf } from "@/lib/scoring/week";
import { slotAccepts, type SquadFormat } from "@/lib/league/squad";
import type { HasPositions } from "@/lib/players/positions";

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
