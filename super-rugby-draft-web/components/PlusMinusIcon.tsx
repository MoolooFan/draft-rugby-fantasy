// components/PlusMinusIcon.tsx
// A drawn + or − for small square buttons (Ethan, 20 Nov 2026): the text characters sit
// off-centre (each font puts them a little high or low), a drawn one is always dead centre.
import React from "react";

export function PlusMinusIcon({ kind, size = 14, strokeWidth = 2.4 }: { kind: "plus" | "minus"; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block", flex: "none" }}>
      <path d={kind === "plus" ? "M8 2.5v11M2.5 8h11" : "M2.5 8h11"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    </svg>
  );
}
