// lib/draft/store.ts
// The draft room's view of the draft. The draft itself runs on the server (lib/draft/engine):
// this store asks the server for the state, sends picks, and keeps the draft watchlist in step.
// It never decides a pick or saves a roster itself.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DraftPhase, Player, Team, TeamRosterState } from "./types";
import { getSlotCaps, getWcCap } from "./constants";

import { fetchRosters } from "@/lib/rosters/api";
import { playerPositions } from "@/lib/players/positions";

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

  // Watchlist (the server keeps the order; auto-pick takes from it first)
  watchlist: Record<string, true>;
  watchlistOrder: string[];
  moveWatchlist: (playerId: string, delta: number) => void;

  // From the server
  draftLeagueId: string | null;
  myTeamId: string | null;
  deadlineMs: number | null; // this device's clock
  draftComplete: boolean;
  lastError: string | null;

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


type Pos = string;


function eligiblePositions(p: any): Pos[] {
  return playerPositions(p) as Pos[];
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
    const res = await fetch(`/api/draft/get?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) return;
    const st = json.state;
    const rows: any[] = json.picks ?? [];
    const order: string[] = (st?.draft_order_team_ids ?? []).map(String);
    // the server's clock vs this device's, so the countdown is right even if the device clock is off
    const offset = Number(json.serverNow) - Date.now();
    const deadline = st?.pick_deadline_at ? new Date(st.pick_deadline_at).getTime() - offset : null;

    set((prev) => {
      // teams in draft order
      const byId = new Map(prev.teams.map((t) => [t.id, t]));
      const teams = [...order.map((id) => byId.get(id)).filter((t): t is Team => !!t), ...prev.teams.filter((t) => !order.includes(t.id))];
      const total = Number(st?.total_picks) || teams.length * prev.roundsPerTeam;

      // picks and rosters, from the server's picks
      const picks: Array<Player | null> = Array.from({ length: total }, () => null);
      const byTeam = new Map<string, Player[]>();
      for (const r of rows) {
        const n = Number(r.pick_number);
        const player = prev.playersById?.[String(r.player_id)] ?? ({ id: String(r.player_id) } as Player);
        if (n >= 1 && n <= total) picks[n - 1] = player;
        byTeam.set(String(r.team_id), [...(byTeam.get(String(r.team_id)) ?? []), player]);
      }
      const rosters: Record<string, TeamRosterState> = {};
      for (const t of teams) {
        const players = byTeam.get(t.id) ?? [];
        rosters[t.id] = rebalanceRoster(players, getSlotCaps(), getWcCap()) ?? { slots: {}, wildcards: players };
      }

      const last = rows[rows.length - 1];
      let latestPickText = prev.latestPickText;
      if (last) {
        const p = prev.playersById?.[String(last.player_id)];
        const teamName = byId.get(String(last.team_id))?.name ?? "TBC";
        const who = p ? `${p.firstName?.[0] ?? ""}. ${p.lastName ?? ""}` : String(last.player_id);
        latestPickText = `${teamName} ${last.auto ? "auto-drafted" : "took"} ${who} with the ${ordinal(Number(last.pick_number))} Pick`;
      } else {
        latestPickText = "No picks yet.";
      }

      const queue: string[] = (json.queue ?? []).map(String);
      return {
        ...prev,
        teams,
        isDraftOrderSet: order.length > 0,
        phase: st?.phase === "live" || st?.phase === "complete" ? "liveDraft" : "preDraft",
        draftComplete: st?.phase === "complete",
        pickIndex: Number(st?.pick_index ?? 1),
        picks,
        rosters,
        latestPickText,
        deadlineMs: deadline,
        myTeamId: json.myTeamId ?? null,
        draftLeagueId: leagueId,
        watchlistOrder: queue,
        watchlist: Object.fromEntries(queue.map((id) => [id, true as const])),
        draftPicks: rows.map((r) => ({
          id: String(r.id), leagueId: String(r.league_id), week: 1, teamId: String(r.team_id), playerId: String(r.player_id),
          pickNumber: Number(r.pick_number), round: Number(r.round), createdAtMs: new Date(r.created_at).getTime(),
        })),
      };
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
      watchlistOrder: [],
      draftLeagueId: null,
      myTeamId: null,
      deadlineMs: null,
      draftComplete: false,
      lastError: null,
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
      // Rosters are saved by the server (draft, free agency, waivers, trades), never the browser.
      persistRosterToDb: async () => {},
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

void leagueId; // rosters are saved by the server
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

      // Send the pick; the server checks it (your turn, player free, positions) and saves it.
      confirmDraft: async (player, leagueId, onDraftComplete) => {
        const lid = leagueId ?? get().draftLeagueId;
        if (!lid) return;
        set({ lastError: null });
        try {
          const res = await fetch("/api/draft/pick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leagueId: lid, playerId: player.id }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok) set({ lastError: json?.error ?? "That pick didn't go through" });
        } catch {
          set({ lastError: "That pick didn't go through" });
        }
        await get().refreshFromServer(lid);
        if (get().draftComplete) onDraftComplete?.(lid);
      },

      // Auto-picks happen on the server when the time runs out; this just refreshes.
      autoDraft: async (_allPlayers, leagueId, onDraftComplete) => {
        const lid = leagueId ?? get().draftLeagueId;
        if (!lid) return;
        await get().refreshFromServer(lid);
        if (get().draftComplete) onDraftComplete?.(lid);
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
        const order = get().watchlistOrder.includes(playerId)
          ? get().watchlistOrder.filter((id) => id !== playerId)
          : [...get().watchlistOrder, playerId];
        saveWatchlist(get, set, order);
      },

      moveWatchlist: (playerId, delta) => {
        const order = [...get().watchlistOrder];
        const i = order.indexOf(playerId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        saveWatchlist(get, set, order);
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
  // (the watchlist now lives on the server)

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

/** Update the watchlist here straight away, then save it on the server (in order). */
function saveWatchlist(
  get: () => DraftState,
  set: (partial: Partial<DraftState>) => void,
  order: string[]
) {
  set({ watchlistOrder: order, watchlist: Object.fromEntries(order.map((id) => [id, true as const])) });
  const leagueId = get().draftLeagueId;
  if (!leagueId) return;
  fetch("/api/draft/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leagueId, playerIds: order }),
  }).catch((e) => console.log("watchlist save failed", e));
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
