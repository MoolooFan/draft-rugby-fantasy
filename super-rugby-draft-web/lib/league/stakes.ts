// lib/league/stakes.ts
// League rewards / punishments (Ethan, 19 Nov 2026). The commissioner writes them in League
// Settings (optional, can change any time); everyone else gets a pop-up and taps "I agree".
// A change means everyone agrees again (the commissioner counts as agreeing to their own).
export const STAKES_MAX = 600;

export type LeagueStakes = {
  rewards: string | null;
  punishments: string | null;
  version: number;
  isCommissioner: boolean;
  myTeamId: string | null;
  myAgreedVersion: number;
  teams: Array<{ id: string; name: string; ownerName: string | null; agreed: boolean; agreedAt: string | null }>;
};

/** Tidy typed text: trimmed, at most 600 characters; empty = none (null). */
export function cleanStakesText(input: unknown): string | null {
  const s = String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, STAKES_MAX)
    .trim();
  return s || null;
}

/** Is there anything to agree to? */
export function hasStakes(s: Pick<LeagueStakes, "rewards" | "punishments"> | null | undefined): boolean {
  return !!(s?.rewards || s?.punishments);
}

/** Should this user see the "I agree" pop-up? */
export function needsAgreement(s: LeagueStakes | null | undefined): boolean {
  return !!s && hasStakes(s) && !!s.myTeamId && !s.isCommissioner && s.myAgreedVersion < s.version;
}
