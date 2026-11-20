"use client";
// components/playerCard/CardHeader.tsx
// The top of the player card: the status strip (Starting / Bench / Out ...), then the name,
// positions, your team's name, the Close button and the big player photo (or team jersey).
// Moved out of components/PlayerCardModal.tsx.
import React from "react";
import { StatusTag } from "@/components/StatusTag";
import type { StatusKind } from "@/lib/status/kind";
import { encodePlayerImageId, jerseySrcForTeam, PLAYER_CARD_BOTTOM_LABEL_BOTTOM, PLAYER_CARD_HEADER_MIN_HEIGHT } from "./cardData";
import { normalizeTeamCodeLocal } from "./helpers";
import type { PlayerCardPlayer } from "../PlayerCardModal";

export type CardStatusStyle = { bg: string; text: string; chipBg: string; chipFg: string; label: string };

export function CardHeader({
  p,
  statusStyle,
  statusK,
  positionLabel,
  teamLabel,
  onClose,
}: {
  p: PlayerCardPlayer;
  statusStyle: CardStatusStyle | null;
  statusK: StatusKind | null;
  /** e.g. "CE, OB, FH" or "Outside Back" */
  positionLabel: string;
  teamLabel: string;
  onClose: () => void;
}) {
  return (
    <>
          {/* Status strip (only if status exists) */}
          {statusStyle && (
  <div
    style={{
      background: statusStyle.bg,
      color: statusStyle.text,
      padding: "6px 10px",
      fontWeight: 700,
      fontSize: 12,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    <StatusTag kind={statusK} style={{ fontSize: 10, background: statusStyle.chipBg, color: statusStyle.chipFg }} />
    <span>{statusStyle.label}</span>
  </div>
)}

          {/* Header */}
          <div
  style={{
    padding: 12,
    minHeight: PLAYER_CARD_HEADER_MIN_HEIGHT,
    position: "relative",
    overflow: "visible",
    background: "linear-gradient(to right, rgb(255, 255, 255), rgb(29, 78, 216))",
    borderBottom: "0px solid rgba(255,255,255,0.14)",
    paddingRight: 160, // keeps text clear of big jersey
    zIndex: 1,
  }}
>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: 20,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div>

              <div>
                <div style={{ fontSize: 22, fontWeight: 600, lineHeight: "22px", color: "#000000" }}>
  {p.firstName}
</div>
<div style={{ fontSize: 26, fontWeight: 700, lineHeight: "30px", marginTop: 2, color: "#000000" }}>
  {p.lastName}
</div>

                {/* Position text (no chip styling) */}
<div style={{ marginTop: 0, fontSize: 12, fontWeight: 500, opacity: 0.95, color: "#000000" }}>
  {positionLabel}
</div>

                <div
  style={{
    position: "absolute",
    left: 12,
    bottom: PLAYER_CARD_BOTTOM_LABEL_BOTTOM,
    fontSize: 12,
    fontWeight: 700,
    opacity: 0.95,
    color: "#000000",
    zIndex: 2,
  }}
>
  {teamLabel}
</div>
              </div>

{/* Big jersey (front where possible), overlaps into stats strip */}
<div
  aria-hidden="true"
  style={{
    position: "absolute",
    right: -5,
    top: 5,
    width: 190,
    height: 190,
    zIndex: 1,          // jersey above header bg
    pointerEvents: "none",
  }}
>
  <img
  key={p.id}
  src={`/api/players/image-file?playerId=${encodePlayerImageId(p.id)}`}
  alt=""
  onError={(e) => {
    e.currentTarget.src = jerseySrcForTeam(
      normalizeTeamCodeLocal(p.teamCode),
      "front"
    );
  }}
  style={{
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  }}
/>
</div>

            </div>
          </div>
    </>
  );
}
