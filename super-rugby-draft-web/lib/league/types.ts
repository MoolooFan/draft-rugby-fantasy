// lib/league/types.ts
export type PlayoffFormat = "none" | "final2" | "final3" | "final4";

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

  // season alignment
  realRegularSeasonRounds: number;
  startRound: number;

  totalWeeks: number;
  currentWeek: number;

};
