// lib/draft/store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftPhase, Player, Team, TeamRosterState } from "./types";
import { getSlotCaps, getWcCap } from "./constants";

import { fetchRosters, saveRoster } from "@/lib/rosters/api";

type DraftState = {
  phase: DraftPhase;

    // ✅ Persist hydration guard (prevents Next hydration mismatch)
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;

  canApplyRosterMove: (input: {
  teamId: string;
  addPlayer: Player;
  dropPlayerId: string;
}) => boolean;

  // League teams + order
  teams: Team[];
  isDraftOrderSet: boolean;

    // ✅ Supabase persistence
  hydrateRostersFromDb: (leagueId: string) => Promise<void>;
  persistRosterToDb: (leagueId: string, teamId: string) => Promise<void>;

    // ✅ Draft sync from Supabase
  refreshFromServer: (leagueId: string) => Promise<void>;

    // ✅ Player index for mapping player_id -> Player
  playersById: Record<string, Player>;

    // ✅ Hydration guard
  hydratedLeagueIds: Record<string, true>;
  isHydratingLeagueId: string | null;

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

  // Derived helpers
  totalPicks: () => number;
  draftOrderTeamIds: () => string[];
  ownerForPickSnake: (pickNumber: number) => Team | null;

  // Roster rules
  canTeamDraftPlayer: (teamId: string, player: Player) => boolean;
  addPlayerToRoster: (teamId: string, player: Player, leagueId?: string) => void;

  // ✅ Free agent / waiver roster mutation
  applyRosterMove: (input: {
  teamId: string;
  addPlayer: Player;
  dropPlayerId: string;
  leagueId?: string;
}) => boolean;

    // Draft actions
  ensurePicksLength: () => void;
  rehydratePlayersFromPool: (allPlayers: Player[]) => void;
  confirmDraft: (
  player: Player,
  leagueId?: string,
  onDraftComplete?: (leagueId: string) => void
) => Promise<void>;

autoDraft: (
  allPlayers: Player[],
  leagueId?: string,
  onDraftComplete?: (leagueId: string) => void
) => Promise<void>;


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


function finalizeLeagueDraftIfComplete(
  pickNo: number,
  total: number,
  leagueId: string | undefined,
  onDraftComplete?: (leagueId: string) => void
) {
  if (pickNo !== total) return;
  if (!leagueId) return;
  if (leagueId === "local") return;
  onDraftComplete?.(leagueId);
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

function isTeamRosterState(x: any): x is TeamRosterState {
  return x && typeof x === "object" && ("slots" in x) && ("wildcards" in x);
}

function normId(x: any) {
  return String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}


export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      refreshFromServer: async (leagueId: string) => {
  if (!leagueId) return;

  try {
    const res = await fetch(`/api/draft/get?leagueId=${encodeURIComponent(leagueId)}`, {
  cache: "no-store",
});
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return;

    const stateRow = json.state;   // draft_state row (or null)
    const pickRows = json.picks;   // array of draft_picks rows

    set({
  draftPicks: (pickRows ?? []).map((r: any) => ({
    id: String(r.id),
    leagueId: String(r.league_id),
    week: Number(r.week ?? 1),
    teamId: String(r.team_id),
    playerId: String(r.player_id),
    pickNumber: Number(r.pick_number),
    round: Number(r.round),
    createdAtMs: new Date(r.created_at).getTime(),
  })),
});

    // Ensure picks array is correct length before inserting into it
    get().ensurePicksLength();

    // 1) draft_state -> phase/pickIndex/isDraftOrderSet
    if (stateRow) {
      set({
        phase: stateRow.phase === "live" ? "liveDraft" : "preDraft",
        pickIndex: Number(stateRow.pick_index ?? 1),
        isDraftOrderSet: !!stateRow.is_draft_order_set,
      });
    }
// ✅ Apply server draft order by reordering teams array
// Requires draft_state.draft_order_team_ids (text[]) to exist
if (stateRow?.draft_order_team_ids && Array.isArray(stateRow.draft_order_team_ids)) {
  const order = stateRow.draft_order_team_ids
    .map((x: any) => String(x ?? "").trim())
    .filter(Boolean);

  if (order.length) {
    set((prev) => {
      const byId = new Map(prev.teams.map((t) => [t.id, t]));
      const ordered: Team[] = [];

      // add teams in server order
      for (const id of order) {
        const t = byId.get(id);
        if (t) ordered.push(t);
      }

      // append any teams not in server list (safety)
      for (const t of prev.teams) {
        if (!order.includes(t.id)) ordered.push(t);
      }

      return { ...prev, teams: ordered };
    });
  }
}
    // 2) draft_picks -> picks[]
    set((s) => {
      const next = [...s.picks];

      for (const r of pickRows ?? []) {
        const pickNo = Number(r.pick_number);
        if (!Number.isFinite(pickNo) || pickNo <= 0) continue;

        const pid = String(r.player_id ?? "");
        const player =
  s.playersById?.[pid] ??
  ({ id: pid } as Player); // placeholder, will be hydrated later

next[pickNo - 1] = player;
      }

      return { ...s, picks: next };
    });
  } catch (e) {
    console.log("refreshFromServer error", e);
  }
},
hasHydrated: false,
setHasHydrated: (v) => set({ hasHydrated: v }),
      phase: "preDraft",
      draftPicks: [],
      playersById: {},
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
      hydratedLeagueIds: {},
      isHydratingLeagueId: null,

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
      // ✅ Pull all rosters for a league from Supabase → load into Zustand
            hydrateRostersFromDb: async (leagueId: string) => {
        if (!leagueId) return;

        const s = get();

        // ✅ already hydrated this league in this session
        if (s.hydratedLeagueIds?.[leagueId]) return;

        // ✅ prevent concurrent hydrations
        if (s.isHydratingLeagueId && s.isHydratingLeagueId !== leagueId) return;

        set((prev) => ({ ...prev, isHydratingLeagueId: leagueId }));

        try {
          const res = await fetchRosters(leagueId);
          if (!res?.ok) {
            console.log("hydrateRostersFromDb failed:", res?.error ?? res);
            return;
          }

          const rows = (Array.isArray(res.data) ? res.data : []) as Array<{
            league_id: string;
            team_id: string;
            data: TeamRosterState;
            updated_at?: string;
          }>;

          set((prev) => {
            const next = { ...prev.rosters };

            for (const r of rows) {
              if (r?.team_id && r?.data) next[r.team_id] = r.data;
            }

            for (const t of prev.teams) {
              if (!next[t.id]) next[t.id] = makeEmptyRoster();
            }

            return {
              ...prev,
              rosters: next,
              hydratedLeagueIds: { ...(prev.hydratedLeagueIds ?? {}), [leagueId]: true },
              isHydratingLeagueId: null,
            };
          });
        } catch (e) {
          console.log("hydrateRostersFromDb exception:", e);
          set((prev) => ({ ...prev, isHydratingLeagueId: null }));
        }
      },

      // ✅ Save one team roster to Supabase
      persistRosterToDb: async (leagueId: string, teamId: string) => {
        if (!leagueId || !teamId) return;

        try {
          const roster = get().rosters[teamId];
          if (!roster) return;

          const res = await saveRoster(leagueId, teamId, roster);
          if (!res?.ok) {
            console.log("persistRosterToDb failed:", res?.error ?? res);
          }
        } catch (e) {
          console.log("persistRosterToDb exception:", e);
        }
      },
            rehydratePlayersFromPool: (allPlayers) => {
  const byId = new Map(allPlayers.map((p) => [p.id, p]));
  const byIdObj: Record<string, Player> = {};
  for (const p of allPlayers) byIdObj[p.id] = p;

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

    return { ...s, picks: nextPicks, rosters: nextRosters, playersById: byIdObj };
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

addPlayerToRoster: (teamId, player, leagueId) => {
  const slotCaps = getSlotCaps();
  const wcCap = getWcCap();

  let nextRoster: TeamRosterState | null = null;

  set((s) => {
    const current = s.rosters[teamId] ?? makeEmptyRoster();

    const currentPlayers: any[] = [];
    for (const arr of Object.values(current.slots ?? {})) currentPlayers.push(...(arr as any[]));
    currentPlayers.push(...(current.wildcards ?? []));

    const balanced = rebalanceRoster([...currentPlayers, player], slotCaps, wcCap);
    if (!balanced) return s; // should not happen if guarded

    nextRoster = {
      slots: balanced.slots,
      wildcards: balanced.wildcards,
    };

    return {
      ...s,
      rosters: {
        ...s.rosters,
        [teamId]: nextRoster!,
      },
    };
  });

// ✅ persist to Supabase (fire-and-forget)
if (leagueId && leagueId !== "local" && nextRoster) {
  saveRoster(leagueId, teamId, nextRoster).catch((e) =>
    console.log("saveRoster failed", e)
  );
}
},



canApplyRosterMove: ({ teamId, addPlayer, dropPlayerId }) => {
  const slotCaps = getSlotCaps();
  const wcCap = getWcCap();

  const current = get().rosters[teamId] ?? makeEmptyRoster();

  const currentPlayers: any[] = [];
  for (const arr of Object.values(current.slots ?? {})) currentPlayers.push(...(arr as any[]));
  currentPlayers.push(...(current.wildcards ?? []));

  // must be able to find the drop player in roster
  const dropNorm = normId(dropPlayerId);
  const dropIdx = currentPlayers.findIndex((p) => normId(p?.id) === dropNorm);
  if (dropIdx < 0) return false;

  // remove dropped
  const nextPlayers = currentPlayers.slice();
  nextPlayers.splice(dropIdx, 1);

  // prevent duplicates
  if (nextPlayers.some((p) => normId(p?.id) === normId(addPlayer?.id))) return false;

  // add incoming
  nextPlayers.push(addPlayer);

  // check roster feasibility AFTER drop+add
  return rebalanceRoster(nextPlayers, slotCaps, wcCap) != null;
},

applyRosterMove: ({ teamId, addPlayer, dropPlayerId, leagueId }) => {
  console.log("APPLY MOVE", { teamId, addPlayerId: addPlayer?.id, dropPlayerId });

  const slotCaps = getSlotCaps();
  const wcCap = getWcCap();

  let success = false;
  let nextRoster: TeamRosterState | null = null;

  set((s) => {
    const current = s.rosters[teamId] ?? makeEmptyRoster();

    // flatten current roster to a player list
    const currentPlayers: any[] = [];
    
    for (const arr of Object.values(current.slots ?? {})) currentPlayers.push(...(arr as any[]));
    currentPlayers.push(...(current.wildcards ?? []));

    // remove dropped
    const dropNorm = String(dropPlayerId ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const nextPlayers = currentPlayers.filter((p) => {
  const pid = String(p?.id ?? "");
  const pidNorm = pid.toLowerCase().replace(/[^a-z0-9]/g, "");
  return pid !== dropPlayerId && pidNorm !== dropNorm;
});

const dropped = currentPlayers.length !== nextPlayers.length;
if (!dropped) {
  console.log("applyRosterMove: dropPlayerId not found in roster", { dropPlayerId });
  return s;
}

    // guard: don’t allow duplicates
    if (nextPlayers.some((p) => p?.id === addPlayer?.id)) return s;

    // add incoming
    nextPlayers.push(addPlayer);

    const balanced = rebalanceRoster(nextPlayers, slotCaps, wcCap);
    if (!balanced) return s;

    nextRoster = {
      slots: balanced.slots,
      wildcards: balanced.wildcards,
    };

    success = true;

    return {
      ...s,
      rosters: {
        ...s.rosters,
        [teamId]: nextRoster!,
      },
    };
  });

  // ✅ persist if we succeeded
if (success && leagueId && leagueId !== "local") {
  get().persistRosterToDb(leagueId, teamId);
}
return success;
},

      confirmDraft: async (player, leagueId, onDraftComplete) => {
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

                const lid = leagueId ?? "local";
        const nowMs = Date.now();
        const nTeams = s.teams.length || 1;
        const round = Math.floor((pickNo - 1) / nTeams) + 1;

        if (!s.canTeamDraftPlayer(teamId, player)) return;
const picked: Player = { ...player, secondaryPosAbbrev: player.secondaryPosAbbrev ?? "" } as Player;

// ✅ SERVER MODE: write pick to Supabase via API, then refresh local state from server
if (lid !== "local") {
  try {
    const res = await fetch("/api/draft/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: lid,
        teamId,
        playerId: picked.id,
        pickNumber: pickNo,
        round,
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      console.log("confirmDraft server pick failed:", json?.error ?? res.statusText);
      return;
    }

    // Update roster locally
s.addPlayerToRoster(teamId, picked, lid);

// ✅ Force persist from current state (more reliable than fire-and-forget nextRoster)
await get().persistRosterToDb(lid, teamId);

    // Pull latest draft_state + draft_picks (source of truth)
    await get().refreshFromServer(lid);

    const teamName = owner?.name ?? "TBC";
    set((prev) => ({
      ...prev,
      latestPickText: `${teamName} took ${picked.firstName[0]}. ${picked.lastName} with the ${ordinal(pickNo)} Pick`,
    }));

    finalizeLeagueDraftIfComplete(pickNo, total, lid, onDraftComplete);
    return; // IMPORTANT: stop here, don’t run the local-only code below
  } catch (e) {
    console.log("confirmDraft server pick exception:", e);
    return;
  }
}

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
              leagueId: lid,
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

        s.addPlayerToRoster(teamId, picked, lid);
if (lid !== "local") get().persistRosterToDb(lid, teamId);

        const teamName = owner?.name ?? "TBC";
        set((prev) => ({
          ...prev,
          latestPickText: `${teamName} took ${player.firstName[0]}. ${player.lastName} with the ${ordinal(
            pickNo
          )} Pick`,
          pickIndex: Math.min(prev.pickIndex + 1, total),
        }));

        finalizeLeagueDraftIfComplete(pickNo, total, lid, onDraftComplete);
      },

      autoDraft: async (allPlayers, leagueId, onDraftComplete) => {
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
        const lid = leagueId ?? "local";
        const nowMs = Date.now();
        const nTeams = s.teams.length || 1;
        const round = Math.floor((pickNo - 1) / nTeams) + 1;

        // ✅ SERVER MODE: write pick to Supabase via API, then refresh local state from server
if (lid !== "local") {
  try {
    const res = await fetch("/api/draft/pick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: lid,
        teamId,
        playerId: picked.id,
        pickNumber: pickNo,
        round,
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      console.log("autoDraft server pick failed:", json?.error ?? res.statusText);
      return;
    }

    // Update roster locally
s.addPlayerToRoster(teamId, picked, lid);

// ✅ Force persist from current state (more reliable than fire-and-forget nextRoster)
await get().persistRosterToDb(lid, teamId);

    // Pull latest draft_state + draft_picks (source of truth)
    await get().refreshFromServer(lid);

    const teamName = owner?.name ?? "TBC";
    set((prev) => ({
      ...prev,
      latestPickText: `${teamName} auto-drafted ${picked.firstName[0]}. ${picked.lastName} with the ${ordinal(pickNo)} Pick`,
    }));

    finalizeLeagueDraftIfComplete(pickNo, total, lid, onDraftComplete);
    return; // IMPORTANT: stop here, don’t run the local-only code below
  } catch (e) {
    console.log("autoDraft server pick exception:", e);
    return;
  }
}

                set((prev) => {
          const nextPicks = [...prev.picks];
          if (nextPicks[pickNo - 1]) return prev;
          nextPicks[pickNo - 1] = picked;

          const nextDraftPicks = [...(prev.draftPicks ?? [])];
          const alreadyLogged = nextDraftPicks.some((dp) => dp.pickNumber === pickNo);
          if (!alreadyLogged) {
            nextDraftPicks.push({
              id: `dp_${pickNo}_${nowMs}`,
              leagueId: lid,
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


        s.addPlayerToRoster(teamId, picked, lid);

if (lid !== "local") get().persistRosterToDb(lid, teamId);

        const teamName = owner?.name ?? "TBC";
        set((prev) => ({
          ...prev,
          latestPickText: `${teamName} auto-drafted ${best.firstName[0]}. ${best.lastName} with the ${ordinal(
            pickNo
          )} Pick`,
          pickIndex: Math.min(prev.pickIndex + 1, total),
        }));

        finalizeLeagueDraftIfComplete(pickNo, total, lid, onDraftComplete);
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

      
// ✅ League sync
syncFromLeague: (leagueTeams, isOrderSet = true) => {
  // For future drafts: NEVER wipe picks/rosters here.
  // Supabase is the source of truth (refreshFromServer + hydrateRostersFromDb).
  set((prev) => ({
    ...prev,
    teams: leagueTeams,
    isDraftOrderSet: isOrderSet,
  }));

  // keep arrays sized correctly as team count changes
  get().ensurePicksLength();
},


    }),
    {
      name: "sr-draft-store-v4",
      partialize: (s) => ({
  // ✅ Only persist "preferences" or harmless UI state
  watchlist: s.watchlist,

  // Optional: keep this text if you want, but it can also be removed
  latestPickText: s.latestPickText,

  // Optional: if you want roundsPerTeam to persist as a preference
  roundsPerTeam: s.roundsPerTeam,
}),
            onRehydrateStorage: () => (state, error) => {
        if (!error) state?.setHasHydrated(true);
      },
    }
  )
);

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
