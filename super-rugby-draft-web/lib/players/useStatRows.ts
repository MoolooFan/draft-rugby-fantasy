"use client";
// lib/players/useStatRows.ts
// Stat rows for any season (the Stats Hub and the player comparison can look at last season
// too), and who owns each player in your league. Downloads are shared (lib/cachedJson.ts).
import { useEffect, useState } from "react";
import { cachedJson } from "@/lib/cachedJson";
import { usePlayersStore } from "@/lib/players/store";
import { currentSeasonYear, SEASONS } from "@/lib/season";

/** Seasons with stats people can pick, newest first (up to this season). */
export function statSeasons(): number[] {
  return Object.keys(SEASONS).map(Number).filter((y) => y <= currentSeasonYear()).sort((a, b) => b - a);
}

/** A season's stat rows (one per player per round), and whether they're still loading. */
export function useSeasonStatRows(season: number): { rows: Array<Record<string, unknown>>; loading: boolean } {
  const statSeason = usePlayersStore((s) => s.statSeason);
  const statRows = usePlayersStore((s) => s.statRows);
  const roundRows = usePlayersStore((s) => s.roundRows);
  const loaded = usePlayersStore((s) => s.loaded);
  const refresh = usePlayersStore((s) => s.refresh);
  const fromStore = season === statSeason ? statRows : season === currentSeasonYear() ? roundRows : null;
  const [other, setOther] = useState<{ season: number; rows: Array<Record<string, unknown>> } | null>(null);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    if (fromStore) return;
    let live = true;
    cachedJson<{ rows?: Array<Record<string, unknown>> }>(`/api/players/round-stats?season=${season}`, 10 * 60_000)
      .then((j) => live && setOther({ season, rows: Array.isArray(j?.rows) ? j.rows : [] }))
      .catch(() => live && setOther({ season, rows: [] }));
    return () => {
      live = false;
    };
  }, [season, fromStore]);

  if (fromStore) return { rows: fromStore, loading: !loaded };
  return other?.season === season ? { rows: other.rows, loading: false } : { rows: [], loading: true };
}

/** Every player id on a roster (any of the shapes rosters have been saved in), including IR. */
function rosterIds(data: unknown): string[] {
  const d = (data ?? {}) as { playerIds?: unknown[]; slots?: Record<string, unknown[]>; wildcards?: unknown[]; irIds?: unknown[] };
  const ids = new Set<string>();
  const add = (x: unknown) => {
    const id = typeof x === "object" && x ? (x as { id?: unknown }).id : x;
    if (id != null && String(id).trim()) ids.add(String(id).trim());
  };
  if (Array.isArray(d.playerIds) && d.playerIds.length) d.playerIds.forEach(add);
  else {
    for (const arr of Object.values(d.slots ?? {})) if (Array.isArray(arr)) arr.forEach(add);
    (d.wildcards ?? []).forEach(add);
  }
  (d.irIds ?? []).forEach(add);
  return [...ids];
}

export type LeagueOwners = {
  /** player id -> fantasy team id */
  owner: Map<string, string>;
  /** players just dropped (on waivers until their lock ends) */
  onWaivers: Set<string>;
};

/** Who owns each player in a league (null when not in one, or still loading). */
export function useLeagueOwners(leagueId: string | null | undefined): LeagueOwners | null {
  const [data, setData] = useState<{ leagueId: string; owners: LeagueOwners } | null>(null);
  useEffect(() => {
    if (!leagueId) return;
    let live = true;
    const id = encodeURIComponent(leagueId);
    Promise.all([
      cachedJson<{ ok?: boolean; data?: Array<{ team_id: string; data: unknown }> }>(`/api/rosters?leagueId=${id}`, 60_000),
      cachedJson<{ ok?: boolean; data?: Array<{ player_id: string; locked_until_ms: number }> }>(`/api/drop-locks?leagueId=${id}`, 60_000).catch(() => null),
    ])
      .then(([rosters, locks]) => {
        if (!live) return;
        const owner = new Map<string, string>();
        for (const r of rosters?.data ?? []) for (const pid of rosterIds(r.data)) owner.set(pid, String(r.team_id));
        const now = Date.now();
        const onWaivers = new Set((locks?.data ?? []).filter((l) => Number(l.locked_until_ms) > now && !owner.has(String(l.player_id))).map((l) => String(l.player_id)));
        setData({ leagueId, owners: { owner, onWaivers } });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [leagueId]);
  return leagueId && data?.leagueId === leagueId ? data.owners : null;
}
