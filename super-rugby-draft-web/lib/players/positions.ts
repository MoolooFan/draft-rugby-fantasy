// lib/players/positions.ts
// A player can have up to three positions (main, second, third). Every "can this player play
// there?" check uses these, so all three always count.

type HasPositions = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null } | null | undefined;

/** The player's positions, e.g. ["FH", "CE", "OB"] (upper case, no blanks or repeats). */
export function playerPositions(p: HasPositions | Record<string, unknown>): string[] {
  const q = (p ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  for (const v of [q.posAbbrev, q.secondaryPosAbbrev, q.thirdPosAbbrev]) {
    const s = String(v ?? "").trim().toUpperCase();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function canPlayPosition(p: HasPositions | Record<string, unknown>, pos: string): boolean {
  return playerPositions(p).includes(String(pos).trim().toUpperCase());
}

/** Short label for lists and cards, e.g. "CE/OB/FH" (up to three positions fit this way). */
export function positionsLabel(p: HasPositions | Record<string, unknown>): string {
  return playerPositions(p).join("/") || "—";
}
