// lib/draft/lottery/draw.ts
// Drawing the draft lottery (from Ethan's mock, prototypes/draft-lottery.html): a portrait pixel
// pitch, one runner per team charging down at the viewer, each diving over the line and
// celebrating with their pick number. Browser only (canvas). The race itself is in ./sim.
import { DT, PITCH, type SimResult } from "./sim";

const { W, H, TL, TR, PL, PR } = PITCH;
const HAIR = ["#2b1d14", "#5a3a22", "#d9b36c", "#141414", "#8a4b2a"];
const SKIN = ["#f1c27d", "#c68642", "#8d5524", "#e0ac69", "#ffdbac", "#a0662f"];
// front-facing sprites: the runners charge down the screen towards the viewer
const RA = ["..hhhh..", "..ssss..", "...ss...", ".jjjjjj.", "sjjjjjbb", "s.jjjjbb", "..kkkk..", "..k..k..", "..s..o..", "..o..B..", "..B....."];
const RB = ["..hhhh..", "..ssss..", "...ss...", "sjjjjjj.", ".jjjjjbb", "..jjjjbb", "..kkkk..", "..k..k..", "..o..s..", "..B..o..", ".....B.."];
const ID = ["..hhhh..", "..ssss..", "...ss...", ".jjjjjj.", "sjjjjjbb", "s.jjjjbb", "..kkkk..", "..k..k..", "..s..s..", "..o..o..", ".BB..BB."];
const CEL = ["s......s", "s.hhhh.s", ".s.ss.s.", "..jjjj..", "..jjjj..", "..jjjj..", "..kkkk..", "..k..k..", "..s..s..", "..o..o..", ".BB..BB."];
const DIVE = ["..B..B..", "..o..o..", "..kkkk..", "..jjjj..", "s.jjjj.s", ".shhhhs.", "..ssss..", "...bb..."];
const lum = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
type Pal = Record<string, string>;
const pal = (color: string, i: number): Pal => ({ h: HAIR[i % 5], s: SKIN[(i * 7) % 6], j: color, o: color, k: lum(color) > 0.6 ? "#1b2233" : "#f4f4f4", B: "#111", b: "#b5652b" });

function posts(c: CanvasRenderingContext2D, yb: number, shadow: boolean) {
  const L = (x: number, y: number, w: number, h: number) => c.fillRect(x, y, w, h);
  if (shadow) {
    c.fillStyle = "rgba(0,0,0,.18)";
    for (const x of [PL, PR]) for (let k = 0; k <= 22; k++) L(Math.round(x + k * 0.7), Math.round(yb + k * 0.5), 1, 1);
    for (let k = 0; k <= 16; k++) L(PL + 7 + k, yb + 5, 1, 1);
  }
  c.fillStyle = "#f4f7f0";
  L(PL, yb - 30, 1, 30);
  L(PR, yb - 30, 1, 30);
  L(PL, yb - 10, PR - PL + 1, 1);
  c.fillStyle = "#c9d1c4";
  L(PL + 1, yb - 30, 1, 20);
  L(PR + 1, yb - 30, 1, 20);
  c.fillStyle = "#ff5a36";
  L(PL - 1, yb - 4, 3, 4);
  L(PR - 1, yb - 4, 3, 4);
}

/** The pitch, drawn once. */
function field(): HTMLCanvasElement {
  const fld = document.createElement("canvas");
  fld.width = W;
  fld.height = H;
  const c = fld.getContext("2d")!;
  const L = (x: number, y: number, w: number, h: number) => c.fillRect(x, y, w, h);
  for (let y = 0; y < H; y += 16) {
    c.fillStyle = (y / 16) % 2 ? "#3f8f3a" : "#46993f";
    L(0, y, W, 16);
  }
  c.fillStyle = "rgba(0,0,0,.09)";
  L(0, 0, W, TL);
  L(0, TR + 1, W, H - TR);
  const ad = ["#13294b", "#ff5a36", "#f2f2f2", "#f4d35e"];
  for (let x = 0; x < W; x += 36) {
    c.fillStyle = ad[(x / 36) % 4];
    L(x, 0, 36, 8);
  }
  c.fillStyle = "#0e2414";
  L(0, 8, W, 1);
  c.fillStyle = "#f4f7f0";
  L(10, 20, 1, 357);
  L(206, 20, 1, 357);
  L(10, 20, 197, 1);
  L(10, 376, 197, 1);
  for (const y of [TL, TR, 200, 113, 287]) L(10, y, 197, 1);
  for (const y of [169, 231, TL + 16, TR - 16]) for (let x = 12; x < 205; x += 7) L(x, y, 3, 1);
  for (const x of [24, 52, 164, 192]) for (const y of [TL + 16, 113, 169, 200, 231, 287, TR - 16]) L(x, y - 2, 1, 5);
  posts(c, TL, true);
  c.fillStyle = "rgba(0,0,0,.18)";
  for (const x of [PL, PR]) for (let k = 0; k <= 22; k++) L(Math.round(x + k * 0.7), Math.round(TR + k * 0.5), 1, 1);
  for (const x of [10, 206])
    for (const y of [TL, TR]) {
      c.fillStyle = "#f2f2f2";
      L(x, y - 5, 1, 5);
      c.fillStyle = "#ff5a36";
      L(x + 1, y - 5, 2, 2);
    }
  return fld;
}

