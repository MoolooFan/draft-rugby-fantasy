// lib/transactions/rosterValidate.ts
import { getPlayerPool } from "@/lib/players/pool";

// Minimal Player shape based on your players.json usage
type Player = {
  id: string;
  pos?: string;     // e.g. "PR", "HO", etc
  position?: string;
};

// The player pool from the database (loaded by the pages); rebuilt when it changes.
let poolRef: unknown[] | null = null;
let poolById = new Map<string, Player>();
function playersByIdNow(): Map<string, Player> {
  const pool = getPlayerPool();
  if (pool !== poolRef) {
    poolRef = pool;
    poolById = new Map<string, Player>((pool as any[]).map((p) => [String(p.id), p]));
  }
  return poolById;
}

function getPos(playerId: string): string | null {
  const p = playersByIdNow().get(String(playerId));
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