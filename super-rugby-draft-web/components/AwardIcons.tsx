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

// The Shield holder (Ethan's pick, Nov 2026): drawn from the Ranfurly Shield - oak timber, a ring
// of silver plaques, the silver heart plate and medallion. The same drawing at every size.
const SHIELD_OUTLINE = "M32 3 C49 3 60 13 60 27 C60 41 48 53 32 61 C16 53 4 41 4 27 C4 13 15 3 32 3 Z";
const SHIELD_PLATE = "M18 14 C24 11 40 11 46 14 C49 20 49 28 46 34 C43 41 38 45 32 51 C26 45 21 41 18 34 C15 28 15 20 18 14 Z";
/** Plaque positions round the rim: x, y, angle (pointing outwards). */
const SHIELD_PLAQUES: Array<[number, number, number]> = [
  [39.64, 7.37, 18.7], [52.35, 15.17, 53.9], [56.25, 29.56, 89.0], [50.1, 43.31, 126.3], [38.57, 53.25, 164.2],
  [25.33, 53.19, 196.0], [13.84, 43.23, 233.9], [7.74, 29.47, -88.8], [11.7, 15.1, -53.7], [24.45, 7.35, -18.4],
];

export function ShieldIcon({ size = 16, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flex: "0 0 auto" }}>
      <path d={SHIELD_OUTLINE} fill="#6a4426" stroke="#452912" strokeWidth={2.4} />
      {SHIELD_PLAQUES.map(([x, y, a]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.5} ry={3.3} transform={`rotate(${a} ${x} ${y})`} fill="#e4e7eb" />
      ))}
      <path d={SHIELD_PLATE} fill="#e4e7eb" stroke="#7f8892" strokeWidth={1.6} />
      <ellipse cx={32} cy={27} rx={5.5} ry={6.5} fill="#b8bfc7" />
    </svg>
  );
}
