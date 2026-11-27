"use client";
// components/matchup/LineupRow.tsx
// One row of the Matchup page's lineups: the left team's player, the position (or bench number /
// IR) in the middle, the right team's player. Each side: jersey and name (tap for the player
// card), the fixture ("CRU (A)" / BYE), the points pill (tap for the points breakdown) and the
// projection under it. Moved out of app/matchup/page.tsx. On a computer (`wide`; Ethan, 27 Nov
// 2026) each side also shows the full name and his key stats that round (statLine).
import React from "react";
import { muted, num } from "@/lib/ui/theme";
import { jerseySrcForPlayer, type Player } from "./helpers";

/** The points pill: the captain's (or activated vice's) is purple, the vice-captain's has a purple ring. */
export type CellPill = {
  text: React.ReactNode;
  title: string;
  look: "plain" | "captain" | "vice" | "bench";
};

export type LineupCell = {
  player: Player | null;
  fixtureTag: string;
  pill: CellPill;
  /** the projection under the pill (captain: doubled, in purple) */
  proj: { text: string; captain: boolean } | null;
  onOpenCard: () => void;
  onOpenPoints: () => void;
  /** computers: his key stats this round, e.g. "62 min · 1 T · 12 Tkl · 45 m" */
  statLine?: string | null;
};

const PURPLE = "rgba(168,85,247,0.95)";
// The captain's projection is in purple (like his points pill) to show it has been doubled
// (Ethan, 20 Nov 2026).
const CAPTAIN_PROJ_STYLE = { fontWeight: 700, color: "#9333ea" } as const;

function pillColours(look: CellPill["look"]): React.CSSProperties {
  if (look === "bench") return { background: "rgba(15,23,42,0.08)", color: "#0f172a" };
  return {
    background: look === "captain" ? PURPLE : "rgba(15,23,42,0.08)",
    color: look === "captain" ? "white" : "#0f172a",
    border: look === "captain" ? "0px solid rgba(255,255,255,0.9)" : look === "vice" ? `2px solid ${PURPLE}` : "1px solid transparent",
  };
}

function Jersey({ player }: { player: Player | null }) {
  const src = player ? jerseySrcForPlayer(player, "angle") : null;
  return src ? (
    <img src={src} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "contain", display: "block" }} />
  ) : (
    <div style={{ width: 28, height: 28 }} />
  );
}

function Cell({ cell, side, wide }: { cell: LineupCell; side: "left" | "right"; wide?: boolean }) {
  const p = cell.player;
  const jersey = (
    <button
      onClick={cell.onOpenCard}
      style={{ background: "transparent", border: "none", padding: 0, margin: 0, cursor: p ? "pointer" : "default", ...(side === "right" ? { justifySelf: "end" } : {}) }}
      aria-label="Open player card"
    >
      <Jersey player={p} />
    </button>
  );
  const name = (
    <div style={side === "right" ? { minWidth: 0, textAlign: "right" } : { minWidth: 0 }}>
      <div
        onClick={cell.onOpenCard}
        style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: p ? "pointer" : "default" }}
      >
        {p ? (wide ? `${p.firstName} ${p.lastName}` : p.lastName) : "—"}
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.55 }}>{p ? cell.fixtureTag : "—"}</div>
      {wide && p && cell.statLine ? (
        <div style={{ fontSize: 10.5, fontWeight: 600, color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cell.statLine}</div>
      ) : null}
    </div>
  );
  const points = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div
        onClick={cell.onOpenPoints}
        style={{
          minWidth: 32,
          height: 20,
          padding: "0 6px",
          borderRadius: 999,
          ...pillColours(cell.pill.look),
          display: "grid",
          placeItems: "center",
          ...num,
          fontSize: 13,
          fontWeight: 600,
          cursor: p ? "pointer" : "default",
        }}
        title={cell.pill.title}
      >
        {cell.pill.text}
      </div>
      {cell.proj ? (
        <div
          style={{ ...num, fontSize: 10.5, ...(cell.proj.captain ? CAPTAIN_PROJ_STYLE : { fontWeight: 500, color: muted }), lineHeight: "12px" }}
          title={cell.proj.captain ? "Expected points (doubled for the captain)" : "Expected points"}
        >
          {cell.proj.text}
        </div>
      ) : null}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", minWidth: 0 }}>
      {side === "left" ? jersey : points}
      {name}
      {side === "left" ? points : jersey}
    </div>
  );
}

export function LineupRow({ label, ir = false, left, right, wide = false }: { label: string; ir?: boolean; left: LineupCell; right: LineupCell; wide?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0, 1fr) 44px minmax(0, 1fr)" : "1fr 34px 1fr", gap: wide ? 16 : 10, padding: wide ? "8px 14px" : "7px 10px", borderTop: "1px solid rgba(0,0,0,0.08)", alignItems: "center" }}>
      <Cell cell={left} side="left" wide={wide} />
      {/* the position, bench number (1–5) or IR */}
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 700, opacity: ir ? 1 : 0.7, color: ir ? "#dc2626" : undefined }}>{label}</div>
      <Cell cell={right} side="right" wide={wide} />
    </div>
  );
}

export function BenchHeader({ leftScore, rightScore }: { leftScore: number; rightScore: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        padding: "8px 10px",
        borderTop: "2px solid rgba(0,0,0,0.08)",
        background: "rgba(15,23,42,0.06)",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <div>Bench</div>
      <div style={{ opacity: 0.7 }}>
        {leftScore} • {rightScore}
      </div>
      <div style={{ textAlign: "right" }}>Bench</div>
    </div>
  );
}
