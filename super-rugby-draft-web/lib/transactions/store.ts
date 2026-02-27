"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabaseBrowser } from "@/lib/supabase/client";

import type {
  DropLock,
  TradeOffer,
  WaiverClaim,
  FreeAgentTransfer,
  WaiverClaimStatus,
} from "./types";

import playersData from "@/data/players.json";
import { useDraftStore } from "@/lib/draft/store";

type AddFreeAgentTransferFn = (input: {
  leagueId: string;
  week: number;
  teamId: string;
  addPlayerId: string;
  dropPlayerId: string | null;
  createdAtMs: number;
  lockUntilMs?: number; // ✅ NEW
}) => void;

type TransactionsState = {
  claims: WaiverClaim[];
  trades: TradeOffer[];
  dropLocks: DropLock[];
  freeAgentTransfers: FreeAgentTransfer[];

  // trades
  addTradeProposal: (input: {
    leagueId: string;
    week: number;
    fromTeamId: string;
    toTeamId: string;
    offerPlayerIds: string[];
    requestPlayerIds: string[];
    createdAtMs: number;
    note?: string;
  }) => void;

  upsertTrade: (t: TradeOffer) => void;
  acceptTradeProposal: (tradeId: string, acceptedAtMs: number, tradeDeadlineMs?: number) => void;
declineTradeProposal: (tradeId: string, reason: string, decidedAtMs: number, tradeDeadlineMs?: number) => void;
cancelTradeProposal: (tradeId: string, decidedAtMs: number, tradeDeadlineMs?: number) => void;

  declinePendingTradesAtDeadline: (leagueId: string, reason: string, nowMs: number) => void;

  // waivers
  addClaim: (
    c: Omit<WaiverClaim, "id" | "createdAtMs" | "priority" | "status" | "updatedAtMs">
  ) => void;
  removeClaim: (claimId: string) => void;

  reorderClaimsForTeamWeek: (
    leagueId: string,
    week: number,
    teamId: string,
    orderedIds: string[]
  ) => void;

  // stable alias (used by UI)
  reorderClaims: (input: {
    leagueId: string;
    week: number;
    teamId: string;
    orderedIds: string[];
  }) => void;

  setClaimPriority: (claimId: string, priority: number) => void;
  updateClaimPriority: (claimId: string, priority: number) => void;

  processWaiversForWeek: (
  leagueId: string,
  week: number,
  processedAtMs: number,
  lockUntilMs?: number
) => void;

  // free agency
  addFreeAgentTransfer: AddFreeAgentTransferFn;

  // locks
  addDropLock: (l: DropLock) => void;
  cleanupExpiredDropLocks: (nowMs: number) => void;

    // supabase sync
  hydratedLeagueId: string | null;
  hydrateFromDb: (leagueId: string) => Promise<void>;
  startRealtime: (leagueId: string) => () => void; // returns unsubscribe
};

function uid(prefix = "tx") {
  return `${prefix}_${crypto.randomUUID()}`;
}

type AnyPlayer = any;

// -----------------------
// Supabase row shapes (DB) + mappers
// -----------------------
type DbDropLock = {
  id?: string;
  league_id: string;
  week: number;
  player_id: string;
  locked_until_ms: number;
  dropped_by_team_id: string | null;
  dropped_at_ms: number | null;
  reason: string | null;
  created_at?: string;
};

type DbFreeAgentTransfer = {
  id: string; // ✅ make required
  league_id: string;
  week: number;
  team_id: string;
  add_player_id: string;
  drop_player_id: string | null;
  status: string;
  decided_reason: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  created_at?: string;
  updated_at?: string;
};

type DbWaiverClaim = {
  id: string; // ✅ add
  league_id: string;
  week: number;
  team_id: string;
  add_player_id: string;
  drop_player_id: string | null;
  priority: number;
  status: string;
  decided_reason: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  processed_at_ms: number | null;
  decided_at_ms: number | null;
  created_at?: string;
  updated_at?: string;
};

// DB -> App
function fromDbLock(r: DbDropLock): DropLock {
  return {
    leagueId: r.league_id,
    week: r.week,
    playerId: r.player_id,
    lockedUntilMs: r.locked_until_ms,
    droppedByTeamId: r.dropped_by_team_id ?? undefined,
    droppedAtMs: r.dropped_at_ms ?? undefined,
    reason: r.reason ?? undefined,
  };
}

function fromDbFree(r: DbFreeAgentTransfer): FreeAgentTransfer {
  return {
    id: r.id,
    leagueId: r.league_id,
    week: r.week,
    teamId: r.team_id,
    addPlayerId: r.add_player_id,
    dropPlayerId: r.drop_player_id,
    status: String(r.status ?? "").toUpperCase() as any,
    decidedReason: r.decided_reason ?? undefined,
    createdAtMs: r.created_at_ms,
    updatedAtMs: r.updated_at_ms,
  };
}

