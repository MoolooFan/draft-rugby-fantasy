"use client";
// components/playerCard/CardBars.tsx
// The player card's green bars: the numbers strip (Match Avg / Form / Total / Position Rk) and
// the action buttons at the bottom (Watch, Claim, Trade ...). Moved out of
// components/PlayerCardModal.tsx.
import React from "react";
import { computeAvgPoints, computeFormAvg, computePositionRank, computeTotalPoints, ENABLE_TRADES, type PlayerRound } from "./cardData";
import type { PlayerCardAction, PlayerCardPlayer } from "../PlayerCardModal";

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export function StatStrip({ p, rounds, allRoundRows }: { p: PlayerCardPlayer; rounds: PlayerRound[]; allRoundRows: Record<string, any>[] }) {
  const matchAvg = rounds.length ? computeAvgPoints(rounds) : 0;
  const formAvg = rounds.length ? computeFormAvg(rounds, 3) : 0;
  const total = computeTotalPoints(rounds);

  const rk = computePositionRank({
    playerId: p.id,
    posAbbrev: String(p.posAbbrev ?? "").toUpperCase(),
    roundRows: allRoundRows,
  });

  return (
    <div
      style={{
        background: "#059669",
        borderTop: "1x solid rgba(255,255,255,0)",
        borderBottom: "1px solid rgba(255,255,255,0.14)",
        padding: 10,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        position: "relative",
        zIndex: 5,
      }}
    >
      <MiniStat label="Match Avg" value={rounds.length ? matchAvg.toFixed(1) : "-"} />
      <MiniStat label="Form" value={rounds.length ? formAvg.toFixed(1) : "-"} />
      <MiniStat label="Total" value={rounds.length ? String(total) : "-"} />
      <MiniStat
  label="Position Rk"
  value={rk ? String(rk.rank) : "-"}
/>

    </div>
  );
}

export function ActionBar({ actions, hideActions }: { actions: PlayerCardAction[]; hideActions: boolean }) {
  // four buttons sit side by side, a little smaller (Ethan, 28 Nov 2026: Team Selection's card)
  const four = actions.length >= 4;
  return (
<div
  style={{
    padding: 10,
    background: "#059669",
    borderTop: "1px solid rgba(255,255,255,0.18)",
    display: "grid",
    gridTemplateColumns: `repeat(${Math.min(actions.length, 4)}, minmax(0, 1fr))`,
    gap: four ? 6 : 10,
  }}
>
    {(!hideActions ? actions : []).map((a) => ( /* more than 4 wrap onto a second row */

    <button
      key={a.label}
      onClick={() => {
  const isTradeAction = a.label.toLowerCase().includes("trade");

  // 🔒 trades disabled => do nothing (design stays)
  if (isTradeAction && !ENABLE_TRADES) return;

  a.onClick();
}}
      style={{
        height: 40,
        borderRadius: 12,
        background: "#059669",
        border: "2px solid rgba(255,255,255,0.9)",
        color: "white",
        fontWeight: 500,
        fontSize: four ? 12 : 14,
        lineHeight: 1.1,
        padding: four ? "0 4px" : "0 8px",
        cursor: "pointer",
        width: "100%",
        whiteSpace: four ? "normal" : "nowrap",
      }}
    >
      {a.label}
    </button>
  ))}
</div>
  );
}
