// lib/league/lineup.ts
// Keeps a lineup matching the team's roster after adds, drops, trades and IR moves, and when a
// week locks (a team that didn't save a lineup for the week uses its most recent one).
//
// Rules agreed with Ethan (Nov 2026):
// 1. A new player takes the spot the departed player left, if he can play it.
// 2. Otherwise the highest bench player who can play it moves up (the new player takes his
//    bench spot).
// 3. Otherwise the fewest players are moved to make a full XV.
// If no full XV is possible the change isn't allowed (the roster rules normally make sure it
// always is). Players in IR aren't passed in, so they're never in a lineup.
//
// How: every possible spot for every player gets a cost (staying put = 0, each player moved =
// one "move", plus small tie-breaks that follow the order above), and the cheapest full
// arrangement is chosen (the Hungarian method; 20 players x 20 spots is instant).
import { BENCH_SLOTS, SLOT_POSITION, STARTER_SLOTS, type Lineup, type LineupPlayer, type SlotId } from "@/lib/scoring/week";
import { canPlayPosition } from "@/lib/players/positions";

export const ALL_SLOTS: SlotId[] = [...STARTER_SLOTS, ...BENCH_SLOTS];

const INF = 1e12;
const MOVE = 1e6; // one player moved
// tie-breaks between arrangements with the same number of moves:
const BENCH_UP = 10; // x bench number: bench1 moves up before bench2
const STARTER_SHIFT = 100; // a starter changing starting spot (only if no bench player can)
const STARTER_DOWN = 200; // a starter dropping to the bench
const BENCH_SHUFFLE = 300; // a bench player changing bench spot

export type LineupUpdate =
  | { ok: true; lineup: Lineup; moved: string[] }
  | { ok: false; error: string; lineup: Lineup };

/** Minimum-cost assignment (rows to columns) of a square cost matrix. Returns col for each row. */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const rowToCol = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j] > 0) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

/**
 * prev: the lineup before the change (or null if the team never had one).
 * roster: the players who should be in the lineup now (not IR), best first (e.g. by draft pick)
 *   - with no previous lineup, the best players start.
 */
export function updateLineup(prev: Lineup | null, roster: LineupPlayer[]): LineupUpdate {
  const slotOf = new Map<string, SlotId>();
  for (const s of ALL_SLOTS) {
    const id = prev?.[s]?.id;
    if (id && !slotOf.has(id)) slotOf.set(id, s);
  }
  const players = roster.slice(0, ALL_SLOTS.length);
  const n = ALL_SLOTS.length;
  const cost: number[][] = [];
  for (let r = 0; r < n; r++) {
    const p = players[r];
    const row: number[] = [];
    for (const slot of ALL_SLOTS) {
      const starter = !slot.startsWith("bench");
      if (!p) { row.push(starter ? INF : 0); continue; } // an empty roster place: bench only
      if (starter && !canPlayPosition(p, SLOT_POSITION[slot])) { row.push(INF); continue; }
      const was = slotOf.get(p.id);
      if (!was) {
        // new to the lineup: anywhere is free, but better players (earlier in roster) start
        row.push(starter ? 0 : players.length - r);
        continue;
      }
      if (was === slot) { row.push(0); continue; }
      const wasBench = was.startsWith("bench");
      if (wasBench && starter) row.push(MOVE + BENCH_UP * Number(was.slice(5)));
      else if (!wasBench && starter) row.push(MOVE + STARTER_SHIFT);
      else if (!wasBench && !starter) row.push(MOVE + STARTER_DOWN);
      else row.push(MOVE + BENCH_SHUFFLE);
    }
    cost.push(row);
  }
  const assign = hungarian(cost);
  const lineup: Lineup = {};
  for (const s of ALL_SLOTS) lineup[s] = null;
  const moved: string[] = [];
  let full = true;
  for (let r = 0; r < n; r++) {
    const p = players[r];
    const slot = ALL_SLOTS[assign[r]];
    if (cost[r][assign[r]] >= INF) full = false;
    if (!p) continue;
    const before = prev && slotOf.has(p.id) ? prev[slotOf.get(p.id)!] : null;
    lineup[slot] = { ...(before ?? {}), ...p };
    const was = slotOf.get(p.id);
    if (was && was !== slot) moved.push(p.id);
  }
  if (!full || players.length < STARTER_SLOTS.length) {
    return { ok: false, error: "This would leave a starting spot your team can't fill", lineup };
  }
  return { ok: true, lineup, moved };
}

/**
 * Used when a week locks: the lineup matched to the roster. If no full XV is possible (shouldn't
 * happen with the roster rules) the players are still placed and auto-subs do what they can.
 */
export function reconcileLineup(lineup: Lineup | null, roster: LineupPlayer[]): Lineup {
  return updateLineup(lineup, roster).lineup;
}

// ---------------------------------------------------------------------------
// Captain and vice-captain
//
// - Start of the season: the team's 1st and 2nd draft picks (if they're starting).
// - They carry over week to week.
// - If the captain leaves the team, goes to IR or is on the bench, the vice-captain becomes
//   captain and the new vice-captain is the starter taken earliest in the draft.
// - Neither can be on the bench.

export function lineupStarterIds(lineup: Lineup | null | undefined): string[] {
  return STARTER_SLOTS.map((s) => lineup?.[s]?.id).filter((x): x is string => !!x);
}

/**
 * pickRank(id): lower = taken earlier in this league's draft (players never drafted come after
 * all drafted ones, best draft rank first).
 */
export function fixCaptains(
  lineup: Lineup | null | undefined,
  captainId: string | null | undefined,
  viceId: string | null | undefined,
  pickRank: (playerId: string) => number
): { captainId: string | null; viceId: string | null } {
  const starters = lineupStarterIds(lineup);
  const isStarter = (id: string | null | undefined): id is string => !!id && starters.includes(id);
  const byPick = [...starters].sort((a, b) => pickRank(a) - pickRank(b) || a.localeCompare(b));

  let c: string | null = isStarter(captainId) ? captainId : null;
  let v: string | null = isStarter(viceId) && viceId !== c ? viceId : null;
  if (!c) {
    c = v ?? byPick[0] ?? null;
    if (c === v) v = null;
  }
  if (!v) v = byPick.find((id) => id !== c) ?? null;
  return { captainId: c, viceId: v };
}
