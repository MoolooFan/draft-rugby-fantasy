// lib/ids.ts
export function normalizeLeagueId(input: unknown): string {
  const s = String(input ?? "").trim();
  if (!s) return "";

  // Accept "league_<uuid>" or "<uuid>" and always return DB format "league_<uuid>".
  // The demo site's league (scripts/demo-league.ts) is "demo_league_2026": leave those as they are.
  return s.startsWith("league_") || s.startsWith("demo_") ? s : `league_${s}`;
}
