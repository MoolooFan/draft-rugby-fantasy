"use client";

// The Per game / Total / Per 80 switch (plan item C1) and the season switch. Changing either changes every page,
// unless a value and onChange are given (the player card keeps its own: Ethan, 25 Nov 2026).

import React from "react";
import { STAT_VIEWS, STAT_VIEW_LABEL, useStatView, type StatView } from "@/lib/players/statView";
import { useStatSeason } from "@/lib/players/useStatSeason";

export function StatViewToggle({ dark = false, style, value, onChange }: { dark?: boolean; style?: React.CSSProperties; value?: StatView; onChange?: (v: StatView) => void }) {
  const [shared, setShared] = useStatView();
  const view = value ?? shared;
  const setView = onChange ?? setShared;
  return (
    <div
      role="radiogroup"
      aria-label="Show stats"
      style={{
        display: "inline-grid",
        gridTemplateColumns: "repeat(3, auto)",
        borderRadius: 999,
        padding: 2,
        gap: 2,
        background: dark ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.22)",
        ...style,
      }}
    >
      {STAT_VIEWS.map((v) => {
        const on = v === view;
        return (
          <button
            key={v}
            role="radio"
            aria-checked={on}
            onClick={() => setView(v)}
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 999,
              border: "none",
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: "nowrap",
              cursor: "pointer",
              background: on ? (dark ? "#0f172a" : "rgba(255,255,255,0.95)") : "transparent",
              color: on ? (dark ? "white" : "#0f172a") : dark ? "#0f172a" : "white",
            }}
          >
            {STAT_VIEW_LABEL[v]}
          </button>
        );
      })}
    </div>
  );
}

/** The 2026 / 2027 switch (lib/players/useStatSeason): which season's stats are shown. Hidden with one season. */
export function SeasonToggle({ dark = false, style, value, onChange }: { dark?: boolean; style?: React.CSSProperties; value?: number; onChange?: (s: number) => void }) {
  const shared = useStatSeason();
  const seasons = shared.seasons;
  const season = value ?? shared.season;
  const setSeason = onChange ?? shared.setSeason;
  if (seasons.length < 2) return null;
  return (
    <div
      role="radiogroup"
      aria-label="Season"
      style={{
        display: "inline-grid",
        gridTemplateColumns: `repeat(${seasons.length}, auto)`,
        borderRadius: 999,
        padding: 2,
        gap: 2,
        background: dark ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.22)",
        ...style,
      }}
    >
      {[...seasons].sort((a, b) => a - b).map((y) => {
        const on = y === season;
        return (
          <button
            key={y}
            role="radio"
            aria-checked={on}
            onClick={() => setSeason(y)}
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 999,
              border: "none",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              background: on ? (dark ? "#0f172a" : "rgba(255,255,255,0.95)") : "transparent",
              color: on ? (dark ? "white" : "#0f172a") : dark ? "#0f172a" : "white",
            }}
          >
            {y}
          </button>
        );
      })}
    </div>
  );
}
