// lib/league/types.ts
export type PlayoffFormat = "none" | "final2" | "final3" | "final4" | "final6";

export type LeagueTeam = {
  id: string;
  name: string;
  initials: string;      // team initials (branding)
  userId: string;        // owner username
  userInitials?: string;  // ✅ owner initials (from first/last or username)
  pictureUrl?: string | null; // team picture (E5), shown in a circle; none = initials
  stars?: number; // championships the owner has won in this league's history (E8)
  ownerName?: string | null; // the owner, e.g. "Ethan S." (under the team name on the ladder)
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
  /** E8: the commissioner can restart this (earlier-season) league for the current season */
  canRestart?: boolean;
  /** E8: when restarting opens (a month before the season starts); null if it can't be restarted */
  restartOpensAt?: number | null;

  // season alignment
  realRegularSeasonRounds: number;
  startRound: number;

  totalWeeks: number;
  currentWeek: number;

};
