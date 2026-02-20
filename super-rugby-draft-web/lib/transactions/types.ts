export type TransactionWindow = "WAIVERS" | "FREE_AGENCY";

export type WaiverClaimStatus = "PENDING" | "PROCESSED" | "FAILED" | "DECLINED";

export type WaiverClaim = {
  id: string;
  leagueId: string;
  week: number; // selectionWeek this claim is for
  teamId: string; // claimant team

  addPlayerId: string;
  dropPlayerId: string | null;

  priority: number; // 1 = highest
  status: WaiverClaimStatus;

  createdAtMs: number;
  updatedAtMs: number;

  // when processed/decided
  processedAtMs?: number;
  decidedAtMs?: number;
  decidedReason?: string;
};

export type TradeOfferStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";

export type TradeOffer = {
  id: string;
  leagueId: string;
  week: number;

  fromTeamId: string;
  toTeamId: string;

  offerPlayerIds: string[];
  requestPlayerIds: string[];

  status: TradeOfferStatus;
  createdAtMs: number;

  note?: string;

  // optional fields when decided:
  decidedAtMs?: number;
  decidedReason?: string;

  acceptedAtMs?: number;
  declinedAtMs?: number;
  cancelledAtMs?: number;

    updatedAtMs: number;

};

export type FreeAgentTransferStatus = "PROCESSED" | "FAILED" | "DECLINED";

export type FreeAgentTransfer = {
  id: string;
  leagueId: string;
  week: number;
  teamId: string;

  addPlayerId: string;
  dropPlayerId: string | null;


  status: FreeAgentTransferStatus;

  createdAtMs: number;
  updatedAtMs: number;
};

export type DropLock = {
  playerId: string;
  leagueId: string;
  week: number;
  lockedUntilMs: number;
  droppedByTeamId: string;
  droppedAtMs: number;
  reason: "WAIVER_PROCESSING" | "FREE_AGENCY_DROP";
};
