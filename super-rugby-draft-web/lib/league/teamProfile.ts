// lib/league/teamProfile.ts
// What the team profile pop-up gets from app/api/leagues/team-profile (Ethan, 20 Nov 2026).

export type TeamProfileResult = {
  week: number;
  /** finals only, e.g. "Semi Final 1" */
  label: string | null;
  kind: string;
  opponentId: string | null;
  home: boolean;
  for: number | null;
  against: number | null;
  result: "W" | "L" | "D" | "BYE";
};

export type TeamProfile = {
  teamId: string;
  myTeamId: string;
  season: number;
  draftDone: boolean;
  roster: { active: string[]; ir: string[] };
  /** null before any round is finalised */
  standings: { rank: number; of: number; moved: number | null; won: number; drawn: number; lost: number; ladderPoints: number; pointsFor: number; asOfWeek: number } | null;
  power: { rank: number; of: number; moved: number | null; titlePct: number; playoffPct: number; finalsSize: number; simulated: boolean } | null;
  shield: {
    name: string;
    holderTeamId: string | null;
    holding: boolean;
    defences: number;
    /** holding it: the next defence; otherwise the team's next game away at the holder (it's only on the line in the holder's home games) */
    next: { week: number; opponentId: string; kind: "defence" | "challenge" } | null;
  } | null;
  results: TeamProfileResult[];
};
