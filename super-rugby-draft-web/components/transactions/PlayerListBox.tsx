"use client";
// components/transactions/PlayerListBox.tsx
// The Player Pool / Watchlist list: the column's name above the numbers, then a row per player
// (or a message when there are none). Moved out of app/transactions/page.tsx. On a computer the
// Player Pool shows up to 5 picked columns (`columns`; lib/players/poolColumns.ts).
import React from "react";
import { listBox, type Player } from "./helpers";

export function PlayerListBox({
  viewLabel,
  metricHeading,
  players,
  emptyText,
  renderRow,
  columns,
}: {
  /** e.g. "Per game · 2026" */
  viewLabel: string;
  /** e.g. "Pts" */
  metricHeading: string;
  players: Player[];
  emptyText: string;
  renderRow: (p: Player) => React.ReactNode;
  /** computers: the picked columns' headings (click one to sort by it) */
  columns?: { labels: string[]; titles: string[]; sorted: boolean[]; onSort: (i: number) => void };
}) {
  return (
            <div style={listBox}>
              {/* the column's name, right above the numbers (same layout as the rows below) */}
              <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: `minmax(0, 1fr) ${txRightWidth(columns?.labels.length)}px`, gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{viewLabel}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  {columns ? (
                    columns.labels.map((l, i) => (
                      <button
                        key={l}
                        title={`${columns.titles[i]}${columns.sorted[i] ? " (sorted)" : " (click to sort)"}`}
                        onClick={() => columns.onSort(i)}
                        style={{ width: TX_COL_W, padding: 0, border: "none", background: "transparent", textAlign: "center", whiteSpace: "nowrap", fontSize: 10, fontWeight: columns.sorted[i] ? 800 : 600, color: columns.sorted[i] ? "#0d9488" : "inherit", opacity: columns.sorted[i] ? 1 : 0.7, cursor: "pointer" }}
                      >
                        {l}
                      </button>
                    ))
                  ) : (
                    <div style={{ width: 40, display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{metricHeading}</div>
                  )}
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

/** Width of each picked column, and of the row's right-hand side (numbers + star + button). */
export const TX_COL_W = 46;
export const txRightWidth = (n?: number) => (n ? 92 + n * (TX_COL_W + 8) : 140);
