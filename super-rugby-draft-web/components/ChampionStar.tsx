// A gold championship star (plan item E8): Ethan picked style A (Nov 2026), with sharper points,
// a lighter edge and a bevelled, metallic gold look - each point has a lit side and a shaded side.
import React from "react";

const LIGHT = { x: -0.6, y: -0.8 }; // light from the top left
const SHADES = ["#9c6b14", "#c48a22", "#e2ad3c", "#f5cf63", "#fde58f"]; // darkest .. brightest gold
const EDGE = "#d9a84a"; // lighter edge than before

type Pt = { x: number; y: number };

/** The star's facets around (0,0): 10 triangles from the centre, each with its gold shade. */
export function starFacets(r: number, inner = 0.38): Array<{ pts: Pt[]; fill: string }> {
  const outer: Pt[] = [];
  const innerPts: Pt[] = [];
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const b = a + Math.PI / 5;
    outer.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    innerPts.push({ x: Math.cos(b) * r * inner, y: Math.sin(b) * r * inner });
  }
  const facets: Array<{ pts: Pt[]; fill: string }> = [];
  for (let i = 0; i < 5; i++) {
    const p = outer[i];
    const before = innerPts[(i + 4) % 5];
    const after = innerPts[i];
    for (const q of [before, after]) {
      // facet facing direction ~ middle of the triangle; brighter the more it faces the light
      const mx = (p.x + q.x) / 3;
      const my = (p.y + q.y) / 3;
      const len = Math.hypot(mx, my) || 1;
      const lit = (mx / len) * LIGHT.x + (my / len) * LIGHT.y; // -1 .. 1
      const k = Math.max(0, Math.min(SHADES.length - 1, Math.round(((lit + 1) / 2) * (SHADES.length - 1))));
      facets.push({ pts: [{ x: 0, y: 0 }, p, q], fill: SHADES[k] });
    }
  }
  return facets;
}

const d = (pts: Pt[]) => `M${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join("L")}Z`;

/** The star drawn at (0,0) with outer radius r, for use inside an <svg>. */
export function StarShape({ r }: { r: number }) {
  const facets = starFacets(r);
  const outline: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.38;
    outline.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
  }
  return (
    <g>
      <path d={d(outline)} fill={SHADES[2]} stroke={EDGE} strokeWidth={Math.max(0.6, r * 0.12)} strokeLinejoin="miter" />
      {facets.map((f, i) => (
        <path key={i} d={d(f.pts)} fill={f.fill} />
      ))}
    </g>
  );
}

/**
 * Stars spread along the top edge of a circle of radius R centred at (0,0): one at the very top,
 * more spreading out either side.
 */
export function starPositions(n: number, R: number, stepDeg = 26): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const deg = -90 + (i - (n - 1) / 2) * stepDeg;
    const a = (deg * Math.PI) / 180;
    out.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
  }
  return out;
}
