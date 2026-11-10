"use client";

import { create } from "zustand";
import { currentSeasonYear, statsSeasonYear } from "@/lib/season";
import { cachedJson } from "@/lib/cachedJson";

export type PlayerFromSheet = {
  id: string;
  firstName: string;
  lastName: string;

  teamCode: string;
  teamName?: string;

  posAbbrev: string;
  posName?: string;

  secondaryPosAbbrev?: string;
  secondaryPosName?: string;

  draftRank?: number;

  // from players sheet
  status?: string | null;
  weeklyStatus?: Record<string, string>;
};

type PlayersState = {
  players: PlayerFromSheet[];
  roundRows: Record<string, any>[]; // this season's stat rows (matchups, lineups, live scores)
  /** Stat rows people browse on player cards and in player pools: last season's until this
   *  season's first kickoff (lib/season statsSeasonYear), then the same as roundRows. */
  statRows: Record<string, any>[];
  statSeason: number;

  loading: boolean;
  error: string | null;
  loaded: boolean;

  refresh: () => Promise<void>;
  getById: (id: string) => PlayerFromSheet | undefined;
};

function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export const usePlayersStore = create<PlayersState>((set, get) => ({
  players: [],
  roundRows: [],
  statRows: [],
  statSeason: statsSeasonYear(),

  loading: false,
  error: null,
  loaded: false,

  refresh: async () => {
    if (get().loading) return;

    try {
      set({ loading: true, error: null });

      const statSeason = statsSeasonYear();
      const [playersJson, statsJson, browseJson] = await Promise.all([
        cachedJson<any>(`/api/players/list?season=${currentSeasonYear()}`),
        cachedJson<any>(`/api/players/round-stats?season=${currentSeasonYear()}`),
        statSeason === currentSeasonYear() ? Promise.resolve(null) : cachedJson<any>(`/api/players/round-stats?season=${statSeason}`),
      ]);

      const players = Array.isArray(playersJson?.players)
        ? playersJson.players
        : [];

      const roundRows = Array.isArray(statsJson?.rows)
        ? statsJson.rows
        : [];

      const statRows = browseJson ? (Array.isArray(browseJson?.rows) ? browseJson.rows : []) : roundRows;

      set({
        players,
        roundRows,
        statRows,
        statSeason,
        loading: false,
        loaded: true,
        error: null,
      });
    } catch (e: any) {
      set({
        loading: false,
        loaded: true,
        error: e?.message ?? "Failed to load players",
      });
    }
  },

  getById: (id: string) => {
    const want = normaliseId(id);
    return get().players.find((p) => normaliseId(p.id) === want);
  },
}));

/**
 * Backwards-compatible hook (so you don’t have to refactor every page immediately).
 */
export function usePlayers() {
  const players = usePlayersStore((s) => s.players);
  const loading = usePlayersStore((s) => s.loading);
  const loaded = usePlayersStore((s) => s.loaded);
  const refresh = usePlayersStore((s) => s.refresh);

  const React = require("react") as typeof import("react");
  const { useEffect } = React;

  useEffect(() => {
    if (!loaded && !loading) refresh();
  }, [loaded, loading, refresh]);

  return { players, loading };
}
