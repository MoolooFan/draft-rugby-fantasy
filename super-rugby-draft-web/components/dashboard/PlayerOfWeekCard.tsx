"use client";
// components/dashboard/PlayerOfWeekCard.tsx
// The Dashboard's Player of the Week (the round's top scorer, or joint top scorers) and the Team
// of the Week button. Moved out of app/dashboard/page.tsx.
import React from "react";
import { useRouter } from "next/navigation";
import { JerseyTile } from "./JerseyTile";
import { cardStyle, fullTeamNameFromCode, primaryButton, singularPosLabel, type Player } from "./helpers";

export function PlayerOfWeekCard({ playersOfWeek, onOpenPlayer }: { playersOfWeek: Player[]; onOpenPlayer: (p: Player) => void }) {
  const router = useRouter();
  return (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Player of the Week</div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              minHeight: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#0f172a",
            }}
          >
            {playersOfWeek.length ? (
  <div style={{ display: "grid", gap: 8, width: "100%" }}>
    {playersOfWeek.map((p) => (
      <button
        key={p.id}
        onClick={() => onOpenPlayer(p)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <JerseyTile size={44} teamCode={p.teamCode} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>
                {p.firstName} {p.lastName}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {fullTeamNameFromCode(p.teamCode)} — {p.positions ?? singularPosLabel(p.posName)}
              </div>
            </div>
          </div>

          <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
            {(p.points ?? 0)} pts
          </div>
        </div>
      </button>
    ))}
  </div>
) : (
  <div style={{ opacity: 0.35, fontWeight: 600, fontSize: 12 }}>
    No scores yet this week
  </div>
)}
          </div>

          <button
            style={{ ...primaryButton, marginTop: 10, height: 34, fontSize: 12 }}
            onClick={() => router.push("/team-of-the-week")}
          >
            Team of the Week
          </button>
        </div>
  );
}
