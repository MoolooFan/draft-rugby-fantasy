// components/MovementCircle.tsx
// Up / down / no change since the round before, on the standings (League page and dashboard).
// Ethan, 20 Nov 2026: drawn chevrons on a soft tinted circle instead of text symbols, which sat
// off-centre and looked different on each phone.
import React from "react";

export type Movement = "same" | "up" | "down";

const LOOK: Record<Movement, { bg: string; fg: string; path: string }> = {
  up: { bg: "#bbf7d0", fg: "#15803d", path: "M4.5 10 L8 6.5 L11.5 10" },
  down: { bg: "#fecaca", fg: "#b91c1c", path: "M4.5 6.5 L8 10 L11.5 6.5" },
  same: { bg: "#e2e8f0", fg: "#64748b", path: "M5 8.25 H11" },
};

export function MovementCircle({ movement, moved, size = 18 }: { movement: Movement; moved?: number; size?: number }) {
  const look = LOOK[movement];
  const places = Math.abs(moved ?? 0) || 1;
  const label = movement === "up" ? `Up ${places} since last round` : movement === "down" ? `Down ${places} since last round` : "No change since last round";
  const icon = Math.round(size * 0.78);
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      style={{ width: size, height: size, borderRadius: 999, background: look.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
    >
      <svg width={icon} height={icon} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block" }}>
        <path d={look.path} fill="none" stroke={look.fg} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
