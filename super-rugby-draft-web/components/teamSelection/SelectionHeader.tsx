"use client";
// components/teamSelection/SelectionHeader.tsx
// Team Selection's top: menu, title and the lineup's projected total, the deadline banner, the
// view picker (Projected / Next Fixture / ...) and Save. Moved out of app/team-selection/page.tsx.
import React from "react";
import { formatProjection } from "@/lib/projections/useProjections";
import { card as themeCard, muted, num } from "@/lib/ui/theme";
import type { ViewMode } from "./helpers";

const card35: React.CSSProperties = { ...themeCard, padding: undefined };

function Hamburger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open menu"
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        margin: 0,
        color: "inherit",
        fontSize: 30,
        fontWeight: 700,
        lineHeight: "30px",
        cursor: "pointer",
      }}
    >
      ☰
    </button>
  );
}

export function SelectionHeader({
  onOpenMenu,
  teamProj,
  roundText,
  deadlineText,
  viewMode,
  onViewMode,
  hasLastSeason,
  lastSeasonYear,
  saveDisabled,
  saveLabel,
  onSave,
}: {
  onOpenMenu: () => void;
  /** the lineup's projected total (null: none yet) */
  teamProj: number | null;
  roundText: string;
  deadlineText: string;
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  hasLastSeason: boolean;
  lastSeasonYear: number;
  saveDisabled: boolean;
  saveLabel: string;
  onSave: () => void;
}) {
  return (
    <>
        {/* Header + Hamburger */}
        <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Hamburger onClick={onOpenMenu} />
           
            <div style={{ flex: 1 }} />
            {/* DEV dropdown (you said remove later) */}
            
          </div>

<div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
  <div style={{ fontSize: 18, fontWeight: 700 }}>Team Selection</div>
  {teamProj != null ? (
    <div style={{ textAlign: "right", lineHeight: 1 }} title="Expected points for this lineup">
      <div style={{ ...num, fontSize: 22, fontWeight: 600 }}>{formatProjection(teamProj)}</div>
      <div style={{ fontSize: 10, fontWeight: 500, color: muted, marginTop: 2 }}>Projected</div>
    </div>
  ) : null}
</div>

        </div>

{/* Deadline banner, below the white header card like the dashboard's (Ethan, 20 Nov 2026) */}
<div
  style={{
    marginTop: 10,

    borderRadius: 999,
    overflow: "hidden",
    boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
  }}
>

  <div
    style={{
      background: "#FACC15",
      color: "#0f172a",
      textAlign: "center",
      padding: "6px 12px",
      fontWeight: 600,
      fontSize: 11,
    }}
  >
   {roundText} • Team Selection Deadline

  </div>

    <div
    suppressHydrationWarning
    style={{
      background: "rgba(255,255,255,0.88)",
      color: "#0f172a",
      textAlign: "center",
      padding: "6px 12px",
      fontWeight: 500,
      fontSize: 11,
      borderTop: "1px solid rgba(15,23,42,0.12)",
    }}
  >
    {deadlineText}
  </div>
</div>

{/* DEV dropdown (temporary) — below header, top-right */}
<div
  style={{
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  }}
>
  <select
    value={viewMode}
    onChange={(e) => onViewMode(e.target.value as ViewMode)}
    style={{
      height: 30,
      width: 130,
      borderRadius: 12,
      border: "none",
      outline: "none",
      padding: "0 10px",
      fontSize: 11,
      fontWeight: 500,
      color: "#0f172a",
      background: "rgba(255,255,255,0.9)",
      boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
    }}
    title="DEV: view mode"
  >
    <option value="Projected">Projected</option>
    <option value="Fixture">Next Fixture</option>
    <option value="Latest Score">Latest Score</option>
    <option value="PPG">Match Average</option>
    {hasLastSeason ? <option value="LastSeason">{lastSeasonYear} Average</option> : null}
    <option value="Per80">Per 80</option>
    <option value="Form">Form</option>
  </select>

  <button
  onClick={onSave}
  disabled={saveDisabled}
    style={{
      height: 30,
      padding: "0 30px",
      borderRadius: 12,
      border: "none",
      fontSize: 11,
      fontWeight: 700,
      cursor: saveDisabled ? "default" : "pointer",
      color: "#0f172a",
      background: saveDisabled ? "rgba(255,255,255,0.55)" : "#FACC15",
      boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
      opacity: saveDisabled ? 0.7 : 1,
      whiteSpace: "nowrap",
    }}
  >
    {saveLabel}
</button>
</div>
    </>
  );
}
