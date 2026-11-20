"use client";
// components/transactions/PlayerListBox.tsx
// The Player Pool / Watchlist list: the column's name above the numbers, then a row per player
// (or a message when there are none). Moved out of app/transactions/page.tsx.
import React from "react";
import { listBox, type Player } from "./helpers";

export function PlayerListBox({
  viewLabel,
  metricHeading,
  players,
  emptyText,
  renderRow,
}: {
  /** e.g. "Per game · 2026" */
  viewLabel: string;
  /** e.g. "Pts" */
  metricHeading: string;
  players: Player[];
  emptyText: string;
  renderRow: (p: Player) => React.ReactNode;
}) {
  return (
            <div style={listBox}>
              {/* the column's name, right above the numbers (same layout as the rows below) */}
              <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: "1fr 132px", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{viewLabel}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ width: 34, display: "flex", justifyContent: "flex-end", whiteSpace: "nowrap", fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{metricHeading}</div>
                  <div style={{ width: 28 }} />
                  <div style={{ width: 28 }} />
                </div>
              </div>

              {players.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>{emptyText}</div>
              ) : (
                players.map((p) => renderRow(p))
              )}
            </div>
  );
}
