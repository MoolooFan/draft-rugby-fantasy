"use client";

import { create } from "zustand";

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
  roundRows: Record<string, any>[]; // raw rows from player-round-stats sheet

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

  loading: false,
  error: null,
  loaded: false,

  refresh: async () => {
    if (get().loading) return;

    try {
      set({ loading: true, error: null });

      const [playersRes, statsRes] = await Promise.all([
        fetch("/api/sheets/players", { cache: "no-store" }),
        fetch("/api/sheets/player-round-stats", { cache: "no-store" }),
      ]);

      const playersJson = await playersRes.json();
      const statsJson = await statsRes.json();

      const players = Array.isArray(playersJson?.players)
        ? playersJson.players
        : [];

      const roundRows = Array.isArray(statsJson?.rows)
        ? statsJson.rows
        : [];

      set({
        players,
        roundRows,
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
