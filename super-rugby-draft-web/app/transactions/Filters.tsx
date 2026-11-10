"use client";
// app/transactions/Filters.tsx
// (moved out of page.tsx unchanged)
import React from "react";

import { TEAM_OPTIONS, POSITION_OPTIONS } from "@/lib/constants";

export type FiltersProps = {
  search: string;
  setSearch: (v: string) => void;

  teamFilter: string;
  setTeamFilter: (v: string) => void;

  posFilter: string;
  setPosFilter: (v: string) => void;

  ownerFilterValue: string;
  setOwnerFilterValue: (v: string) => void;

  ownerFilterOptions: Array<{ label: string; value: string }>;

  infoMode: string;
  setInfoMode: (v: string) => void;
};

export const Filters = React.memo(function Filters({
  search,
  setSearch,
  teamFilter,
  setTeamFilter,
  posFilter,
  setPosFilter,
  ownerFilterValue,
  setOwnerFilterValue,
  ownerFilterOptions,
  infoMode,
  setInfoMode,
}: FiltersProps) {
  const stopCapture = (e: any) => {
    e.stopPropagation?.();
  };

  const inputWrap: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "8px 10px",
    boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
  };

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      <div style={inputWrap}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 26px", alignItems: "center", gap: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // ✅ keep keyboard open while typing; only close on Enter
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder="Search players"
            inputMode="search"
            enterKeyHint="search"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
            }}
          />
          <div style={{ textAlign: "right", fontSize: 16, opacity: 0.65 }}>🔍</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: teamFilter ? "#0f172a" : "rgba(15,23,42,0.55)",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            <option value="">All Teams</option>
            {TEAM_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(15,23,42,0.45)",
              fontSize: 16,
              pointerEvents: "none",
            }}
          >
            ▾
          </span>
        </div>

        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: posFilter ? "#0f172a" : "rgba(15,23,42,0.55)",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            <option value="">All Positions</option>
            {POSITION_OPTIONS.filter((p) => String(p.value).toUpperCase() !== "WC").map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(15,23,42,0.45)",
              fontSize: 16,
              pointerEvents: "none",
            }}
          >
            ▾
          </span>
        </div>
      </div>

      {/* Owner + Info mode side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={ownerFilterValue}
            onChange={(e) => setOwnerFilterValue(e.target.value)}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: ownerFilterValue === "available" ? "rgba(15,23,42,0.55)" : "#0f172a",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            {ownerFilterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(15,23,42,0.45)",
              fontSize: 16,
              pointerEvents: "none",
            }}
          >
            ▾
          </span>
        </div>

        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={infoMode}
            onChange={(e) => setInfoMode(e.target.value)}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            <option value="DRAFT_RANK">Draft Rank</option>
            <option value="MATCH_AVG">Match Average</option>
            <option value="TOTAL_PTS">Total Points</option>
            <option value="FORM_3">Form</option>
            <option value="LAST_SCORE">Last Fixture</option>
            <option value="GAMES_PLAYED">Games Played</option>
            <option value="TRIES">Tries Scored</option>
            <option value="TRY_ASSISTS">Try Assists</option>
            <option value="LINEBREAKS">Line Breaks</option>
            <option value="LINEBREAK_ASSISTS">Line Break Assists</option>
            <option value="DEFENDERS_BEATEN">Defenders Beaten</option>
            <option value="METRES_GAINED">Metres Gained</option>
            <option value="OFFLOADS">Offloads</option>
            <option value="TACKLES">Tackles</option>
            <option value="MISSED_TACKLES">Missed Tackles</option>
            <option value="TURNOVERS_FORCED">Turnovers Forced</option>
            <option value="INTERCEPTIONS">Interceptions</option>
            <option value="KICKS_50_22">50:22 Kicks</option>
            <option value="PENALTIES_CONCEDED">Penalties Conceded</option>
            <option value="ERRORS">Errors</option>
            <option value="LINEOUTS_WON">Lineouts Won</option>
            <option value="LINEOUT_STEALS">Lineout Steals</option>
            <option value="LINEOUT_ERRORS">Lineout Errors</option>
            <option value="SCRUMS_WON">Scrums Won</option>
            <option value="CONVERSIONS">Conversions</option>
            <option value="PENALTY_GOALS">Penalty Goals</option>
            <option value="DROP_GOALS">Drop Goals</option>
            <option value="YELLOW_CARDS">Yellow Cards</option>
            <option value="RED_CARDS">Red Cards</option>
          </select>

          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(15,23,42,0.45)",
              fontSize: 16,
              pointerEvents: "none",
            }}
          >
            ▾
          </span>
        </div>
      </div>
    </div>
  );
});