function fromDbClaim(r: DbWaiverClaim): WaiverClaim {
  return {
    id: String(r.id ?? ""),
    leagueId: r.league_id,
    week: r.week,
    teamId: r.team_id,
    addPlayerId: r.add_player_id,
    dropPlayerId: r.drop_player_id,
    priority: r.priority,
    status: String(r.status ?? "").toUpperCase() as any,
    decidedReason: r.decided_reason ?? undefined,
    createdAtMs: r.created_at_ms,
    updatedAtMs: r.updated_at_ms,
    processedAtMs: r.processed_at_ms ?? undefined,
    decidedAtMs: r.decided_at_ms ?? undefined,
  };
}

// App -> DB
function toDbLock(l: DropLock): DbDropLock {
  return {
    league_id: l.leagueId,
    week: l.week,
    player_id: l.playerId,
    locked_until_ms: l.lockedUntilMs,
    dropped_by_team_id: (l as any).droppedByTeamId ?? null,
    dropped_at_ms: (l as any).droppedAtMs ?? null,
    reason: (l as any).reason ?? null,
  };
}

function toDbFree(f: FreeAgentTransfer): DbFreeAgentTransfer {
  return {
    id: f.id, // ✅ add
    league_id: f.leagueId,
    week: f.week,
    team_id: f.teamId,
    add_player_id: f.addPlayerId,
    drop_player_id: f.dropPlayerId ?? null,
    status: String(f.status ?? "PENDING").toUpperCase(),
    decided_reason: (f as any).decidedReason ?? null,
    created_at_ms: f.createdAtMs,
    updated_at_ms: f.updatedAtMs,
  };
}

function toDbClaim(c: WaiverClaim): DbWaiverClaim {
  return {
    id: c.id, // ✅ add
    league_id: c.leagueId,
    week: c.week,
    team_id: c.teamId,
    add_player_id: c.addPlayerId,
    drop_player_id: c.dropPlayerId ?? null,
    priority: c.priority ?? 9999,
    status: String(c.status ?? "PENDING").toUpperCase(),
    decided_reason: (c as any).decidedReason ?? null,
    created_at_ms: c.createdAtMs,
    updated_at_ms: c.updatedAtMs,
    processed_at_ms: (c as any).processedAtMs ?? null,
    decided_at_ms: (c as any).decidedAtMs ?? null,
  };
}

function getPlayerById(playerId: string): AnyPlayer | null {
  return (playersData as AnyPlayer[]).find((p) => p.id === playerId) ?? null;
}

/** Mutates teamRoster by removing playerId from any slot/wildcard arrays */
function removeFromRoster(teamRoster: any, playerId: string) {
  if (!teamRoster) return;

  if (teamRoster.slots) {
    for (const k of Object.keys(teamRoster.slots)) {
      const arr = teamRoster.slots[k];
      if (!Array.isArray(arr)) continue;
      teamRoster.slots[k] = arr.filter((p: any) => p?.id !== playerId);
    }
  }

  if (Array.isArray(teamRoster.wildcards)) {
    teamRoster.wildcards = teamRoster.wildcards.filter((p: any) => p?.id !== playerId);
  }
}

/** Mutates teamRoster: tries to add to slot matching posAbbrev; else adds to wildcards */
function addToRoster(teamRoster: any, player: AnyPlayer) {
  if (!teamRoster) return;

  const pos = String(player?.posAbbrev ?? "").toUpperCase();

  if (teamRoster.slots && Array.isArray(teamRoster.slots[pos])) {
    teamRoster.slots[pos] = [...teamRoster.slots[pos], player];
    return;
  }

  if (!Array.isArray(teamRoster.wildcards)) teamRoster.wildcards = [];
  teamRoster.wildcards = [...teamRoster.wildcards, player];
}

function applyAddDrop(teamId: string, addPlayerId: string, dropPlayerId: string | null) {
  const addP = getPlayerById(addPlayerId);
  if (!addP) return;

  // if no drop player, we can’t applyRosterMove (it expects a drop)
  // but your UI seems to allow null drops — so handle both cases:
  if (!dropPlayerId) {
    // fallback: just add into wildcards via draft store setState
    const setState = (useDraftStore as any).setState;
    if (typeof setState !== "function") return;

    setState((s: any) => {
      const next = { ...(s.rosters ?? {}) };
      const teamRoster = { ...(next[teamId] ?? {}) };

      teamRoster.slots = { ...(teamRoster.slots ?? {}) };
      teamRoster.wildcards = Array.isArray(teamRoster.wildcards) ? [...teamRoster.wildcards] : [];

      addToRoster(teamRoster, addP);

      next[teamId] = teamRoster;
      return { rosters: next };
    });

    return;
  }

    // ✅ preferred path: let draft store rebalance + enforce structure
  const draft = (useDraftStore as any).getState?.();
  if (draft?.applyRosterMove) {
    try {
      draft.applyRosterMove({
        teamId,
        addPlayer: addP,
        dropPlayerId,
      });
      return;
    } catch (e) {
      console.warn("applyRosterMove threw, falling back to manual roster update", e);
    }
  }

  // ✅ FALLBACK: directly update rosters (remove drop, add addP)
  const setState = (useDraftStore as any).setState;
  if (typeof setState !== "function") return;

  setState((s: any) => {
    const next = { ...(s.rosters ?? {}) };
    const teamRoster = { ...(next[teamId] ?? {}) };

    teamRoster.slots = { ...(teamRoster.slots ?? {}) };
    teamRoster.wildcards = Array.isArray(teamRoster.wildcards) ? [...teamRoster.wildcards] : [];

    // remove drop from anywhere
    removeFromRoster(teamRoster, dropPlayerId);

    // add the new player (pos slot if exists, else wildcard)
    addToRoster(teamRoster, addP);

    next[teamId] = teamRoster;
    return { rosters: next };
  });

}


