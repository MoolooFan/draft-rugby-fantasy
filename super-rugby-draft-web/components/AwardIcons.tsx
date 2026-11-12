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
// of upright silver plaques, the silver heart plate and medallion. From 32px up the plate shows its
// finer detail (top plaque, scrollwork, beaded medallion with players, fluted base).
const SHIELD_OUTLINE = "M32 3 C49 3 60 13 60 27 C60 41 48 53 32 61 C16 53 4 41 4 27 C4 13 15 3 32 3 Z";
const SHIELD_PLATE = "M18 14 C24 11 40 11 46 14 C49 20 49 28 46 34 C43 41 38 45 32 51 C26 45 21 41 18 34 C15 28 15 20 18 14 Z";
/** Plaque positions round the rim. */
const SHIELD_PLAQUES: Array<[number, number]> = [
  [39.64, 7.37], [52.35, 15.17], [56.25, 29.56], [50.1, 43.31], [38.57, 53.25],
  [25.33, 53.19], [13.84, 43.23], [7.74, 29.47], [11.7, 15.1], [24.45, 7.35],
];
const MEDALLION_BEADS = Array.from({ length: 14 }, (_, i) => {
  const t = (i / 14) * Math.PI * 2;
  return [32 + 6.3 * Math.cos(t), 27 + 7.4 * Math.sin(t)] as const;
});

export function ShieldIcon({ size = 16, title }: { size?: number; title?: string }) {
  const detail = size >= 32;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} style={{ display: "block", flex: "0 0 auto" }}>
      <path d={SHIELD_OUTLINE} fill="#6a4426" stroke="#452912" strokeWidth={2.4} />
      {SHIELD_PLAQUES.map(([x, y]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={2.5} ry={3.3} fill="#e4e7eb" />
      ))}
      <path d={SHIELD_PLATE} fill="#e4e7eb" stroke="#7f8892" strokeWidth={1.6} />
      <ellipse cx={32} cy={27} rx={5.5} ry={6.5} fill="#b8bfc7" />
      {detail ? (
        <>
          <path d="M29.6 11.2 H34.4 V14.2 C34.4 15.4 33 16.2 32 16.6 C31 16.2 29.6 15.4 29.6 14.2 Z" fill="#f7f8fa" stroke="#7f8892" strokeWidth={0.5} />
          <path d="M20 17 C21 24 23 30 27 35 M44 17 C43 24 41 30 37 35" stroke="#9aa2ab" strokeWidth={0.8} fill="none" />
          <path d="M19.5 17.5 c-1.6 1 -1.6 3 0 3.4 M44.5 17.5 c1.6 1 1.6 3 0 3.4" stroke="#9aa2ab" strokeWidth={0.7} fill="none" />
          {MEDALLION_BEADS.map(([x, y]) => (
            <circle key={`${x.toFixed(2)}-${y.toFixed(2)}`} cx={x} cy={y} r={0.55} fill="#9aa2ab" />
          ))}
          <ellipse cx={32} cy={27} rx={4.3} ry={5.3} fill="#eef0f2" stroke="#9aa2ab" strokeWidth={0.5} />
          <path d="M29.6 30 L30.6 26.4 L31.8 27.6 M33.4 30.2 L33.8 26.6 M30.4 25.2 a0.75 0.75 0 1 0 0.1 0 M33.6 25.3 a0.75 0.75 0 1 0 0.1 0 M28.8 31 H35.2" stroke="#7f8892" strokeWidth={0.55} fill="none" />
          <path d="M32 36 L27.5 45 M32 36 L29.7 47.5 M32 36 L32 49.5 M32 36 L34.3 47.5 M32 36 L36.5 45" stroke="#9aa2ab" strokeWidth={0.7} />
          <circle cx={32} cy={36} r={1.4} fill="#f7f8fa" stroke="#7f8892" strokeWidth={0.45} />
        </>
      ) : null}
    </svg>
  );
}
