"use client";

import React from "react";

type Row = { label: string; left?: string; right?: string };

const JERSEYS: Record<string, { front?: string; angle?: string; single?: string }> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.png", front: "/images/jerseys/BLUJerseyFront.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.png", front: "/images/jerseys/CHIJerseyFront.png" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.png", front: "/images/jerseys/CRUJerseyFront.png" },
  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.png", front: "/images/jerseys/HIGJerseyFront.png" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.png", front: "/images/jerseys/HURJerseyFront.png" },
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },

  // backwards compatibility
  MOP: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },

  RED: { single: "/images/jerseys/REDJersey.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};

const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.png";

function normalizeTeamCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const upper = s.toUpperCase();
  if (upper === "MOP") return "MOA";
  if (upper === "MOA") return "MOA";

  if (JERSEYS[upper]) return upper;

  // last resort: first 3 letters
  const guess = upper.slice(0, 3);
  return JERSEYS[guess] ? guess : null;
}

function jerseySrcForTeam(code: string | null, prefer: "front" | "angle" = "front") {
  if (!code) return JERSEY_PLACEHOLDER;
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "front") return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
  return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
}

export function PointsBreakdownModal(props: {
  open: boolean;
  onClose: () => void;

  playerId?: string;
  playerName: string;
  jerseySrc?: string;
  teamCode?: string | null;

  weekLabel: string;
  fixtureLabel: string;

  totalPoints: number;
  rows?: Row[];
}) {
  const {
  open,
  onClose,
  playerId,
  playerName,
  jerseySrc,
  teamCode = null,
  weekLabel,
  fixtureLabel,
  totalPoints,
  rows = [],
} = props;
  const resolvedJerseySrc = teamCode
  ? jerseySrcForTeam(normalizeTeamCode(teamCode), "front")
  : (jerseySrc ?? JERSEY_PLACEHOLDER);

const resolvedPlayerImageSrc = playerId
  ? `/api/players/image-file?playerId=${encodeURIComponent(playerId)}`
  : resolvedJerseySrc;


  const filteredRows = (rows ?? []).filter((r) => {
    const v = (r.right ?? "").toString().trim();
    if (!v || v === "—" || v === "-") return false;

    const n = Number(v);
    // if it's a number and equals 0, hide it
    if (Number.isFinite(n) && n === 0) return false;

    return true;
  });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20000,
        background: "rgba(2,6,23,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 14,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 18,
          overflow: "hidden",
          background: "white",
          boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
        }}
      >
        {/* Top blue header */}
        <div
  style={{
    position: "relative",
    padding: "14px 14px 12px 14px",
    background: "linear-gradient(135deg, rgb(30, 64, 175), rgb(5,150,105), rgb(255, 255, 255))",
    color: "white",
    minHeight: 116,
    overflow: "visible",
  }}
>
          <button
  type="button"
  onClick={(e) => {
    e.stopPropagation();
    onClose();
  }}
  aria-label="Close"
  style={{
    position: "absolute",
    right: 10,
    top: 10,
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "none",
    background: "rgba(255,255,255,0.18)",
    color: "white",
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
    lineHeight: "32px",
    zIndex: 20,
  }}
>
  ×
</button>

          <div style={{ position: "relative", zIndex: 2 }}>

            <div>
              <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>
                {playerName}
              </div>
              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 900, opacity: 0.95 }}>
                {weekLabel}
              </div>
              <div style={{ marginTop: 2, fontSize: 14, fontWeight: 900, opacity: 0.95 }}>
                {fixtureLabel}
              </div>
            </div>

            <img
  src={resolvedPlayerImageSrc}
  alt=""
  draggable={false}
  onError={(e) => {
    e.currentTarget.src = resolvedJerseySrc;
  }}
  style={{
    position: "absolute",
    right: -10,
    bottom: -66,
    width: 150,
    height: 150,
    objectFit: "contain",
    background: "transparent",
    padding: 0,
    borderRadius: 0,
    zIndex: 1,
    pointerEvents: "none",
  }}
/>

          </div>
        </div>

        {/* Total points row */}
        <div
  style={{
    padding: 12,
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    position: "relative",
    zIndex: 5,        // 👈 ensures this white area sits ON TOP of the jersey overlap
    background: "white",
  }}
>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div
              style={{
                minWidth: 64,
                height: 34,
                padding: "0 12px",
                borderRadius: 10,
                background: "rgb(5,150,105)",
                color: "white",
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                fontWeight: 950,
              }}
            >
              {totalPoints}
            </div>
          </div>
        </div>

{/* Breakdown list */}
<div
  style={{
    padding: "2px 0",
    maxHeight: "45vh", // cap the list height
    overflowY: "auto", // scroll if long
    WebkitOverflowScrolling: "touch",
  }}
>
  {filteredRows.length ? (
    filteredRows.map((r, idx) => (
      <div
        key={idx}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          padding: "9px 14px",
          borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          color: "#0f172a",
        }}
      >
        <div style={{ opacity: 0.75, fontWeight: 900 }}>{r.label}</div>
        <div style={{ fontWeight: 950 }}>{r.right ?? "—"}</div>
      </div>
    ))
  ) : (
    <div style={{ padding: "12px 14px", fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
      No scoring stats.
    </div>
  )}
</div>

      </div>
    </div>
  );
}
