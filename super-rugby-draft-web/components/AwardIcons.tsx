// Weekly crown (top score) and weekly spoon (lowest score) icons - Ethan picked design A of
// each (Nov 2026): a classic three-point gold crown and a plain wooden spoon.
import React from "react";

export function CrownIcon({ size = 16, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flex: "0 0 auto" }}>
      <path d="M8 46 L12 18 L24 32 L32 12 L40 32 L52 18 L56 46 Z" fill="#facc15" stroke="#b45309" strokeWidth={size < 24 ? 5 : 3} strokeLinejoin="round" />
      <rect x="8" y="46" width="48" height="8" rx="2" fill="#facc15" stroke="#b45309" strokeWidth={size < 24 ? 5 : 3} />
    </svg>
  );
}

export function SpoonIcon({ size = 16, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flex: "0 0 auto" }}>
      <g transform="rotate(-40 32 32)">
        <ellipse cx="32" cy="16" rx={size < 24 ? 10 : 9} ry={size < 24 ? 13 : 12} fill="#b7793f" stroke="#6b3f17" strokeWidth={size < 24 ? 4 : 3} />
        <rect x={size < 24 ? 28 : 29} y="27" width={size < 24 ? 8 : 6} height="32" rx={size < 24 ? 4 : 3} fill="#b7793f" stroke="#6b3f17" strokeWidth={size < 24 ? 4 : 3} />
      </g>
    </svg>
  );
}
