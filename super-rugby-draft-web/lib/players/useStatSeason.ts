// lib/players/useStatSeason.ts
// The season whose stats the pages show (lib/players/statView useStatSeasonStore), with the
// seasons to choose from and that season's stat rows.
"use client";

import { useStatSeasonStore } from "@/lib/players/statView";
import { usePlayersStore } from "@/lib/players/store";
import { statSeasons, useSeasonStatRows } from "@/lib/players/useStatRows";

export function useStatSeason(): { season: number; setSeason: (s: number) => void; seasons: number[]; isDefault: boolean } {
  const chosen = useStatSeasonStore((s) => s.season);
  const setChosen = useStatSeasonStore((s) => s.setSeason);
  const fallback = usePlayersStore((s) => s.statSeason);
  const seasons = statSeasons();
  const season = chosen != null && seasons.includes(chosen) ? chosen : fallback;
  return { season, setSeason: (s) => setChosen(s === fallback ? null : s), seasons, isDefault: season === fallback };
}

/** The chosen season's stat rows (one per player per round). */
export function useStatSeasonRows(): { season: number; rows: Array<Record<string, unknown>>; loading: boolean } {
  const { season } = useStatSeason();
  const { rows, loading } = useSeasonStatRows(season);
  return { season, rows, loading };
}
