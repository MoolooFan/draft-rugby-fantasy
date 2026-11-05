// lib/players/pool.ts
// The season's player pool for the pages, from the database (via the players store).
// It replaced the players.json file that was built into the site, so edits made on the admin
// page show up everywhere.
"use client";

import { useEffect } from "react";
import { usePlayersStore, type PlayerFromSheet } from "@/lib/players/store";

/** Player pool for a page (loads it if it isn't loaded yet). */
export function usePlayerPool(): PlayerFromSheet[] {
  const players = usePlayersStore((s) => s.players);
  const loaded = usePlayersStore((s) => s.loaded);
  const refresh = usePlayersStore((s) => s.refresh);
  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);
  return players;
}

/** Player pool outside a page component (whatever is loaded right now). */
export function getPlayerPool(): PlayerFromSheet[] {
  return usePlayersStore.getState().players;
}