function applyTrade(fromTeamId: string, toTeamId: string, offerIds: string[], requestIds: string[]) {
  const setState = (useDraftStore as any).setState;
  if (typeof setState !== "function") return;

  const offerPlayers = (offerIds ?? []).map(getPlayerById).filter(Boolean) as AnyPlayer[];
  const requestPlayers = (requestIds ?? []).map(getPlayerById).filter(Boolean) as AnyPlayer[];

  setState((s: any) => {
    const next = { ...(s.rosters ?? {}) };

    const fromRoster = { ...(next[fromTeamId] ?? {}) };
    fromRoster.slots = { ...(fromRoster.slots ?? {}) };
    fromRoster.wildcards = Array.isArray(fromRoster.wildcards) ? [...fromRoster.wildcards] : [];

    const toRoster = { ...(next[toTeamId] ?? {}) };
    toRoster.slots = { ...(toRoster.slots ?? {}) };
    toRoster.wildcards = Array.isArray(toRoster.wildcards) ? [...toRoster.wildcards] : [];

    // Remove outgoing first
    for (const pid of offerIds ?? []) removeFromRoster(fromRoster, pid);
    for (const pid of requestIds ?? []) removeFromRoster(toRoster, pid);

    // Add incoming
    for (const p of offerPlayers) addToRoster(toRoster, p);
    for (const p of requestPlayers) addToRoster(fromRoster, p);

    next[fromTeamId] = fromRoster;
    next[toTeamId] = toRoster;

    return { rosters: next };
  });
}

function rosterOwnedSet(teamRoster: any): Set<string> {
  const owned = new Set<string>();
  if (!teamRoster) return owned;

  for (const arr of Object.values(teamRoster?.slots ?? {})) {
    for (const p of (arr as any[]) ?? []) if (p?.id) owned.add(p.id);
  }
  for (const p of (teamRoster?.wildcards ?? []) as any[]) if (p?.id) owned.add(p.id);

  return owned;
}

// -----------------------
// Trade roster restriction helpers
// -----------------------

const REQUIRED_POS_SLOTS: string[] = [
  "HO",
  "PR",
  "PR",
  "LK",
  "LK",
  "LF",
  "LF",
  "LF",
  "HB",
  "FH",
  "CE",
  "CE",
  "OB",
  "OB",
  "OB",
];

function playerCanPlayPos(p: any, pos: string) {
  const a = String(p?.posAbbrev ?? "").toUpperCase();
  const b = String(p?.secondaryPosAbbrev ?? "").toUpperCase();
  return a === pos || b === pos;
}

function canFillRequiredSlots(players: AnyPlayer[]) {
  if (!players || players.length < REQUIRED_POS_SLOTS.length) return false;

  const required = REQUIRED_POS_SLOTS.slice();

  const candidatesByPos = new Map<string, number[]>();
  for (const pos of new Set(required)) {
    const idxs: number[] = [];
    players.forEach((pl, i) => {
      if (playerCanPlayPos(pl, pos)) idxs.push(i);
    });
    candidatesByPos.set(pos, idxs);
  }

  required.sort((a, b) => {
    const ca = candidatesByPos.get(a)?.length ?? 0;
    const cb = candidatesByPos.get(b)?.length ?? 0;
    return ca - cb;
  });

  const used = new Array(players.length).fill(false);

  function dfs(i: number): boolean {
    if (i >= required.length) return true;
    const pos = required[i];
    const cand = candidatesByPos.get(pos) ?? [];
    for (const pi of cand) {
      if (used[pi]) continue;
      used[pi] = true;
      if (dfs(i + 1)) return true;
      used[pi] = false;
    }
    return false;
  }

  return dfs(0);
}

