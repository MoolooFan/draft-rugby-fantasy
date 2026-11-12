// lib/projections/useProjections.ts
// Loads expected points for a fantasy week (/api/projections) for the pages, and refreshes
// every 5 minutes (team lists and injury news change them during the week).
"use client";
import { useEffect, useState } from "react";
import type { PlayerProjection, WeekProjections } from "@/lib/projections/server";

export type { PlayerProjection, WeekProjections };

const REFRESH_MS = 5 * 60 * 1000;

/** week = null: don't load. leagueId = null: Standard scoring (e.g. the browse-only player pool). */
export function useProjections(leagueId: string | null, week: number | null | "current"): WeekProjections | null {
  const [data, setData] = useState<{ key: string; value: WeekProjections } | null>(null);
  const key = week == null ? "" : `${leagueId ?? ""}|${week}`;

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = () => {
      const qs = new URLSearchParams();
      if (leagueId) qs.set("leagueId", leagueId);
      if (week !== "current" && week != null) qs.set("week", String(week));
      fetch(`/api/projections?${qs.toString()}`, { cache: "no-store", credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          if (!cancelled && j?.ok) setData({ key, value: j as WeekProjections });
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [key, leagueId, week]);

  return data && data.key === key ? data.value : null;
}

/** A player's projection from the loaded data (ids match exactly or ignoring case). */
export function projectionFor(data: WeekProjections | null, playerId: string | null | undefined): PlayerProjection | null {
  if (!data || !playerId) return null;
  return data.players[playerId] ?? data.players[playerId.toLowerCase()] ?? null;
}

/** "23.4" style for the pages. */
export function formatProjection(pts: number | null | undefined): string {
  return pts == null ? "—" : (Math.round(pts * 10) / 10).toFixed(1);
}
