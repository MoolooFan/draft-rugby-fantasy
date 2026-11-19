// lib/coach/nameRules.ts
// Rules for the coach's name (lib/coach/name.ts), shared by the page and the server.
export const DEFAULT_COACH_NAME = "AI Coach";
export const COACH_NAME_MAX = 24;

/** Tidy a typed name: trimmed, single spaces, at most 24 characters; empty = no name (null). */
export function cleanCoachName(input: unknown): string | null {
  const s = String(input ?? "").replace(/\s+/g, " ").trim().slice(0, COACH_NAME_MAX).trim();
  return s || null;
}
