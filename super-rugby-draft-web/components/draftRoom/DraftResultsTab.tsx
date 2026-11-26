"use client";
// components/draftRoom/DraftResultsTab.tsx
// The Draft Room's Draft Results tab: every pick in order, who was taken and by whom.
import React from "react";
import type { Player } from "@/lib/draft/types";
import { listBox, PlayerInfo } from "./ui";

export type DraftPickRow = {
  pickNumber: number;
  /** null until the pick is made */
  player: Player | null;
  ownerInitials?: string;
  ownerTeamId?: string;
};

export function DraftResultsTab({ results, onOpen }: { results: DraftPickRow[]; onOpen: (p: Player) => void }) {
  return (
    <div style={{ ...listBox, marginTop: 10, maxHeight: "70vh", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ padding: "8px 17px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
        <div style={{ display: "grid", gridTemplateColumns: "54px 1fr 60px" }}>
          <div>Pick</div>
          <div />
          <div style={{ textAlign: "right" }}>Owner</div>
        </div>
      </div>

      {results.map((r, idx) => {
        const player = r.player;
        return (
          <div
            key={r.pickNumber}
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 60px",
              gap: 10,
              alignItems: "center",
              padding: "10px 10px",
              borderTop: idx === 0 ? "1px solid rgba(0,0,0,0.08)" : undefined,
              borderBottom: "1px solid rgba(0,0,0,0.08)",
              opacity: player ? 1 : 0.85,
            }}
          >
            <div style={{ padding: "0px 4px", fontSize: 12, fontWeight: 700 }}>{r.pickNumber}</div>

            {player ? (
              <button onClick={() => onOpen(player)} style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }}>
                <PlayerInfo player={player} />
              </button>
            ) : (
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.55 }}>—</div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              {r.ownerInitials ? (
                <span
                  style={{
                    minWidth: 40,
                    height: 28,
                    padding: "0 10px",
                    borderRadius: 10,
                    background: "#6366F1",
                    color: "white",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 12,
                  }}
                >
                  {r.ownerInitials}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
