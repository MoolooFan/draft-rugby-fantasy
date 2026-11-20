"use client";
// app/league/FixturesTab.tsx
// The League page's Fixtures tab: every round's matchups (finals labels and placeholders, BYEs,
// the next Shield game). Moved out of app/league/page.tsx.

import React from "react";

import { roundLabel } from "@/lib/season";

import { ShieldIcon } from "@/components/AwardIcons";
import { finalsLabelStyle, finalsPlaceholderRowStyle, grandFinalLabelStyle, isGrandFinalHeader, isPlayoffsKind, listBox, shouldInjectPlaceholder, type FixtureRow, type FixtureWeek } from "./fixtureRows";
import type { League } from "@/lib/league/types";

export function FixturesTab({
  league,
  fixtures,
  regularWeeks,
  isFantasyWeekComplete,
  rowPlayed,
}: {
  league: League | null;
  fixtures: FixtureWeek[];
  regularWeeks: number;
  isFantasyWeekComplete: (weekNo: number) => boolean;
  rowPlayed: (r: FixtureRow, weekNo: number) => boolean;
}) {
    const future = fixtures.filter((w) => !isFantasyWeekComplete(w.weekNo));
    return (
      <div style={listBox}>
        {future.map((w: FixtureWeek, idx) => {
  const isPlayoffGroup = w.weekNo > regularWeeks;

  return (

          <div key={w.weekNo} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>
            <div
  style={{
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 600,
    textAlign: "center",
    background: "rgba(15,23,42,0.08)",   // darker strip
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    letterSpacing: 0.4,
  }}
>
  {roundLabel(w.weekNo)}
</div>

            {w.rows.map((r, i) => {
const isLabelRow = !!r.label;

if (isLabelRow) {
  const isFinalsHeader = isPlayoffsKind(r.kind ?? null);

  return (
    <React.Fragment key={`${w.weekNo}-${i}`}>
      {/* Finals/label header */}
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

      {/* If it's a finals header, show a placeholder matchup under it */}
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
  const realTeamName = isHomeBye ? r.away : r.home;
const realTeamId = isHomeBye ? (r.awayTeamId ?? null) : (r.homeTeamId ?? null);
  
if (isBye) {
  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        // background: "rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {realTeamName}
      </div>

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
  );
}

  const realTeam = isHomeBye ? r.away : r.home;
  const played = rowPlayed(r, w.weekNo);

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
        opacity: isBye ? 0.9 : 1,
      }}
    >
      <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isHomeBye ? realTeam : r.home}
      </div>

      <div style={{ opacity: 0.8, fontWeight: 500, textAlign: "center" }}>
        {isBye ? "BYE" : "v"}
        {!isBye && !played && league?.shield?.enabled && league.shield.next?.week === w.weekNo &&
        league.shield.next.homeTeamId === r.homeTeamId && league.shield.next.awayTeamId === r.awayTeamId ? (
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2, fontSize: 8, fontWeight: 700, letterSpacing: 0.5, color: "#6a4426" }}>
            <ShieldIcon size={12} /> SHIELD CHALLENGE
          </div>
        ) : null}
      </div>

      <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isAwayBye ? realTeam : r.away}
      </div>
    </div>
  );
})}

          </div>
        );
      })}
      </div>
    );
  }
