// lib/draft/types.ts
export type DraftPhase = "preDraft" | "liveDraft";

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string;
  posName: string;
  secondaryPosName?: string;
  draftRank: number;
  status?: "starting" | "benched" | "out" | null;
  stats?: Record<string, number>;
};

export type Team = {
  id: string;
  name: string;
  initials: string;       // team initials
  userId?: string;
  userInitials?: string;  // ✅ owner initials
};


export type TeamRosterState = {
  slots: Record<string, Player[]>;
  wildcards: Player[];
};
