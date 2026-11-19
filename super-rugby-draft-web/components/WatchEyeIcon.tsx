// components/WatchEyeIcon.tsx
// The watchlist button's icon (Ethan, 19 Nov 2026: an eye instead of a star). Filled when the
// player is on the watchlist, an outline when not.
import React from "react";

export function WatchEyeIcon({ active, size = 18 }: { active: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}>
      <path
        d="M2 12c2.6-4.6 6-7 10-7s7.4 2.4 10 7c-2.6 4.6-6 7-10 7S4.6 16.6 2 12z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={12} cy={12} r={3.4} fill={active ? "#ffffff" : "none"} stroke={active ? "none" : "currentColor"} strokeWidth={1.8} />
      {active ? <circle cx={12} cy={12} r={1.6} fill="currentColor" /> : null}
    </svg>
  );
}
