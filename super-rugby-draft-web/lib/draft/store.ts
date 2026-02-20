// lib/draft/store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftPhase, Player, Team, TeamRosterState } from "./types";
import { getSlotCaps, getWcCap } from "./constants";
import { useLeagueStore } from "@/lib/league/store";
import { fetchRosters, saveRoster } from "@/lib/rosters/api";

type DraftState = {
  phase: DraftPhase;

  // League teams + order
  teams: Team[];
  isDraftOrderSet: boolean;

  // Draft config
  roundsPerTeam: number;

  // Draft runtime
  pickIndex: number; // 1-based
  picks: Array<Player | null>;
  latestPickText: string;

    // Draft transactions (pick log)
  draftPicks: Array<{
    id: string;
    leagueId: string;
    week: number;
    teamId: string;
    playerId: string;
    pickNumber: number; // 1-based overall pick
    round: number;      // 1-based round
    createdAtMs: number;
  }>;

  // Watchlist
  watchlist: Record<string, true>;

  // Rosters
  rosters: Record<string, TeamRosterState>;
  // ✅ Supabase roster sync
  loadRostersFromDb: (leagueId: string) => Promise<void>;
  persistRosterToDb: (teamId: string) => Promise<void>;
  // Derived helpers
  totalPicks: () => number;
  draftOrderTeamIds: () => string[];
  ownerForPickSnake: (pickNumber: number) => Team | null;

  // Roster rules
  canTeamDraftPlayer: (teamId: string, player: Player) => boolean;
  addPlayerToRoster: (teamId: string, player: Player) => void;

  // ✅ Free agent / waiver roster mutation
  applyRosterMove: (input: {
    teamId: string;
    addPlayer: Player;        // the incoming FA
    dropPlayerId: string;     // the outgoing player id
  }) => boolean;              // returns success/failure

    // Draft actions
  ensurePicksLength: () => void;
  rehydratePlayersFromPool: (allPlayers: Player[]) => void;
  confirmDraft: (player: Player) => void;
  autoDraft: (allPlayers: Player[]) => void;


  // Info helpers
  isDrafted: (playerId: string) => boolean;
  getPlayerPickNumber: (playerId: string) => number | null;
  getPlayerTeamName: (playerId: string) => string | null;

  // Watchlist actions
  toggleWatchlist: (playerId: string) => void;

  // Admin/dev helpers
  setPhase: (phase: DraftPhase) => void;
  setDraftOrderSet: (v: boolean) => void;
  setTeams: (teams: Team[]) => void;

  // ✅ League sync
  syncFromLeague: (leagueTeams: Team[], isDraftOrderSet?: boolean) => void;
};

function makeEmptyRoster(): TeamRosterState {
  const slotCaps = getSlotCaps();
  const slots: Record<string, Player[]> = {};
  for (const pos of Object.keys(slotCaps)) slots[pos] = [];
  return { slots, wildcards: [] };
}

function sameIdSet(a: Team[], b: Team[]) {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((t) => t.id));
  for (const t of b) if (!sa.has(t.id)) return false;
  return true;
}

function sameIdOrder(a: Team[], b: Team[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]?.id !== b[i]?.id) return false;
  return true;
}


function finalizeLeagueDraftIfComplete(pickNo: number, total: number) {
  if (pickNo !== total) return;

  const leagueState = useLeagueStore.getState();
  const activeLeagueId = leagueState.activeLeagueId;
  if (!activeLeagueId) return;

  // Prefer your dedicated action if it exists (your handover says completeDraft exists)
  if (typeof leagueState.completeDraft === "function") {
    leagueState.completeDraft(activeLeagueId);
    return;
  }

  // Fallback: updateLeagueSettings (older code path)
  leagueState.updateLeagueSettings?.(activeLeagueId, {
    draftStatus: "complete",
  });
}
type Pos = string;

function upper(x: any) {
  return String(x ?? "").toUpperCase().trim();
}

function eligiblePositions(p: any): Pos[] {
  const a = upper(p.posAbbrev);
  const b = upper(p.secondaryPosAbbrev);
  const out = [a];
  if (b && b !== a) out.push(b);
  return out.filter(Boolean);
}

/**
 * Try to assign players into position slots + WC slots.
 * Returns a balanced roster if possible, otherwise null.
 *
 * This is a small bipartite matching:
 * - left side: players
 * - right side: individual slot-units (e.g. "PROP#0", "PROP#1", ... "WC#0"...)
 */
