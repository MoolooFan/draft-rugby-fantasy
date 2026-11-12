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
// of upright silver plaques, the silver heart plate with rugby posts behind a ball. From 32px up
// the posts get small flags and fatter padded bottoms below the crossbar.
const SHIELD_OUTLINE = "M32 3 C49 3 60 13 60 27 C60 41 48 53 32 61 C16 53 4 41 4 27 C4 13 15 3 32 3 Z";
const SHIELD_PLATE = "M18 14 C24 11 40 11 46 14 C49 20 49 28 46 34 C43 41 38 45 32 51 C26 45 21 41 18 34 C15 28 15 20 18 14 Z";
/** Plaque positions round the rim. */
const SHIELD_PLAQUES: Array<[number, number]> = [
  [39.64, 7.37], [51.7, 15.64], [54.2, 29.56], [48.65, 42.25], [38.57, 53.25],
  [25.33, 53.19], [15.29, 42.17], [9.8, 29.47], [12.35, 15.58], [24.45, 7.35],
];

export function ShieldIcon({ size = 16, title }: { size?: number; title?: string }) {
  const large = size >= 32;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flex: "0 0 auto" }}>
      <path d={SHIELD_OUTLINE} fill="#6a4426" stroke="#452912" strokeWidth={2.4} />
      {SHIELD_PLAQUES.map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.5} ry={3.3} fill="#e4e7eb" />
      ))}
      <path d={SHIELD_PLATE} fill="#e4e7eb" stroke="#7f8892" strokeWidth={1.6} />
      <path d="M26.5 17 V41 M37.5 17 V41 M26.5 32 H37.5" stroke="#7f8892" strokeWidth={2} strokeLinecap="round" fill="none" />
      {large ? (
        <>
          <path d="M26.5 15 V17 M37.5 15 V17" stroke="#7f8892" strokeWidth={2} strokeLinecap="round" />
          <path d="M26.5 14.6 C25 13.8 23.6 15.6 22 14.8 C23 16 24.6 17 26.5 16.6 Z M37.5 14.6 C36 13.8 34.6 15.6 33 14.8 C34 16 35.6 17 37.5 16.6 Z" fill="#7f8892" />
          <rect x={24.6} y={33.5} width={3.8} height={8.5} rx={1.3} fill="#7f8892" />
          <rect x={35.6} y={33.5} width={3.8} height={8.5} rx={1.3} fill="#7f8892" />
        </>
      ) : null}
      <g transform="rotate(35 32 29)">
        <ellipse cx={32} cy={29} rx={7} ry={10.75} fill="#9aa2ab" stroke="#6b737c" strokeWidth={1} />
        <path d="M32 19.8 V38.2" stroke="#eef0f2" strokeWidth={0.9} />
      </g>
    </svg>
  );
}
