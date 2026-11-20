"use client";
// components/teamSelection/Tiles.tsx
// Team Selection's tiles: a player tile (jersey, name, the chosen view's number, captain / vice
// badge, status tag, swap highlighting) and the IR spot. Moved out of app/team-selection/page.tsx.
import React from "react";
import { StatusTag } from "@/components/StatusTag";
import { jerseySrcForTeam, type Player, type SlotDef } from "./helpers";

/** the live player (status, team lists) for the status tag */
type LivePlayer = React.ComponentProps<typeof StatusTag>["player"];

const pulseStyle: React.CSSProperties = {
  animation: "swapPulse 1.6s ease-in-out infinite",
};

function CaptainBadge({ kind }: { kind: "C" | "V" }) {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        background: "rgba(168,85,247,0.95)",
        color: "white",
        border: "1px solid rgba(255,255,255,0.9)",

        fontSize: 10,
        fontWeight: 700,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 6px 12px rgba(0,0,0,0.18)",
      }}
    >
      {kind}
    </div>
  );
}

export function PlayerTile({
  slot,
  player: p,
  isCaptain,
  isVice,
  swapping,
  isSwapSource,
  isSwapTarget,
  irDropMode,
  subtext,
  captainProj,
  livePlayer,
  onPress,
}: {
  slot: SlotDef;
  player: Player | null;
  isCaptain: boolean;
  isVice: boolean;
  /** a swap is being chosen */
  swapping: boolean;
  isSwapSource: boolean;
  /** a tile the swapping player can go to */
  isSwapTarget: boolean;
  /** choosing who to drop to bring the IR player back */
  irDropMode: boolean;
  /** the chosen view's number (projection, fixture, form...) */
  subtext: string;
  /** the captain's projection: purple, to show it has been doubled (Ethan, 20 Nov 2026) */
  captainProj: boolean;
  livePlayer: LivePlayer;
  onPress: () => void;
}) {
 const border =
  irDropMode && p
    ? "2px solid rgba(248,113,113,0.95)"
    : isSwapSource
    ? "2px solid rgba(250,204,21,0.95)"
    : isSwapTarget
    ? "2px solid rgba(250,204,21,0.85)"
    : swapping
    ? "1px solid rgba(250,204,21,0.25)"
    : "1px solid rgba(255,255,255,0.22)";

const boxShadow = isSwapSource
  ? `
      0 10px 22px rgba(0,0,0,0.16),
      0 0 0 3px rgba(250,204,21,0.85),
      0 0 18px rgba(250,204,21,0.55)
    `
  : isSwapTarget
  ? `
      0 10px 22px rgba(0,0,0,0.16),
      0 0 0 3px rgba(250,204,21,0.75),
      0 0 14px rgba(250,204,21,0.45)
    `
  : "0 10px 22px rgba(0,0,0,0.16)";

const jerseyUrl = p ? jerseySrcForTeam(p.teamCode) : "";

  return (
    <button
      onClick={onPress}
      style={{
        width: 70,
        height: 70,
        borderRadius: 14,
        border,

        // bench tiles sit on a white card (design refresh): light grey; pitch tiles stay see-through
        background: String(slot.id).startsWith("bench") ? (p ? "#eef2f6" : "#f8fafc") : p ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
        boxShadow,
opacity: swapping && !isSwapSource && !isSwapTarget ? 0.45 : 1,
...(isSwapTarget ? pulseStyle : {}),

        padding: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "visible",
        color: "white",
      }}
    >
      {/* Corner badges are relative to the TILE */}
      <div style={{ position: "absolute", top: -6, left: -2, zIndex: 3 }}>
        {isCaptain ? CaptainBadge({ kind: "C" }) : null}
        {!isCaptain && isVice ? CaptainBadge({ kind: "V" }) : null}
      </div>

      <div style={{ position: "absolute", top: -6, right: -2, zIndex: 3, lineHeight: "12px" }}>
        {p ? <StatusTag player={livePlayer} style={{ fontSize: 8, padding: "1px 3px", boxShadow: "0 1px 2px rgba(0,0,0,0.35)" }} /> : null}
      </div>

      {/* Main content */}
      {p ? (
        <>
          {/* Jersey image (clipped so it never peeks under the pill) */}
<div
  style={{
    position: "absolute",
    top: 3,
    left: "50%",
    transform: "translateX(-50%)",
    width: 65,

    // ✅ key: stop the jersey area above the pill
    height: 44, // (70 tile height - ~26px pill space)

    overflow: "hidden", // ✅ clips jersey + drop-shadow
    zIndex: 1,
    display: "grid",
    placeItems: "center",
  }}
>
  <img
    src={jerseyUrl}
    alt=""
    style={{
      width: "100%",
      height: 65,         // keep full jersey size
      objectFit: "contain",
      filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.25))",
    }}
  />
</div>

          {/* Combined pill (split horizontally) */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 999,
              overflow: "hidden",
              zIndex: 2,
              boxShadow: "0 10px 18px rgba(0,0,0,0.18)",
            }}
          >
            {/* Top half: name */}
            <div
              style={{
                background: "rgba(255,255,255,0.95)",
                color: "#0f2a4a",
                textAlign: "center",
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: "8px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.lastName}
            </div>

            {/* Bottom half: view info */}
            <div
              style={{
                background: "#133454",
                // the captain's projection is purple, to show it has been doubled (Ethan, 20 Nov 2026)
                color: captainProj ? "#c084fc" : "white",
                textAlign: "center",
                padding: "0px 0px",
                fontSize: 10,
                fontWeight: captainProj ? 700 : 500,
                lineHeight: "12px",
                borderTop: "1px solid rgba(15,23,42,0.10)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtext}
            </div>
          </div>
        </>
      ) : (
        // Empty state: ONLY position label, no jersey placeholder
        <div
  style={{
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    fontSize: 10,
    fontWeight: 700,
    opacity: 0.75,
    lineHeight: "12px", // 👈 tighter
    textAlign: "center",
  }}
>
  {slot.label.split(" ").map((w) => (
    <span key={w}>{w}</span>
  ))}
</div>

      )}
    </button>
  );
}

// The IR spot: looks like a player tile, with a red "IR" corner badge.
export function IrTile({ player: p, thisFit, swapping, livePlayer, onPress }: { player: Player | null; thisFit: boolean; swapping: boolean; livePlayer: LivePlayer; onPress: () => void }) {
  return (
    <button
      onClick={onPress}
      style={{
        width: 70,
        height: 70,
        borderRadius: 14,
        border: thisFit ? "2px solid rgba(250,204,21,0.95)" : "3px dashed rgba(239,68,68,0.95)",
        background: p ? "#eef2f6" : "#f8fafc",
        boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
        opacity: swapping ? 0.45 : 1,
        padding: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "visible",
        color: "white",
      }}
    >
      {p ? (
        <>
          <div style={{ position: "absolute", top: -6, left: -2, zIndex: 3 }}>
            <span style={{ display: "inline-block", fontSize: 8, fontWeight: 700, padding: "1px 3px", borderRadius: 4, background: "#dc2626", color: "#ffffff", boxShadow: "0 1px 2px rgba(0,0,0,0.35)", lineHeight: "10px" }}>
              IR
            </span>
          </div>
          <div style={{ position: "absolute", top: -6, right: -2, zIndex: 3, lineHeight: "12px" }}>
            <StatusTag player={livePlayer} style={{ fontSize: 8, padding: "1px 3px", boxShadow: "0 1px 2px rgba(0,0,0,0.35)" }} />
          </div>
          <div style={{ position: "absolute", top: 3, left: "50%", transform: "translateX(-50%)", width: 65, height: 44, overflow: "hidden", zIndex: 1, display: "grid", placeItems: "center" }}>
            <img src={jerseySrcForTeam(p.teamCode)} alt="" style={{ width: "100%", height: 65, objectFit: "contain", filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.25)) grayscale(0.6)" }} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, borderRadius: 999, overflow: "hidden", zIndex: 2, boxShadow: "0 10px 18px rgba(0,0,0,0.18)" }}>
            <div style={{ background: "rgba(255,255,255,0.95)", color: "#0f2a4a", textAlign: "center", padding: "3px 6px", fontSize: 10, fontWeight: 500, lineHeight: "8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.lastName}
            </div>
            <div style={{ background: "#7f1d1d", color: "white", textAlign: "center", fontSize: 10, fontWeight: 500, lineHeight: "12px", borderTop: "1px solid rgba(15,23,42,0.10)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {thisFit ? "Fit - activate" : "IR"}
            </div>
          </div>
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#dc2626", lineHeight: "12px", textAlign: "center" }}>
          <span>IR</span>
        </div>
      )}
    </button>
  );
}
