// lib/league/types.ts
export type PlayoffFormat = "none" | "final2" | "final3" | "final4" | "final6";

export type LeagueTeam = {
  id: string;
  name: string;
  initials: string;      // team initials (branding)
  userId: string;        // owner username
  userInitials?: string;  // ✅ owner initials (from first/last or username)
};

export type DraftStatus = "scheduled" | "live" | "complete";

export type League = {
  id: string;
  name: string;
  code: string;
  createdByUserId: string;

  teams: LeagueTeam[];
  draftDateTimeText: string; // display
  draftAt: number | null;    // logic (ms timestamp)
  draftStatus: DraftStatus;  // new

    playoffFormat: PlayoffFormat;

  // scoring (item 12): the system, and the point values this league actually uses
  scoringSystem?: "standard" | "alternate" | "custom";
  scoringRules?: Record<string, unknown>;
  scoringCustom?: import("@/lib/scoring").ScoringRules | Record<string, unknown> | null;
  scoringLocked?: boolean;
  bonusPoints?: boolean;
  season?: number;

  // season alignment
  realRegularSeasonRounds: number;
  startRound: number;

  totalWeeks: number;
  currentWeek: number;

};