function rosterPlayersUnique(teamRoster: any): AnyPlayer[] {
  const list: AnyPlayer[] = [];
  const seen = new Set<string>();

  for (const arr of Object.values(teamRoster?.slots ?? {})) {
    for (const p of (arr as any[]) ?? []) {
      if (!p?.id || seen.has(p.id)) continue;
      seen.add(p.id);
      list.push(p);
    }
  }
  for (const p of (teamRoster?.wildcards ?? []) as any[]) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    list.push(p);
  }

  return list;
}

function tradeRespectsRosterRules(
  fromTeamId: string,
  toTeamId: string,
  offerIds: string[],
  requestIds: string[]
) {
  const rosters = (useDraftStore.getState?.() as any)?.rosters ?? {};
  const fromRoster = rosters[fromTeamId];
  const toRoster = rosters[toTeamId];

  if (!fromRoster || !toRoster) return false;

  const fromPlayers = rosterPlayersUnique(fromRoster);
  const toPlayers = rosterPlayersUnique(toRoster);

  const nextFrom = fromPlayers
    .filter((p) => !offerIds.includes(p.id))
    .concat(requestIds.map(getPlayerById).filter(Boolean) as AnyPlayer[]);

  const nextTo = toPlayers
    .filter((p) => !requestIds.includes(p.id))
    .concat(offerIds.map(getPlayerById).filter(Boolean) as AnyPlayer[]);

  if (!canFillRequiredSlots(nextFrom)) return false;
  if (!canFillRequiredSlots(nextTo)) return false;

  return true;
}

function validateTradeBasics(
  fromTeamId: string,
  toTeamId: string,
  offerIds: string[],
  requestIds: string[]
) {
  if (!Array.isArray(offerIds) || !Array.isArray(requestIds)) {
    return { ok: false as const, reason: "Invalid players" };
  }

  if (!fromTeamId || !toTeamId || fromTeamId === toTeamId) {
    return { ok: false as const, reason: "Invalid trade teams" };
  }

  if (offerIds.length !== requestIds.length) {
    return { ok: false as const, reason: "Trade must be same number of players each side" };
  }

  if (offerIds.length === 0) {
    return { ok: false as const, reason: "Trade must include players" };
  }

  const all = [...offerIds, ...requestIds];
  if (new Set(all).size !== all.length) {
    return { ok: false as const, reason: "Duplicate players in trade" };
  }

  const rosters = (useDraftStore.getState?.() as any)?.rosters ?? {};
  const fromOwned = rosterOwnedSet(rosters[fromTeamId]);
  const toOwned = rosterOwnedSet(rosters[toTeamId]);

  for (const pid of offerIds) {
    if (!fromOwned.has(pid)) {
      return { ok: false as const, reason: "Offer contains a player not owned by sender" };
    }
  }
  for (const pid of requestIds) {
    if (!toOwned.has(pid)) {
      return { ok: false as const, reason: "Request contains a player not owned by partner" };
    }
  }

  return { ok: true as const, reason: "" };
}

// -----------------------
// Store
// -----------------------