export type DrawPhase = "idle" | "count" | "race" | "done";

/**
 * A drawer for the two canvases: `px` (the pitch, 216 x 384, scaled up crisply) and `ov` (pick
 * numbers and the countdown, at screen resolution). T = seconds since the runners went
 * (negative during the countdown).
 */
export function lotteryDrawer(px: HTMLCanvasElement, ov: HTMLCanvasElement, font: string) {
  const g = px.getContext("2d")!;
  const o = ov.getContext("2d")!;
  const fld = field();

  const spr = (rows: string[], x: number, y: number, p: Pal) => {
    const h = rows.length,
      w = rows[0].length,
      ox = Math.round(x - w / 2),
      oy = Math.round(y - h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const ch = rows[r][c];
        if (ch !== ".") {
          g.fillStyle = p[ch];
          g.fillRect(ox + c, oy + r, 1, 1);
        }
      }
  };

  return function draw(now: number, T: number, phase: DrawPhase, sim: SimResult, colours: string[]) {
    g.drawImage(fld, 0, 0);
    const { rs, rank } = sim;
    type Item = { post?: false; i: number; x: number; y: number; gy: number; rows: string[]; fin: boolean; p: Pal; d: number } | { post: true; gy: number };
    const items: Item[] = [];
    rs.forEach((r, i) => {
      let x: number, y: number, gy: number, rows: string[];
      let fin = false;
      if (T <= 0) {
        x = r.c0;
        gy = TL;
        rows = ID;
        y = gy - (phase === "idle" && Math.sin(now * 0.003 + i * 1.7) > 0.7 ? 1 : 0);
      } else if (T < r.fin && r.fr) {
        const k = Math.min((T / DT) | 0, r.fr.length / 3 - 1) * 3,
          m = r.fr[k + 2];
        gy = y = r.fr[k];
        x = r.fr[k + 1];
        rows = ((T * (m === 2 ? 16 : 9) + i * 0.37) | 0) % 2 ? RA : RB;
        if (m === 1) {
          rows = ID;
          x += Math.sin(T * 30) > 0 ? 1 : 0;
        }
      } else {
        const d = T - r.fin;
        fin = true;
        x = r.fc;
        if (d < 1) {
          gy = y = TR - 2 + Math.min(d, 0.35) * 24;
          rows = DIVE;
        } else {
          gy = TR + 15;
          rows = CEL;
          y = gy - ((Math.abs(Math.sin((d + i) * 6)) * 2) | 0);
        }
      }
      items.push({ i, x, y, gy, rows, fin, p: pal(colours[i] ?? "#cccccc", i), d: fin ? T - r.fin : 0 });
    });
    items.push({ post: true, gy: TR });
    items.sort((a, b) => a.gy - b.gy);
    for (const q of items) {
      if (q.post) {
        posts(g, TR, false);
        continue;
      }
      g.fillStyle = "rgba(0,20,0,.3)";
      const sw = q.rows === DIVE ? 10 : 7;
      g.fillRect(Math.round(q.x - sw / 2), Math.round(q.gy), sw, 1);
      if (q.fin && q.d >= 1) {
        g.fillStyle = "#b5652b";
        g.fillRect(Math.round(q.x) - 1, TR + 5, 2, 2);
      }
      spr(q.rows, q.x, q.y, q.p);
    }

    // pick numbers over each scorer, and the countdown
    const sc = ov.width / W,
      dpr = window.devicePixelRatio || 1;
    o.clearRect(0, 0, ov.width, ov.height);
    o.textAlign = "center";
    o.textBaseline = "bottom";
    o.lineJoin = "round";
    const fs = Math.round(Math.max(8 * dpr, 3 * sc));
    o.font = `${fs}px ${font}`;
    o.lineWidth = Math.max(2, fs * 0.4);
    for (const q of items) {
      if (q.post || !q.fin) continue;
      const txt = String(rank[q.i] + 1),
        ty = (q.y - q.rows.length - 1) * sc;
      o.strokeStyle = "rgba(0,0,0,.8)";
      o.strokeText(txt, q.x * sc, ty);
      o.fillStyle = rank[q.i] === 0 ? "#ffd23f" : "#fff";
      o.fillText(txt, q.x * sc, ty);
    }
    let big = "";
    if (phase === "count") big = String(Math.max(1, Math.ceil(-T)));
    else if (phase === "race" && T < 0.8) big = "GO!";
    if (big) {
      const bs = Math.round(30 * sc);
      o.font = `${bs}px ${font}`;
      o.textBaseline = "middle";
      o.lineWidth = bs * 0.25;
      o.strokeStyle = "rgba(0,0,0,.85)";
      o.strokeText(big, ov.width / 2, ov.height / 2);
      o.fillStyle = big === "GO!" ? "#ff5a36" : "#fff";
      o.fillText(big, ov.width / 2, ov.height / 2);
    }
  };
}
