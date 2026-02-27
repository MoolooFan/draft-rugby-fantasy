// lib/ids.ts
export function normalizeLeagueId(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // Accept "league_<uuid>" or "<uuid>" and always return DB format "league_<uuid>"
  return s.startsWith("league_") ? s : `league_${s}`;
}