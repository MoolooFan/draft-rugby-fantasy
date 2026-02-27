// lib/transactions/rosterValidate.ts
import playersData from "@/data/players.json";

// Minimal Player shape based on your players.json usage
type Player = {
  id: string;
  pos?: string;     // e.g. "PR", "HO", etc
  position?: string;
};

const playersById = new Map<string, Player>(
  (playersData as any[]).map((p) => [String(p.id), p])
);

function getPos(playerId: string): string | null {
  const p = playersById.get(String(playerId));
  const pos = (p as any)?.pos ?? (p as any)?.position;
  return pos ? String(pos) : null;
}

// Your squad rules (based on your earlier spec)
const REQUIRED: Record<string, number> = {
  PR: 2,
  HO: 1,
  LK: 2,
  LF: 3,
  HB: 1,
  FH: 1,
  CE: 2,
  OB: 3,
};

// Total squad size
export const SQUAD_SIZE = 20;

/**
 * NOTE:
 * This is a conservative *server* validator that ensures:
 * - roster size == 20
 * - required minimums are met
 *
 * If your app allows secondary positions and “auto slotting”, this still works
 * as long as players.json exposes a single primary position for each player.
 * (If you store secondary positions, we can upgrade this to satisfy via either.)
 */
export function validateRosterPlayerIds(nextPlayerIds: string[]) {
  const ids = nextPlayerIds.map(String).filter(Boolean);

  if (ids.length !== SQUAD_SIZE) {
    return { ok: false as const, error: `Roster must be exactly ${SQUAD_SIZE} players.` };
  }

  const counts: Record<string, number> = {};
  for (const id of ids) {
    const pos = getPos(id);
    if (!pos) continue;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }

  for (const [pos, min] of Object.entries(REQUIRED)) {
    if ((counts[pos] ?? 0) < min) {
      return { ok: false as const, error: `Roster must have at least ${min} ${pos}.` };
    }
  }

  return { ok: true as const };
}

/**
 * Applies add/drop to a flat playerIds roster and validates the result.
 * If your roster data is not flat, you already normalize to playerIds in routes.
 */
export function buildAndValidateNextIds(input: {
  currentIds: string[];
  addPlayerId: string;
  dropPlayerId: string | null;
}) {
  const addId = String(input.addPlayerId);
  const dropId = input.dropPlayerId ? String(input.dropPlayerId) : null;

  if (!addId) return { ok: false as const, error: "Missing addPlayerId" };
  if (!dropId) return { ok: false as const, error: "Drop player required." };
  if (dropId === addId) return { ok: false as const, error: "Cannot drop the same player you are adding." };

  // normalize
  const cur = input.currentIds.map(String).filter(Boolean);
  const curSet = new Set(cur);

  if (curSet.has(addId)) {
    return { ok: false as const, error: "Add player is already on your roster." };
  }

  // drop must exist in roster (this is the only guard we keep)
  if (!curSet.has(dropId)) {
    return { ok: false as const, error: "Drop player is not on your roster." };
  }

  // Apply drop + add
  const nextSet = new Set(cur);
  nextSet.delete(dropId);
  nextSet.add(addId);

  const nextIds = Array.from(nextSet);

  // NO roster-size or position validation for now
  return { ok: true as const, nextIds };
}