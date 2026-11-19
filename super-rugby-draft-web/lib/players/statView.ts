// lib/players/statView.ts
// Per game / Total / Per 80 (plan item C1, agreed with Ethan Nov 2026): one switch that changes
// points and every stat wherever people look at a player's season (player card, player pools,
// draft room, trade screens). Default per game. Per 80 shows "–" until the player has 20+
// minutes in the season. The choice is remembered on this device and shared by every page.
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StatView = "game" | "total" | "per80";

export const STAT_VIEWS: StatView[] = ["game", "total", "per80"];
export const STAT_VIEW_LABEL: Record<StatView, string> = { game: "Per game", total: "Total", per80: "Per 80" };
export const PER80_MIN_MINUTES = 20;

export const useStatViewStore = create<{ view: StatView; setView: (v: StatView) => void }>()(
  persist((set) => ({ view: "game", setView: (view) => set({ view }) }), { name: "sr-stat-view-v1" })
);

export function useStatView(): [StatView, (v: StatView) => void] {
  const view = useStatViewStore((s) => s.view);
  const setView = useStatViewStore((s) => s.setView);
  return [view, setView];
}

/** A season total shown per game, as a total, or per 80 minutes (null = nothing to show). */
export function applyStatView(total: number | null | undefined, games: number, minutes: number, view: StatView): number | null {
  if (total == null || !Number.isFinite(total)) return null;
  if (view === "total") return total;
  if (view === "game") return games > 0 ? total / games : null;
  return minutes >= PER80_MIN_MINUTES ? (total / minutes) * 80 : null;
}

/** Totals as whole numbers (one decimal if they need it); per game / per 80 to one decimal. */
export function formatStatView(v: number | null, view: StatView): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (view === "total") return Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : v.toFixed(1);
  return v.toFixed(1);
}

// Which season's stats people are looking at (Ethan, 19 Nov 2026: a 2026 / 2027 switch in the
// player pool filters and on player cards). null = the default: last season's until this
// season's first kickoff, then this season's (lib/season statsSeasonYear). Shared by every page
// for this visit (not remembered: a new visit starts on the default again).
export const useStatSeasonStore = create<{ season: number | null; setSeason: (s: number | null) => void }>()((set) => ({
  season: null,
  setSeason: (season) => set({ season }),
}));
