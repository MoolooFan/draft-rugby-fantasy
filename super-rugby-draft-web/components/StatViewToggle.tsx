"use client";

// The Per game / Total / Per 80 switch (plan item C1). Changing it changes every page.

import React from "react";
import { STAT_VIEWS, STAT_VIEW_LABEL, useStatView } from "@/lib/players/statView";

export function StatViewToggle({ dark = false, style }: { dark?: boolean; style?: React.CSSProperties }) {
  const [view, setView] = useStatView();
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
              fontWeight: 800,
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