function rebalanceRoster(
  players: any[],
  slotCaps: Record<Pos, number>,
  wcCap: number
): { slots: Record<Pos, any[]>; wildcards: any[] } | null {
  // Build slot-units
  const slotUnits: string[] = [];
  const unitPos: Record<string, Pos> = {};

  for (const [pos, cap] of Object.entries(slotCaps)) {
    for (let i = 0; i < cap; i++) {
      const id = `${pos}#${i}`;
      slotUnits.push(id);
      unitPos[id] = pos;
    }
  }
  for (let i = 0; i < wcCap; i++) {
    const id = `WC#${i}`;
    slotUnits.push(id);
    unitPos[id] = "WC";
  }

  // Adjacency: playerIndex -> slotUnitIds it can go into
  const adj: string[][] = players.map((p) => {
    const poss = eligiblePositions(p);
    const edges: string[] = [];

    // can go into any unit for eligible positions
    for (const pos of poss) {
      for (let i = 0; i < (slotCaps[pos] ?? 0); i++) edges.push(`${pos}#${i}`);
    }
    // can always go wildcard
    for (let i = 0; i < wcCap; i++) edges.push(`WC#${i}`);

    return edges;
  });

  // Prefer placing “single-position” players first (less flexible),
  // then dual-position players. This improves success rate and matches your intent.
  const order = players
    .map((p, idx) => ({ idx, flex: eligiblePositions(p).length })) // 1 or 2
    .sort((a, b) => a.flex - b.flex) // single-pos first
    .map((x) => x.idx);

  // Standard DFS augmenting path matching: slotUnit -> playerIndex
  const matchToPlayer: Record<string, number | null> = Object.fromEntries(
    slotUnits.map((u) => [u, null])
  );

  function dfs(pi: number, seen: Set<string>): boolean {
    for (const unit of adj[pi]) {
      if (seen.has(unit)) continue;
      seen.add(unit);

      const cur = matchToPlayer[unit];
      if (cur == null || dfs(cur, seen)) {
        matchToPlayer[unit] = pi;
        return true;
      }
    }
    return false;
  }

  for (const pi of order) {
    const ok = dfs(pi, new Set());
    if (!ok) return null; // no feasible assignment
  }

  // Build result
  const slots: Record<Pos, any[]> = {};
  for (const pos of Object.keys(slotCaps)) slots[pos] = [];
  const wildcards: any[] = [];

  // Convert match to placement
  for (const unit of slotUnits) {
    const pi = matchToPlayer[unit];
    if (pi == null) continue;
    const pos = unitPos[unit];
    if (pos === "WC") wildcards.push(players[pi]);
    else slots[pos].push(players[pi]);
  }

  // Keep deterministic-ish ordering inside each slot (optional)
  for (const pos of Object.keys(slots)) {
    slots[pos].sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999));
  }
  wildcards.sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999));

  return { slots, wildcards };
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      phase: "preDraft",
      draftPicks: [],

      // Default teams (will be overwritten once you sync from league)
      teams: [
        { id: "t-1", name: "Stouty’s Studs", initials: "ES" },
        { id: "t-2", name: "Hughie’s Hornets", initials: "HH" },
        { id: "t-3", name: "Diddy Dunkers", initials: "DD" },
      ],
      isDraftOrderSet: true,

      roundsPerTeam: 20,

      pickIndex: 1,
      picks: [],
      latestPickText: "No picks yet.",

      watchlist: {},
      rosters: {},

            // ✅ Load all rosters for a league from Supabase
      loadRostersFromDb: async (leagueId: string) => {
        const json = await fetchRosters(leagueId);
        if (!json?.ok) {
          console.warn("loadRostersFromDb failed", json?.error);
          return;
        }

        const next: Record<string, TeamRosterState> = {};
        for (const row of json.data ?? []) {
          next[row.team_id] = row.data;
        }

        set((s) => ({
          ...s,
          rosters: { ...s.rosters, ...next },
        }));
      },

      // ✅ Save ONE team roster to Supabase
      persistRosterToDb: async (teamId: string) => {
        const leagueState: any = useLeagueStore.getState();
        const leagueId = leagueState.activeLeagueId ?? leagueState.activeLeague?.id;
        if (!leagueId) return;

        const roster = (get() as any).rosters?.[teamId];
        if (!roster) return;

        const json = await saveRoster(leagueId, teamId, roster);
        if (!json?.ok) console.warn("persistRosterToDb failed", json?.error);
      },

      totalPicks: () => {
        const { teams, roundsPerTeam } = get();
        return Math.max(teams.length * roundsPerTeam, 40);
      },

      draftOrderTeamIds: () => {
        const { teams, isDraftOrderSet } = get();
        return isDraftOrderSet ? teams.map((t) => t.id) : [];
      },

      ownerForPickSnake: (pickNumber: number) => {
        const order = get().draftOrderTeamIds();
        const teams = get().teams;
        if (!order.length) return null;

        const n = order.length;
        const roundIndex = Math.floor((pickNumber - 1) / n);
        const indexInRound = (pickNumber - 1) % n;
        const isReverse = roundIndex % 2 === 1;
        const orderIndex = isReverse ? n - 1 - indexInRound : indexInRound;

        const teamId = order[orderIndex];
        return teams.find((t) => t.id === teamId) ?? null;
      },

      ensurePicksLength: () => {
        const total = get().totalPicks();

        set((s) => {
          const needsResize = s.picks.length !== total;

          // ensure roster containers exist for each team
          const rosters = { ...s.rosters };
          for (const t of s.teams) {
            if (!rosters[t.id]) rosters[t.id] = makeEmptyRoster();
          }
          for (const id of Object.keys(rosters)) {
            if (!s.teams.some((t) => t.id === id)) delete rosters[id];
          }

          if (!needsResize) {
            // still return updated rosters cleanup if needed
            if (rosters === s.rosters) return s;
            return { ...s, rosters };
          }

          const nextPicks = Array.from({ length: total }, (_, i) => s.picks[i] ?? null);

          return {
            ...s,
            picks: nextPicks,
            pickIndex: Math.min(s.pickIndex, total),
            rosters,
          };
        });
      },

            rehydratePlayersFromPool: (allPlayers) => {
        const byId = new Map(allPlayers.map((p) => [p.id, p]));

        set((s) => {
          const nextPicks = s.picks.map((p) => (p ? (byId.get(p.id) ?? p) : null));

          const nextRosters: Record<string, TeamRosterState> = {};
          for (const [teamId, r] of Object.entries(s.rosters)) {
            const nextSlots: Record<string, Player[]> = {};
            for (const [pos, arr] of Object.entries(r.slots ?? {})) {
              nextSlots[pos] = (arr as Player[]).map((p) => byId.get(p.id) ?? p);
            }
            const nextWc = (r.wildcards ?? []).map((p) => byId.get(p.id) ?? p);

            nextRosters[teamId] = { slots: nextSlots, wildcards: nextWc };
          }

          return { ...s, picks: nextPicks, rosters: nextRosters };
        });
      },

      canTeamDraftPlayer: (teamId, player) => {
  const slotCaps = getSlotCaps();
  const wcCap = getWcCap();

  const r = get().rosters[teamId];
  const currentPlayers: any[] = [];

  if (r) {
    for (const arr of Object.values(r.slots ?? {})) currentPlayers.push(...(arr as any[]));
    currentPlayers.push(...(r.wildcards ?? []));
  }

  // already drafted by this team? (optional safeguard)
  if (currentPlayers.some((p) => p?.id === player?.id)) return false;

  // simulate adding and see if a balanced roster exists
  const candidate = [...currentPlayers, player];
  return rebalanceRoster(candidate, slotCaps, wcCap) != null;
},



      addPlayerToRoster: (teamId, player) => {
  const slotCaps = getSlotCaps();
  const wcCap = getWcCap();

  set((s) => {
    const current = s.rosters[teamId] ?? makeEmptyRoster();

    const currentPlayers: any[] = [];
    for (const arr of Object.values(current.slots ?? {})) currentPlayers.push(...(arr as any[]));
    currentPlayers.push(...(current.wildcards ?? []));

    const balanced = rebalanceRoster([...currentPlayers, player], slotCaps, wcCap);
    if (!balanced) return s; // should not happen if guarded

    return {
      ...s,
      rosters: {
        ...s.rosters,
        [teamId]: {
          slots: balanced.slots,
          wildcards: balanced.wildcards,
        },
      },
    };
  });
    get().persistRosterToDb(teamId);
},

