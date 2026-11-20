"use client";
// components/transactions/useLeagueWatchlist.ts
// The Transactions page's watchlist: loads the league's watchlist, and adds / removes a player
// (shows the change straight away, puts it back if saving fails). Moved out of
// app/transactions/page.tsx (20 Nov 2026).
import React, { useEffect, useMemo, useState } from "react";

export function useLeagueWatchlist(activeLeague: { id?: string | null } | null | undefined) {
const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
const [watchlistLoaded, setWatchlistLoaded] = useState(false);

const toggleWatchlist = React.useCallback(
  async (playerId: string) => {
    const leagueId = String(activeLeague?.id ?? "");
    if (!leagueId) return;

    // (TEMP) league-wide watchlist
    // Later when you make it per-team, include teamId in these API calls.
    const isStar = watchlistSet.has(playerId);

    // optimistic UI
    setWatchlistSet((prev) => {
      const next = new Set(prev);
      if (isStar) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

    try {
      if (isStar) {
        await fetch(
          `/api/watchlist?leagueId=${encodeURIComponent(leagueId)}&playerId=${encodeURIComponent(playerId)}`,
          { method: "DELETE" }
        );
      } else {
        await fetch(`/api/watchlist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leagueId, playerId }),
        });
      }
    } catch (e) {
      // rollback on failure
      setWatchlistSet((prev) => {
        const next = new Set(prev);
        if (isStar) next.add(playerId);
        else next.delete(playerId);
        return next;
      });
    }
  },
  [activeLeague?.id, watchlistSet]
);

const watchlist = useMemo(() => {
  // keep your existing "watchlist[playerId]" checks working
  const obj: Record<string, boolean> = {};
  watchlistSet.forEach((id) => (obj[id] = true));
  return obj;
}, [watchlistSet]);

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  let cancelled = false;
  (async () => {
    setWatchlistLoaded(false);
    const res = await fetch(`/api/watchlist?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (cancelled) return;

    if (res.ok && json?.ok) {
      setWatchlistSet(new Set<string>((json.data ?? []).map(String)));
    } else {
      setWatchlistSet(new Set());
    }
    setWatchlistLoaded(true);
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeague?.id]);

return { watchlist, watchlistSet, watchlistLoaded, toggleWatchlist };
}
