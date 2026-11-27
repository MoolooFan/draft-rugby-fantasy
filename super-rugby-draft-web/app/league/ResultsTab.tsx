"use client";
// app/league/ResultsTab.tsx
// The League page's Results tab: finished rounds' scores, newest first. Moved out of
// app/league/page.tsx. On a computer (`columns`) each round is its own box, in columns.

import React from "react";

import { roundLabel } from "@/lib/season";

import { finalsLabelStyle, finalsPlaceholderRowStyle, grandFinalLabelStyle, isGrandFinalHeader, isPlayoffsKind, listBox, shouldInjectPlaceholder, type FixtureRow, type FixtureWeek } from "./fixtureRows";

export function ResultsTab({
  fixtures,
  isFantasyWeekComplete,
  rowPlayed,
  scoreFromSheet,
  columns = false,
  limit,
}: {
  fixtures: FixtureWeek[];
  isFantasyWeekComplete: (weekNo: number) => boolean;
  rowPlayed: (r: FixtureRow, weekNo: number) => boolean;
  scoreFromSheet: (weekNo: number, teamId: string | null) => number | null;
  /** computers: each round in its own box, in columns */
  columns?: boolean;
  /** only the newest few rounds */
  limit?: number;
}) {
    const past = fixtures
  .filter((w) => isFantasyWeekComplete(w.weekNo))
  .slice()
  .reverse()
  .slice(0, limit ?? Infinity);

    return (
      <div style={columns ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, marginTop: 10, alignItems: "start" } : listBox}>
        {past.map((w, idx) => (
          <div key={w.weekNo} style={columns ? { ...listBox, marginTop: 0 } : { borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>

  {/* Week heading */}
  <div
  style={{
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
    background: "rgba(15,23,42,0.08)",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    letterSpacing: 0.4,
  }}
>
  {roundLabel(w.weekNo)}
</div>

  {/* existing match rows below */}
{w.rows.map((r, i) => {
  const isLabelRow = !!r.label;

if (isLabelRow) {
  const isFinalsHeader = isPlayoffsKind(r.kind ?? null);

  return (
    <React.Fragment key={`${w.weekNo}-${i}`}>
      <div
  style={
    isFinalsHeader
      ? (isGrandFinalHeader(r) ? grandFinalLabelStyle : finalsLabelStyle)
      : {
          padding: "9px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 700,
          textAlign: "center",
          opacity: 0.9,
        }
  }
>
  {r.home}
</div>

      {shouldInjectPlaceholder(r) && (
        <div style={finalsPlaceholderRowStyle}>
          <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
          <div style={{ opacity: 0.8, fontWeight: 600 }}>v</div>
          <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

  const isHomeBye = r.home === "BYE";
  const isAwayBye = r.away === "BYE";
  const isBye = isHomeBye || isAwayBye;

  const played = rowPlayed(r, w.weekNo);

  const realTeamName = isHomeBye ? r.away : r.home;
  const realTeamId = isHomeBye ? (r.awayTeamId ?? null) : (r.homeTeamId ?? null);

  const byePoints =
    isBye && realTeamId ? scoreFromSheet(w.weekNo, realTeamId) : null;

      // ✅ BYE row (same format as Fixtures tab, but includes score)
  if (isBye) {
    return (
      <div
        key={`${w.weekNo}-${i}`}
        style={{
          padding: "8px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(15,23,42,0.04)",
        }}
      >
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {realTeamName}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* score chip */}
          <div
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.10)",
              fontWeight: 700,
              fontSize: 10,
            }}
            title="Your score this week"
          >
            {byePoints ?? "—"}
          </div>

          {/* BYE chip */}
          <div
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.08)",
              fontWeight: 500,
              fontSize: 10,
            }}
          >
            BYE
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: 10,
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        alignItems: "center",
      }}
    >
      {/* Left side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isHomeBye ? realTeamName : r.home}
        </div>

        <div style={{ fontWeight: 700, textAlign: "right", minWidth: 22 }}>
          {isBye ? (isHomeBye ? byePoints : "—") : (r.homeScore ?? "—")}
        </div>
      </div>

      {/* Middle */}
<div style={{ opacity: 0.8, fontWeight: 500 }}>
  {isBye ? "BYE" : "v"}
</div>

      {/* Right side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 700, textAlign: "left", minWidth: 22 }}>
          {isBye ? (isAwayBye ? byePoints : "—") : (r.awayScore ?? "—")}
        </div>

        <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isAwayBye ? realTeamName : r.away}
        </div>
      </div>
      
    </div>
  );
})}

          </div>
        ))}
      </div>
    );
  }
