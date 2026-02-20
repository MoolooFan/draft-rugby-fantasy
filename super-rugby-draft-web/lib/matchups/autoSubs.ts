import type { SlotDef, SlotId, Player, Lineup } from "@/lib/teamSelection/types";
import { BENCH_IDS } from "@/lib/teamSelection/types";

export type PlayerWeekPoints = {
  playerId: string;
  points: number | null; // ✅ null = did not play (your rule)
};



function isStarterSlot(slotDefs: SlotDef[], id: SlotId) {
  return !!slotDefs.find(s => s.id === id)?.starter;
}

function findSlotOfPlayer(slotDefs: SlotDef[], l: Lineup, playerId: string | null): SlotId | null {
  if (!playerId) return null;
  for (const s of slotDefs) {
    const p = l[s.id as SlotId];
    if (p?.id === playerId) return s.id as SlotId;
  }
  return null;
}

function adjustBadgeAfterLineupChange(slotDefs: SlotDef[], prev: Lineup, next: Lineup, badgeId: string | null) {
  if (!badgeId) return null;

  const prevSlot = findSlotOfPlayer(slotDefs, prev, badgeId);
  const nextSlot = findSlotOfPlayer(slotDefs, next, badgeId);

  if (nextSlot && isStarterSlot(slotDefs, nextSlot)) return badgeId;

  if (prevSlot && isStarterSlot(slotDefs, prevSlot)) {
    const replacement = next[prevSlot];
    if (replacement?.id) return replacement.id;
  }

  return null;
}

// You already have this logic in Team Selection page.
// For now, pass it in from the page (same function).
export function applyAutoSubsDeterministic(args: {
  slotDefs: SlotDef[];
  lockedLineup: Lineup;
  points: PlayerWeekPoints[];
  canPlayerFitSlot: (player: Player, slot: SlotDef) => boolean;
  captainId: string | null;
  viceId: string | null;
}) {
  const { slotDefs, lockedLineup, points, canPlayerFitSlot } = args;
  const pointsById = new Map(points.map(p => [p.playerId, p.points]));

  const starterIds = slotDefs.filter(s => s.starter).map(s => s.id as SlotId);

  let next: Lineup = { ...lockedLineup };
  let captainId = args.captainId;
  let viceId = args.viceId;

  const didPlay = (p: Player) => pointsById.get(p.id) !== null && pointsById.get(p.id) !== undefined;

  for (const starterId of starterIds) {
    const starter = next[starterId];
    if (!starter) continue;

    if (didPlay(starter)) continue;

    const starterSlot = slotDefs.find(s => s.id === starterId)!;

    const benchPickId = BENCH_IDS.find((bid) => {
      const bp = next[bid];
      if (!bp) return false;
      if (!didPlay(bp)) return false;
      return canPlayerFitSlot(bp, starterSlot);
    });

    if (!benchPickId) continue;

    const prev = next;
    next = { ...next, [starterId]: next[benchPickId]!, [benchPickId]: starter };

    captainId = adjustBadgeAfterLineupChange(slotDefs, prev, next, captainId);
    viceId = adjustBadgeAfterLineupChange(slotDefs, prev, next, viceId);
  }

  const benchScore = BENCH_IDS.reduce((sum, bid) => {
    const p = next[bid];
    if (!p) return sum;
    const pts = pointsById.get(p.id);
    return sum + (typeof pts === "number" ? pts : 0);
  }, 0);

  return { lineup: next, captainId, viceId, benchScore };
}