applyRosterMove: ({ teamId, addPlayer, dropPlayerId }) => {
  console.log("APPLY MOVE", { teamId, addPlayerId: addPlayer?.id, dropPlayerId });

  const slotCaps = getSlotCaps();
  const wcCap = getWcCap();

  let success = false;

  set((s) => {
    const current = s.rosters[teamId] ?? makeEmptyRoster();

    // flatten current roster to a player list
    const currentPlayers: any[] = [];
    for (const arr of Object.values(current.slots ?? {})) currentPlayers.push(...(arr as any[]));
    currentPlayers.push(...(current.wildcards ?? []));

// ✅ SAFE removal (do not hard fail if drop isn't found)
const nextPlayers = currentPlayers.filter((p) => p?.id !== dropPlayerId);

// guard: don’t allow duplicates
if (nextPlayers.some((p) => p?.id === addPlayer?.id)) return s;

// add incoming
nextPlayers.push(addPlayer);


    // rebalance into slots + WC
    const balanced = rebalanceRoster(nextPlayers, slotCaps, wcCap);
    if (!balanced) return s; // illegal move (would break roster structure)

    success = true;

    return {
      ...s,
      rosters: {
        ...s.rosters,
        [teamId]: {
          slots: balanced.slots,
          wildcards: balanced.wildcards,
        },
      },
    };
  });

  if (success) get().persistRosterToDb(teamId);
  return success;
},

      confirmDraft: (player) => {
        const s = get();
        if (s.phase !== "liveDraft") return;

        s.ensurePicksLength();

        const total = s.totalPicks();
        if (s.pickIndex > total) return;

        if (s.isDrafted(player.id)) return;

        const pickNo = s.pickIndex;
        const owner = s.ownerForPickSnake(pickNo);
        const teamId = owner?.id;
        if (!teamId) return;

                const leagueId = useLeagueStore.getState().activeLeagueId ?? "local";
        const nowMs = Date.now();
        const nTeams = s.teams.length || 1;
        const round = Math.floor((pickNo - 1) / nTeams) + 1;

        if (!s.canTeamDraftPlayer(teamId, player)) return;
const picked: Player = { ...player, secondaryPosAbbrev: player.secondaryPosAbbrev ?? "" } as Player;

        // Write the pick (track if it was actually written)
        let wrote = false;

                set((prev) => {
          const nextPicks = [...prev.picks];
          if (nextPicks[pickNo - 1]) return prev;
          nextPicks[pickNo - 1] = picked;

          // ✅ write draft pick transaction (forward-only)
          const nextDraftPicks = [...(prev.draftPicks ?? [])];
          const alreadyLogged = nextDraftPicks.some((dp) => dp.pickNumber === pickNo);
          if (!alreadyLogged) {
            nextDraftPicks.push({
              id: `dp_${pickNo}_${nowMs}`,
              leagueId,
              week: 1, // keep 1 for drafts, or change if you have a league week concept
              teamId,
              playerId: picked.id,
              pickNumber: pickNo,
              round,
              createdAtMs: nowMs,
            });
          }

          wrote = true;
          return { ...prev, picks: nextPicks, draftPicks: nextDraftPicks };
        });


        if (!wrote) return;

        s.addPlayerToRoster(teamId, picked);


        const teamName = owner?.name ?? "TBC";
        set((prev) => ({
          ...prev,
          latestPickText: `${teamName} took ${player.firstName[0]}. ${player.lastName} with the ${ordinal(
            pickNo
          )} Pick`,
          pickIndex: Math.min(prev.pickIndex + 1, total),
        }));

        finalizeLeagueDraftIfComplete(pickNo, total);
      },

      autoDraft: (allPlayers) => {
        const s = get();
        s.ensurePicksLength();

        const total = s.totalPicks();
        if (s.pickIndex > total) return;

        const owner = s.ownerForPickSnake(s.pickIndex);
        const teamId = owner?.id;
        if (!teamId) return;

        const drafted = new Set(s.picks.filter(Boolean).map((p) => (p as Player).id));

        const best = allPlayers
          .slice()
          .sort((a, b) => a.draftRank - b.draftRank)
          .find((p) => !drafted.has(p.id) && s.canTeamDraftPlayer(teamId, p));

          

        if (!best) {
          set((prev) => ({ ...prev, pickIndex: Math.min(prev.pickIndex + 1, total) }));
          return;
        }
const picked: Player = { ...best, secondaryPosAbbrev: best.secondaryPosAbbrev ?? "" } as Player;

        const pickNo = s.pickIndex;
        const leagueId = useLeagueStore.getState().activeLeagueId ?? "local";
        const nowMs = Date.now();
        const nTeams = s.teams.length || 1;
        const round = Math.floor((pickNo - 1) / nTeams) + 1;

                set((prev) => {
          const nextPicks = [...prev.picks];
          if (nextPicks[pickNo - 1]) return prev;
          nextPicks[pickNo - 1] = picked;

          const nextDraftPicks = [...(prev.draftPicks ?? [])];
          const alreadyLogged = nextDraftPicks.some((dp) => dp.pickNumber === pickNo);
          if (!alreadyLogged) {
            nextDraftPicks.push({
              id: `dp_${pickNo}_${nowMs}`,
              leagueId,
              week: 1,
              teamId,
              playerId: picked.id,
              pickNumber: pickNo,
              round,
              createdAtMs: nowMs,
            });
          }

          return { ...prev, picks: nextPicks, draftPicks: nextDraftPicks };
        });


        s.addPlayerToRoster(teamId, picked);


        const teamName = owner?.name ?? "TBC";
        set((prev) => ({
          ...prev,
          latestPickText: `${teamName} auto-drafted ${best.firstName[0]}. ${best.lastName} with the ${ordinal(
            pickNo
          )} Pick`,
          pickIndex: Math.min(prev.pickIndex + 1, total),
        }));

        finalizeLeagueDraftIfComplete(pickNo, total);
      },

      isDrafted: (playerId) => get().picks.some((p) => p?.id === playerId),

      getPlayerPickNumber: (playerId) => {
        const idx = get().picks.findIndex((p) => p?.id === playerId);
        return idx >= 0 ? idx + 1 : null;
      },

      getPlayerTeamName: (playerId) => {
        const pickNo = get().getPlayerPickNumber(playerId);
        if (!pickNo) return null;
        const owner = get().ownerForPickSnake(pickNo);
        return owner?.name ?? null;
      },

      toggleWatchlist: (playerId) => {
        set((s) => {
          const next = { ...s.watchlist };
          if (next[playerId]) delete next[playerId];
          else next[playerId] = true;
          return { ...s, watchlist: next };
        });
      },

      setPhase: (phase) => set({ phase }),

      setDraftOrderSet: (v) => {
        set({ isDraftOrderSet: v });
      },

      setTeams: (teams) => {
        set((s) => ({ ...s, teams }));
        get().ensurePicksLength();
      },

      // ✅ Sync league → draft store
      syncFromLeague: (leagueTeams, isOrderSet = true) => {
  const s = get();

  const setChanged = !sameIdSet(s.teams, leagueTeams);


  if (setChanged) {
    // Different teams (new league / join/leave) => safest reset of draft runtime
    set((prev) => ({
      ...prev,
      teams: leagueTeams,
      isDraftOrderSet: isOrderSet,
      pickIndex: 1,
      picks: [],
       draftPicks: [],   // ✅ add
      rosters: {},
      latestPickText: "No picks yet.",
      // watchlist intentionally kept
    }));
    get().ensurePicksLength();
    return;
  }

  // Same team IDs (even if ordering changed) => DO NOT wipe picks/rosters
  set((prev) => ({
    ...prev,
    teams: leagueTeams, // this updates order + names/initials
    isDraftOrderSet: isOrderSet,
  }));

  // If order changed and draft is already in progress, picks stay as-is.
  // Note: displayed "owner" for previous picks is derived from ownerForPickSnake(),
  // which uses current teams order, so historical owner labels could shift if you reorder mid-draft.
  // For now that's fine because we don't want to reorder mid-draft anyway.
  get().ensurePicksLength();
},

    }),
    {
      name: "sr-draft-store-v2",
      partialize: (s) => ({
        phase: s.phase,
        teams: s.teams,
        isDraftOrderSet: s.isDraftOrderSet,
        roundsPerTeam: s.roundsPerTeam,
        pickIndex: s.pickIndex,
        picks: s.picks,
        draftPicks: s.draftPicks,   // ✅ ADD THIS
        latestPickText: s.latestPickText,
        watchlist: s.watchlist,
        rosters: s.rosters,
      }),
    }
  )
);

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
