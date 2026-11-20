"use client";
// app/trade/propose/TradeLists.tsx
// The trade page's player lists (grouped by position, each player with the chosen view's number
// and a Trade button) and the review step's Cancel / Propose buttons. Moved out of
// TradeProposePageInner.tsx.
import React from "react";
import { StatusTag } from "@/components/StatusTag";
import { positionsLabel } from "@/lib/players/positions";
import { fullTeamName, groupByPosition, JerseyTile, listBox, shortName, type ModalContext, type Player } from "./helpers";

function SectionHeader({ title, color }: { title: string; color: string }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 700,
        color,
      }}
    >
      {title}
    </div>
  );
}

function PlayerRow({
  p,
  selected,
  onToggle,
  onOpen,
  metric,
}: {
  p: Player;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** the chosen view's number */
  metric: string;
}) {

  return (
    <div
      onClick={onOpen}
      style={{
        padding: "8px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        display: "grid",
        gridTemplateColumns: "1fr 82px 82px",
        gap: 10,
        alignItems: "center",
        background: selected ? "rgba(37,99,235,0.10)" : "transparent",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <JerseyTile teamCode={p.teamCode} size={26} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shortName(p)}
            </div>
            <StatusTag player={p} />
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              opacity: 0.7,
              whiteSpace: "nowrap",
              overflow: "visible",
              textOverflow: "ellipsis",
            }}
          >
            {fullTeamName(p.teamCode)} — {positionsLabel(p)}
          </div>
        </div>
      </div>

      {/* Metric + live week points */}
      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700 }}>
  {metric}

</div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          height: 26,
          padding: "0 10px",
          borderRadius: 999,
          border: "2px solid #2563EB",
          background: selected ? "#2563EB" : "transparent",
          color: selected ? "white" : "#2563EB",
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Trade
      </button>
    </div>
  );
}

export function GroupedList({
  title,
  titleColor,
  players,
  selectedIds,
  onToggleId,
  context,
  metricOf,
  onOpenPlayer,
  hidePositionHeaders = false,
}: {
  title: string;
  titleColor: string;
  players: Player[];
  selectedIds: string[];
  onToggleId: (id: string) => void;
  context: ModalContext;
  metricOf: (p: Player) => string;
  onOpenPlayer: (p: Player, ctx: ModalContext) => void;
  hidePositionHeaders?: boolean;
}) {

    const groups = groupByPosition(players);
    return (
      <div style={listBox}>
        <SectionHeader title={title} color={titleColor} />
        {groups.map((g) => (
          <div key={g.pos}>
            {!hidePositionHeaders && (
  <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, opacity: 0.55 }}>
    {g.pos === "HO" ? "Hookers" :
     g.pos === "PR" ? "Props" :
     g.pos === "LK" ? "Locks" :
     g.pos === "LF" ? "Loose Forwards" :
     g.pos === "HB" ? "Halfbacks" :
     g.pos === "FH" ? "Flyhalves" :
     g.pos === "CE" ? "Centres" :
     "Outside Backs"}
  </div>
)}

            {g.players.map((p) => (
<PlayerRow
  key={p.id}
  p={p}
  selected={selectedIds.includes(p.id)}
  onToggle={() => onToggleId(p.id)}
  onOpen={() => onOpenPlayer(p, context)}
  metric={metricOf(p)}
/>

            ))}
          </div>
        ))}
      </div>
    );
  }

// The review step's Cancel / Propose buttons
export function ReviewButtons({ canPropose, isProposing, onCancel, onPropose }: { canPropose: boolean; isProposing: boolean; onCancel: () => void; onPropose: () => void }) {

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <button
        onClick={onCancel}
        style={{
          height: 42,
          borderRadius: 12,
          border: "2px solid rgba(239,68,68,0.9)",
          background: "transparent",
          color: "rgba(239,68,68,0.95)",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>

      <button
        disabled={!canPropose || isProposing}
        onClick={onPropose}
        style={{
          height: 42,
          borderRadius: 12,
          border: "none",
          background: canPropose && !isProposing ? "#22C55E" : "rgba(0,0,0,0.20)",
          color: "white",
          fontWeight: 700,
          cursor: canPropose && !isProposing ? "pointer" : "not-allowed",
        }}
      >
        {isProposing ? "Proposing..." : "Propose"}
      </button>
    </div>
  );
}
