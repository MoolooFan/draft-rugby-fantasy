// lib/league/lineup.ts
// Makes a saved lineup match the team's current roster. Used when a round locks: a team that
// didn't save a lineup for the round uses its most recent one, updated for any adds, drops
// or trades since then.
//
// - Players no longer on the roster are taken out.
// - Each new player goes into a slot a departed player left, if he can play that position.
// - Otherwise a bench player who can play that position moves up, and the new player takes
//   his bench spot.
// - Otherwise the new player goes into the gap anyway (auto-subs can still fix it).
import { BENCH_SLOTS, SLOT_POSITION, STARTER_SLOTS, type Lineup, type LineupPlayer, type SlotId } from "@/lib/scoring/week";
import { canPlayPosition } from "@/lib/players/positions";

const ALL_SLOTS: SlotId[] = [...STARTER_SLOTS, ...BENCH_SLOTS];

function canPlay(p: LineupPlayer | null | undefined, pos: string): boolean {
  if (!p) return false;
  return canPlayPosition(p, pos);
}

/**
 * lineup: the most recent saved lineup (or null if the team never saved one).
 * roster: the team's players right now (with positions), in roster order.
 */
export function reconcileLineup(lineup: Lineup | null, roster: LineupPlayer[]): Lineup {
  const onRoster = new Map(roster.map((p) => [p.id, p]));
  const out: Lineup = {};
  const placed = new Set<string>();

  // Keep players still on the roster (with fresh position info), in their slots.
  for (const slot of ALL_SLOTS) {
    const p = lineup?.[slot];
    const current = p?.id ? onRoster.get(p.id) : undefined;
    if (current && !placed.has(current.id)) {
      out[slot] = { ...p, ...current };
      placed.add(current.id);
    } else {
      out[slot] = null;
    }
  }

  const newcomers = roster.filter((p) => !placed.has(p.id));
  for (const p of newcomers) {
    const emptyStarters = STARTER_SLOTS.filter((s) => !out[s]);
    // 1. A starting gap he can fill.
    const fit = emptyStarters.find((s) => canPlay(p, SLOT_POSITION[s]));
    if (fit) { out[fit] = p; continue; }
    // 2. A bench player who can fill a starting gap moves up; newcomer takes his bench spot.
    let moved = false;
    for (const s of emptyStarters) {
      const b = BENCH_SLOTS.find((bs) => canPlay(out[bs], SLOT_POSITION[s]));
      if (b) { out[s] = out[b]; out[b] = p; moved = true; break; }
    }
    if (moved) continue;
    // 3. An empty bench spot.
    const benchGap = BENCH_SLOTS.find((s) => !out[s]);
    if (benchGap) { out[benchGap] = p; continue; }
    // 4. Any remaining gap.
    const anyGap = ALL_SLOTS.find((s) => !out[s]);
    if (anyGap) out[anyGap] = p;
  }
  return out;
}