export const useTransactionsStore = create<TransactionsState>()(
  persist(
    (set, get) => ({
      claims: [],
      trades: [],
      dropLocks: [],
      freeAgentTransfers: [],

            // -------- Supabase sync --------
      hydratedLeagueId: null,

      hydrateFromDb: async (leagueId: string) => {
        const supabase = supabaseBrowser();

        // Pull latest rows for this league
        const [locksRes, freeRes, claimsRes] = await Promise.all([
          supabase.from("drop_locks").select("*").eq("league_id", leagueId),
          supabase.from("free_agent_transfers").select("*").eq("league_id", leagueId),
          supabase.from("waiver_claims").select("*").eq("league_id", leagueId),
        ]);

        const locks = (locksRes.data ?? []).map(fromDbLock);
        const free = (freeRes.data ?? []).map(fromDbFree);
        const claims = (claimsRes.data ?? []).map(fromDbClaim);

        set({
          hydratedLeagueId: leagueId,
          dropLocks: locks,
          freeAgentTransfers: free,
          claims,
        });
      },

      startRealtime: (leagueId: string) => {
        const supabase = supabaseBrowser();

        // drop_locks
        const locksChan = supabase
          .channel(`rt_drop_locks_${leagueId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "drop_locks", filter: `league_id=eq.${leagueId}` },
            (payload: any) => {
              set((s) => {
                const next = [...(s.dropLocks ?? [])];

                // DELETE
                if (payload.eventType === "DELETE") {
                  const pid = payload.old?.player_id;
                  return { dropLocks: next.filter((x: any) => x.playerId !== pid) };
                }

                // INSERT/UPDATE
                const row = payload.new as DbDropLock;
                const mapped = fromDbLock(row);
                const rest = next.filter((x: any) => x.playerId !== mapped.playerId);
                return { dropLocks: [...rest, mapped] };
              });
            }
          )
          .subscribe();

        // free_agent_transfers
        const freeChan = supabase
          .channel(`rt_free_${leagueId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "free_agent_transfers",
              filter: `league_id=eq.${leagueId}`,
            },
            (payload: any) => {
              set((s) => {
                const next = [...(s.freeAgentTransfers ?? [])];

                if (payload.eventType === "DELETE") {
                  const id = String(payload.old?.id ?? "");
                  return { freeAgentTransfers: next.filter((x: any) => x.id !== id) };
                }

                const row = payload.new as DbFreeAgentTransfer;
                const mapped = fromDbFree(row);
                const rest = next.filter((x: any) => x.id !== mapped.id);
                return { freeAgentTransfers: [mapped, ...rest] };
              });
            }
          )
          .subscribe();

        // waiver_claims
        const claimsChan = supabase
          .channel(`rt_claims_${leagueId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "waiver_claims", filter: `league_id=eq.${leagueId}` },
            (payload: any) => {
              set((s) => {
                const next = [...(s.claims ?? [])];

                if (payload.eventType === "DELETE") {
                  const id = String(payload.old?.id ?? "");
                  return { claims: next.filter((x: any) => x.id !== id) };
                }

                const row = payload.new as DbWaiverClaim;
                const mapped = fromDbClaim(row);
                const rest = next.filter((x: any) => x.id !== mapped.id);
                return { claims: [...rest, mapped] };
              });
            }
          )
          .subscribe();

        // unsubscribe
        return () => {
          supabase.removeChannel(locksChan);
          supabase.removeChannel(freeChan);
          supabase.removeChannel(claimsChan);
        };
      },

      // -------- Trades --------
      addTradeProposal: (input) =>
        set((s) => {
          const offer = input.offerPlayerIds ?? [];
          const request = input.requestPlayerIds ?? [];

          const basic = validateTradeBasics(input.fromTeamId, input.toTeamId, offer, request);
          if (!basic.ok) return {};

          // lock check at proposal time
          const now = input.createdAtMs;
          const isLocked = (pid: string) =>
            (s.dropLocks ?? []).some(
              (l) => l.leagueId === input.leagueId && l.playerId === pid && l.lockedUntilMs > now
            );

          for (const pid of [...offer, ...request]) {
            if (isLocked(pid)) return {};
          }

          if (!tradeRespectsRosterRules(input.fromTeamId, input.toTeamId, offer, request)) {
            return {};
          }

          const duplicate = (s.trades ?? []).some(
            (t) =>
              String(t.status ?? "").toUpperCase() === "PENDING" &&
              t.fromTeamId === input.fromTeamId &&
              t.toTeamId === input.toTeamId &&
              JSON.stringify(t.offerPlayerIds ?? []) === JSON.stringify(offer) &&
              JSON.stringify(t.requestPlayerIds ?? []) === JSON.stringify(request)
          );
          if (duplicate) return {};

          const nextTrade: TradeOffer = {
            id: uid("trade"),
            leagueId: input.leagueId,
            week: input.week,
            fromTeamId: input.fromTeamId,
            toTeamId: input.toTeamId,
            offerPlayerIds: offer,
            requestPlayerIds: request,
            status: "PENDING",
            createdAtMs: input.createdAtMs,
            updatedAtMs: input.createdAtMs,
            note: input.note ?? "",
          };

          return { trades: [nextTrade, ...(s.trades ?? [])] };
        }),

      upsertTrade: (t) =>
        set((s) => {
          const rest = (s.trades ?? []).filter((x) => x.id !== t.id);
          return { trades: [...rest, t] };
        }),

      acceptTradeProposal: (tradeId, acceptedAtMs, tradeDeadlineMs) => {
  // ✅ NEW: hard enforce trade window
  if (typeof tradeDeadlineMs === "number" && tradeDeadlineMs > 0 && acceptedAtMs >= tradeDeadlineMs) {
    return; // trade window closed
  }

  const state = get();
  const trade = (state.trades ?? []).find((t) => t.id === tradeId);
  if (!trade) return;

  if (String(trade.status ?? "").toUpperCase() !== "PENDING") return;

  const offer = trade.offerPlayerIds ?? [];
  const request = trade.requestPlayerIds ?? [];

  const basic = validateTradeBasics(trade.fromTeamId, trade.toTeamId, offer, request);
  if (!basic.ok) return;

  // lock check at accept time
  const locked = (state.dropLocks ?? []).some(
    (l) =>
      l.leagueId === trade.leagueId &&
      l.lockedUntilMs > acceptedAtMs &&
      (offer.includes(l.playerId) || request.includes(l.playerId))
  );
  if (locked) return;

  // roster rules check
  if (!tradeRespectsRosterRules(trade.fromTeamId, trade.toTeamId, offer, request)) return;

  set((s) => ({
    trades: (s.trades ?? []).map((t) => {
      if (t.id !== tradeId) return t;
      if (String(t.status ?? "").toUpperCase() !== "PENDING") return t;
      return { ...t, status: "ACCEPTED", acceptedAtMs, updatedAtMs: acceptedAtMs };
    }),
  }));

  applyTrade(trade.fromTeamId, trade.toTeamId, offer, request);
},


      declineTradeProposal: (tradeId, reason, decidedAtMs, tradeDeadlineMs) => {
  // ✅ NEW: optional window enforcement
  if (typeof tradeDeadlineMs === "number" && tradeDeadlineMs > 0 && decidedAtMs >= tradeDeadlineMs) {
    return;
  }

  set((s) => ({
    trades: (s.trades ?? []).map((x) => {
      if (x.id !== tradeId) return x;
      if (String(x.status ?? "").toUpperCase() !== "PENDING") return x;

      return {
        ...x,
        status: "DECLINED",
        decidedAtMs,
        decidedReason: reason,
        declinedAtMs: decidedAtMs,
        updatedAtMs: decidedAtMs,
      };
    }),
  }));
},


      cancelTradeProposal: (tradeId, decidedAtMs, tradeDeadlineMs) => {
  // ✅ NEW: optional window enforcement
  if (typeof tradeDeadlineMs === "number" && tradeDeadlineMs > 0 && decidedAtMs >= tradeDeadlineMs) {
    return;
  }

  set((s) => ({
    trades: (s.trades ?? []).map((x) => {
      if (x.id !== tradeId) return x;
      if (String(x.status ?? "").toUpperCase() !== "PENDING") return x;

      return {
        ...x,
        status: "CANCELLED",
        decidedAtMs,
        cancelledAtMs: decidedAtMs,
        updatedAtMs: decidedAtMs,
      };
    }),
  }));
},


      declinePendingTradesAtDeadline: (leagueId, reason, nowMs) =>
        set((s) => ({
          trades: (s.trades ?? []).map((t) => {
            if (t.leagueId !== leagueId) return t;
            if (String(t.status ?? "").toUpperCase() !== "PENDING") return t;

            return {
              ...t,
              status: "DECLINED",
              decidedAtMs: nowMs,
              decidedReason: reason,
              declinedAtMs: nowMs,
              updatedAtMs: nowMs,
            };
          }),
        })),

      // -------- Waivers --------
      addClaim: (c) =>
        set((s) => {
          const id = uid("claim");
          const createdAtMs = Date.now();

          const existing = (s.claims ?? []).filter(
            (x) => x.leagueId === c.leagueId && x.week === c.week && x.teamId === c.teamId
          );
          const maxPri = existing.reduce((m, x) => Math.max(m, x.priority), 0);

          const next: WaiverClaim = {
            id,
            createdAtMs,
            updatedAtMs: createdAtMs,
            priority: maxPri + 1,
            status: "PENDING",
            ...c,
          };

                    // 3B: write-through insert
          void (async () => {
  const { error } = await supabaseBrowser()
    .from("waiver_claims")
    .upsert(toDbClaim(next), { onConflict: "id" });

  // optional: console.warn(error);
})();

          return { claims: [...(s.claims ?? []), next] };
        }),

      removeClaim: (claimId) => {
  void (async () => {
    const { error } = await supabaseBrowser()
      .from("waiver_claims")
      .delete()
      .eq("id", claimId);
    // optional: if (error) console.warn(error);
  })();

  set((s) => ({ claims: (s.claims ?? []).filter((c) => c.id !== claimId) }));
},

      reorderClaimsForTeamWeek: (leagueId, week, teamId, orderedIds) =>
        set((s) => {
          const relevant = (s.claims ?? [])
            .filter((c) => c.leagueId === leagueId && c.week === week && c.teamId === teamId)
            .slice()
            .sort((a, b) => a.priority - b.priority);

          const map = new Map(relevant.map((c) => [c.id, c]));
          const reordered: WaiverClaim[] = [];

          orderedIds.forEach((id, idx) => {
            const c = map.get(id);
            if (c) reordered.push({ ...c, priority: idx + 1, updatedAtMs: Date.now() });
          });

          for (const c of relevant) {
            if (!orderedIds.includes(c.id)) {
              reordered.push({ ...c, priority: reordered.length + 1, updatedAtMs: Date.now() });
            }
          }

          const others = (s.claims ?? []).filter(
            (c) => !(c.leagueId === leagueId && c.week === week && c.teamId === teamId)
          );

          // ✅ write-through reorder (persist new priorities)
const now = Date.now();
const supabase = supabaseBrowser();

// ensure updatedAtMs is consistent for DB write
const reorderedWithTs = reordered.map((c) => ({ ...c, updatedAtMs: now }));

void (async () => {
  const { error } = await supabase
    .from("waiver_claims")
    .upsert(reorderedWithTs.map(toDbClaim), { onConflict: "id" });
  // optional: if (error) console.warn(error);
})();

          return { claims: [...others, ...reorderedWithTs] };
        }),

      reorderClaims: (input) =>
        get().reorderClaimsForTeamWeek(input.leagueId, input.week, input.teamId, input.orderedIds),

      setClaimPriority: (claimId, priority) =>
        set((s) => ({
          claims: (s.claims ?? []).map((c) =>
            c.id === claimId ? { ...c, priority, updatedAtMs: Date.now() } : c
          ),
        })),

      updateClaimPriority: (claimId, priority) => get().setClaimPriority(claimId, priority),

      processWaiversForWeek: (leagueId, week, processedAtMs, lockUntilMs) =>
  set((s) => {
          const pending = (s.claims ?? [])
            .filter((c) => c.leagueId === leagueId && c.week === week)
            .filter((c) => String(c.status ?? "PENDING").toUpperCase() === "PENDING")
            .slice()
            .sort((a, b) => {
              const ap = typeof a.priority === "number" ? a.priority : 9999;
              const bp = typeof b.priority === "number" ? b.priority : 9999;
              if (ap !== bp) return ap - bp;
              return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
            });

          // build current ownership set from rosters
          const owned = new Set<string>();
          const rosters = (useDraftStore.getState?.() as any)?.rosters ?? {};
          for (const roster of Object.values(rosters)) {
            const r: any = roster;
            for (const arr of Object.values(r?.slots ?? {})) {
              for (const p of (arr as any[]) ?? []) if (p?.id) owned.add(p.id);
            }
            for (const p of (r?.wildcards ?? []) as any[]) if (p?.id) owned.add(p.id);
          }

          const updatedClaims = (s.claims ?? []).map((c) => {
            if (c.leagueId !== leagueId || c.week !== week) return c;
            if (!pending.some((x) => x.id === c.id)) return c;

            // already owned => fail
            if (owned.has(c.addPlayerId)) {
              return {
                ...c,
                status: "FAILED" as WaiverClaimStatus,
                processedAtMs,
                decidedAtMs: processedAtMs,
                updatedAtMs: processedAtMs,
                decidedReason: c.decidedReason ?? "Player already owned",
              };
            }

            // locked => fail
            const locked = (s.dropLocks ?? []).some(
              (l) =>
                l.leagueId === leagueId &&
                l.playerId === c.addPlayerId &&
                l.lockedUntilMs > processedAtMs
            );
            if (locked) {
              return {
                ...c,
                status: "FAILED" as WaiverClaimStatus,
                processedAtMs,
                decidedAtMs: processedAtMs,
                updatedAtMs: processedAtMs,
                decidedReason: "Player is locked",
              };
            }

            // process
            applyAddDrop(c.teamId, c.addPlayerId, c.dropPlayerId);
            owned.add(c.addPlayerId);

            return {
              ...c,
              status: "PROCESSED" as WaiverClaimStatus,
              processedAtMs,
              decidedAtMs: processedAtMs,
              updatedAtMs: processedAtMs,
            };
          });

          const lockUntil =
      typeof lockUntilMs === "number" && lockUntilMs > 0
        ? lockUntilMs
        : processedAtMs + 24 * 60 * 60 * 1000;

    // add lock on dropped player for processed claims
    const newLocks: DropLock[] = [];
    for (const c of pending) {
      const final = updatedClaims.find((x) => x.id === c.id);
      if (!final || final.status !== "PROCESSED") continue;
      if (!c.dropPlayerId) continue;

      newLocks.push({
        playerId: c.dropPlayerId,
        leagueId,
        week,
        lockedUntilMs: lockUntil, // ✅ CHANGED
        droppedByTeamId: c.teamId,
        droppedAtMs: processedAtMs,
        reason: "WAIVER_PROCESSING",
      });
    }

          const locksRest = (s.dropLocks ?? []).filter(
            (x) => x.leagueId !== leagueId || !newLocks.some((n) => n.playerId === x.playerId)
          );

                    // 3B: write-through updates
          const supabase = supabaseBrowser();

          // upsert claims that changed status
          const touched = updatedClaims.filter(
            (c) => c.leagueId === leagueId && c.week === week
          );
          void (async () => {
  const { error } = await supabase
    .from("waiver_claims")
    .upsert(touched.map(toDbClaim), { onConflict: "id" });
  // optional: if (error) console.warn(error);
})();

          // upsert new locks (if any)
          if (newLocks.length) {
  void (async () => {
    const { error } = await supabase
      .from("drop_locks")
      .upsert(newLocks.map(toDbLock), { onConflict: "league_id,player_id" });
    // optional: if (error) console.warn(error);
  })();
}

          return {
            claims: updatedClaims,
            dropLocks: [...locksRest, ...newLocks],
          };
        }),

      // -------- Free Agency --------
      addFreeAgentTransfer: (input) =>
        set((s) => {
          // ownership check: block if add player already owned
          const owned = new Set<string>();
          const rosters = (useDraftStore.getState?.() as any)?.rosters ?? {};
          for (const roster of Object.values(rosters)) {
            const r: any = roster;
            for (const arr of Object.values(r?.slots ?? {})) {
              for (const p of (arr as any[]) ?? []) if (p?.id) owned.add(p.id);
            }
            for (const p of (r?.wildcards ?? []) as any[]) if (p?.id) owned.add(p.id);
          }

          if (owned.has(input.addPlayerId)) {
            const failed: FreeAgentTransfer = {
              id: uid("free"),
              leagueId: input.leagueId,
              week: input.week,
              teamId: input.teamId,
              addPlayerId: input.addPlayerId,
              dropPlayerId: input.dropPlayerId,
              status: "FAILED",
              createdAtMs: input.createdAtMs,
              updatedAtMs: input.createdAtMs,
            };

            // 3D: write-through insert (FAILED)
void (async () => {
  const { error } = await supabaseBrowser()
    .from("free_agent_transfers")
    .insert(toDbFree(failed));
  // optional: if (error) console.warn(error);
})();

            return { freeAgentTransfers: [failed, ...(s.freeAgentTransfers ?? [])] };
          }

          // lock check: block if player is locked
          const locked = (s.dropLocks ?? []).some(
            (l) =>
              l.leagueId === input.leagueId &&
              l.playerId === input.addPlayerId &&
              l.lockedUntilMs > input.createdAtMs
          );
          if (locked) {
            const failed: FreeAgentTransfer = {
              id: uid("free"),
              leagueId: input.leagueId,
              week: input.week,
              teamId: input.teamId,
              addPlayerId: input.addPlayerId,
              dropPlayerId: input.dropPlayerId,
              status: "FAILED",
              createdAtMs: input.createdAtMs,
              updatedAtMs: input.createdAtMs,
            };

            // 3D: write-through insert (FAILED)
void (async () => {
  const { error } = await supabaseBrowser()
    .from("free_agent_transfers")
    .insert(toDbFree(failed));
  // optional: if (error) console.warn(error);
})();

            return { freeAgentTransfers: [failed, ...(s.freeAgentTransfers ?? [])] };
          }

          // apply roster change immediately
          applyAddDrop(input.teamId, input.addPlayerId, input.dropPlayerId);

          const next: FreeAgentTransfer = {
            id: uid("free"),
            leagueId: input.leagueId,
            week: input.week,
            teamId: input.teamId,
            addPlayerId: input.addPlayerId,
            dropPlayerId: input.dropPlayerId,
            status: "PROCESSED",
            createdAtMs: input.createdAtMs,
            updatedAtMs: input.createdAtMs,
          };

          // add 24h lock to dropped player (if any)
          const lockUntil =
  typeof input.lockUntilMs === "number" && input.lockUntilMs > 0
    ? input.lockUntilMs
    : input.createdAtMs + 24 * 60 * 60 * 1000;

const newLock: DropLock | null = input.dropPlayerId
  ? {
      playerId: input.dropPlayerId,
      leagueId: input.leagueId,
      week: input.week,
      lockedUntilMs: lockUntil, // ✅ CHANGED
      droppedByTeamId: input.teamId,
      droppedAtMs: input.createdAtMs,
      reason: "FREE_AGENCY_DROP",
    }
  : null;

          const locksRest = input.dropPlayerId
            ? (s.dropLocks ?? []).filter(
                (x) => !(x.leagueId === input.leagueId && x.playerId === input.dropPlayerId)
              )
            : (s.dropLocks ?? []);

            // 3D: write-through insert (PROCESSED transfer) + upsert lock
const supabase = supabaseBrowser();

void (async () => {
  const { error } = await supabase
    .from("free_agent_transfers")
    .insert(toDbFree(next));
  // optional: if (error) console.warn(error);
})();

if (newLock) {
  void (async () => {
  const { error } = await supabase
    .from("drop_locks")
    .upsert(toDbLock(newLock), { onConflict: "league_id,player_id" });
  // optional: if (error) console.warn(error);
})();
}

          return {
            freeAgentTransfers: [next, ...(s.freeAgentTransfers ?? [])],
            dropLocks: newLock ? [...locksRest, newLock] : (s.dropLocks ?? []),
          };
        }),

      // -------- Locks --------
      addDropLock: (l) =>
        set((s) => {
          const rest = (s.dropLocks ?? []).filter(
            (x) => !(x.leagueId === l.leagueId && x.playerId === l.playerId)
          );
          return { dropLocks: [...rest, l] };
        }),

      cleanupExpiredDropLocks: (nowMs) =>
        set((s) => ({ dropLocks: (s.dropLocks ?? []).filter((l) => l.lockedUntilMs > nowMs) })),
    }),
    {
      // ✅ bump version so old persisted shape doesn’t confuse things
      name: "sr-transactions-store-v3",

      partialize: (s) => ({
        claims: s.claims,
        trades: s.trades,
        dropLocks: s.dropLocks,
        freeAgentTransfers: s.freeAgentTransfers,
      }),
    }
  )
);
