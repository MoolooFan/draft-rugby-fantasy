// lib/players/roundIndex.ts
// A player's stat rows, found quickly. The pages used to scan every row of the season (about
// 3,500) for each player on every comparison while sorting the player list, which froze the
// transactions page for many seconds. Now the rows are grouped by player once per download.

const ID_KEYS = ["playerId", "player_id", "playerID", "internalPlayerId", "internal_player_id", "InternalPlayerId", "id", "player"];

export function normalisePlayerId(x: unknown): string {
  return String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const cache = new WeakMap<object, Map<string, any[]>>();

function index(rows: any[]): Map<string, any[]> {
  const hit = cache.get(rows);
  if (hit) return hit;
  const map = new Map<string, any[]>();
  for (const r of rows) {
    if (!r) continue;
    // same matching as before: any of the usual id fields, or the first field named like "...player...id..."
    const ids = new Set<string>();
    for (const k of ID_KEYS) if (r[k] != null) ids.add(normalisePlayerId(r[k]));
    const other = Object.keys(r).find((k) => k.toLowerCase().includes("player") && k.toLowerCase().includes("id"));
    if (other && r[other] != null) ids.add(normalisePlayerId(r[other]));
    for (const id of ids) {
      if (!id) continue;
      const list = map.get(id);
      if (list) list.push(r); else map.set(id, [r]);
    }
  }
  cache.set(rows, map);
  return map;
}

/** The stat rows belonging to this player (in their original order). */
export function playerRoundRows(rows: any[] | null | undefined, playerId: string): any[] {
  if (!rows?.length) return [];
  return index(rows).get(normalisePlayerId(playerId)) ?? [];
}
