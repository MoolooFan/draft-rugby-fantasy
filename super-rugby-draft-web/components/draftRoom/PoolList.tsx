"use client";
// components/draftRoom/PoolList.tsx
// The Draft Room's Player Pool and Watchlist lists: each player with his number (draft rank,
// My Rank or a stat), the watchlist eye and the Draft button. On a computer the Player Pool shows
// the stat columns picked in Filters instead (up to 5, `extras`; lib/players/poolColumns.ts). Your draft strategy's targets get a
// teal edge and an "Early target" tag; the Watchlist has ▲▼ to set the order auto-pick uses.
import React from "react";
import type { Player } from "@/lib/draft/types";
import { StatusTag } from "@/components/StatusTag";
import { targetShort, type TargetGroup } from "@/lib/draft/strategy";
import { DraftButton, listBox, PlayerInfo, WatchButton } from "./ui";

export type PoolListProps = {
  players: Player[];
  /** shown when there are no players */
  emptyText: string;
  /** above the names: what the numbers are ("Per game · 2026"), blank for ranks */
  columnNote: string;
  /** above the numbers: "Draft Rank", "My Rank", "Tries", ... */
  columnLabel: string;
  numberText: (p: Player) => string;
  /** your strategy's target group for each player */
  targetById: Map<string, TargetGroup>;
  watched: (id: string) => boolean;
  onToggleWatch: (id: string) => void;
  /** the draft is over: no watchlist eye or ▲▼ */
  draftComplete: boolean;
  canDraft: (p: Player) => boolean;
  onDraft: (p: Player) => void;
  onOpen: (p: Player) => void;
  /** the Watchlist: ▲▼ to move a player up or down */
  onMove?: (id: string, by: -1 | 1) => void;
  /** computers: the picked stat columns, in place of the single number */
  extras?: { note: string; labels: string[]; titles: string[]; sorted: boolean[]; onSort: (i: number) => void; values: (p: Player) => string[] };
};

const EXTRA_W = 46;
const rowColumns = (extras?: PoolListProps["extras"]) => `minmax(0, 1fr) ${extras ? 112 + extras.labels.length * (EXTRA_W + 8) : 160}px`;

export function PoolList(props: PoolListProps) {
  const { players, emptyText, columnNote, columnLabel, draftComplete, onMove, extras } = props;
  return (
    <div style={listBox}>
      {/* the column's name, right above the numbers (same layout as the rows) */}
      <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: rowColumns(extras), gap: 10, alignItems: "center", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
        <div>{columnNote || extras?.note}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {extras ? (
            extras.labels.map((l, i) => (
              <button
                key={l}
                title={`${extras.titles[i]}${extras.sorted[i] ? " (sorted)" : " (click to sort)"}`}
                onClick={() => extras.onSort(i)}
                style={{ width: EXTRA_W, padding: 0, border: "none", background: "transparent", textAlign: "center", whiteSpace: "nowrap", fontSize: 10, fontWeight: extras.sorted[i] ? 800 : 600, color: extras.sorted[i] ? "#0d9488" : "inherit", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {l}
              </button>
            ))
          ) : (
            <div style={{ width: 40, display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{columnLabel}</div>
          )}
          <div style={{ width: 32 }} />
          <div style={{ width: 64 }} />
        </div>
      </div>

      {players.length === 0 ? (
        <div style={{ padding: 14, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>{emptyText}</div>
      ) : (
        players.map((p, i) => (
          <PlayerRow key={p.id} p={p} {...props} reorder={onMove && !draftComplete ? { index: i, count: players.length, onMove } : undefined} />
        ))
      )}
    </div>
  );
}

function PlayerRow({
  p,
  numberText,
  targetById,
  watched,
  onToggleWatch,
  draftComplete,
  canDraft,
  onDraft,
  onOpen,
  reorder,
  extras,
}: PoolListProps & { p: Player; reorder?: { index: number; count: number; onMove: (id: string, by: -1 | 1) => void } }) {
  const target = targetById.get(p.id);
  const arrow: React.CSSProperties = { border: "none", background: "transparent", fontSize: 12, fontWeight: 700, padding: "0 2px", cursor: "pointer", lineHeight: "12px" };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: rowColumns(extras),
        gap: 10,
        alignItems: "center",
        padding: "10px 10px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        borderLeft: target ? "3px solid #0d9488" : "3px solid transparent",
      }}
    >
      <div onClick={() => onOpen(p)} style={{ cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {reorder ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18 }} onClick={(e) => e.stopPropagation()}>
              <button aria-label="Move up" style={{ ...arrow, opacity: reorder.index === 0 ? 0.25 : 1 }} onClick={() => reorder.onMove(p.id, -1)}>
                ▲
              </button>
              <div style={{ fontSize: 10, fontWeight: 700 }}>{reorder.index + 1}</div>
              <button aria-label="Move down" style={{ ...arrow, opacity: reorder.index === reorder.count - 1 ? 0.25 : 1 }} onClick={() => reorder.onMove(p.id, 1)}>
                ▼
              </button>
            </div>
          ) : null}
          <PlayerInfo
            player={p}
            tags={
              <>
                {" "}
                <StatusTag player={p} />
                {target ? (
                  <span style={{ marginLeft: 4, padding: "0 5px", borderRadius: 999, background: "rgba(13,148,136,0.14)", color: "#0d9488", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {targetShort(target)} target
                  </span>
                ) : null}
              </>
            }
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {extras ? (
          extras.values(p).map((v, i) => (
            <div key={i} style={{ fontSize: 12, fontWeight: extras.sorted[i] ? 700 : 500, width: EXTRA_W, textAlign: "center", color: extras.sorted[i] ? "#0f172a" : "#334155" }}>
              {v}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, fontWeight: 700, width: 40, textAlign: "center" }}>{numberText(p)}</div>
        )}
        {/* the draft watchlist is fixed once the draft is over (it moves to the Transactions watchlist) */}
        {draftComplete ? <div style={{ width: 32 }} /> : <WatchButton active={watched(p.id)} onClick={() => onToggleWatch(p.id)} />}
        <DraftButton enabled={canDraft(p)} onClick={() => onDraft(p)} />
      </div>
    </div>
  );
}
