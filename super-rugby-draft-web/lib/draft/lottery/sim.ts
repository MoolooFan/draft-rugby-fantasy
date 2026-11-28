// lib/draft/lottery/sim.ts
// The draft lottery's race (Ethan, 28 Nov 2026; from his mock, prototypes/draft-lottery.html).
// Every team gets a runner; first to ground the ball takes pick 1. Given the number of teams and
// a seed, simulate() gives the finish order and each runner's path. The server runs it once at
// the lottery time and saves the order; every phone replays the same race from the same seed.
//
// The maths here must not change: the same seed has to give the same order on the server and in
// every browser (and for lotteries already run). scripts/tests/draft-lottery.test.ts checks the
// order for a few seeds against the mock's, and that every team is equally likely to win.
//
// Pure JavaScript numbers only (no Math.sin etc. in the race), so every engine gets the same answer.

/** The pixel pitch: width, height, the two try lines (top / bottom), the lanes' edges, the posts. */
export const PITCH = { W: 216, H: 384, TL: 44, TR: 356, C0: 20, C1: 196, PL: 100, PR: 116 } as const;
/** One step of the race (seconds). */
export const DT = 1 / 60;
/** Seconds of "3, 2, 1" before the runners go. */
export const COUNTDOWN_S = 3;
const BASE = 13;
const PACK = 0.25;
const { TL, TR, C0, C1 } = PITCH;

/** Seeded random numbers, 0 to 1 (mulberry32). */
export const rng = (s: number) => () => {
  s |= 0;
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export type Runner = {
  /** distance down the pitch */
  a: number;
  /** position across it */
  c: number;
  /** starting lane */
  c0: number;
  vc: number;
  vt: number;
  cur: number;
  tgt: number;
  next: number;
  /** stumble time left */
  st: number;
  /** burst time left */
  bu: number;
  /** finish time (seconds) */
  fin: number;
  /** across position at the finish */
  fc: number;
  /** tie-break */
  tb: number;
  /** recorded path: a, c, mode (0 running, 1 stumbling, 2 burst) per step */
  fr: number[] | null;
};

export type SimResult = {
  rs: Runner[];
  /** runner (lane) numbers, first to finish first */
  order: number[];
  /** each runner's place (0 = pick 1) */
  rank: number[];
  /** when the last runner finished (seconds) */
  end: number;
};

// a = distance down the pitch, c = position across it
// Everyone has the same base pace; the race is decided by random surges, stumbles and
// a pack effect (runners ahead of the pack tire, runners behind it find extra legs),
// which fades out over the last 15% so the finish is a straight sprint.
export function simulate(n: number, seed: number, rec = false): SimResult {
  const R = rng(seed),
    gap = (C1 - C0) / n,
    LEN = TR - TL;
  type Live = Omit<Runner, "fin"> & { fin: number | null };
  const rs: Live[] = [];
  for (let i = 0; i < n; i++) {
    const c = C0 + gap * (i + 0.5);
    rs.push({ a: TL, c, c0: c, vc: 0, vt: 0, cur: 0, tgt: 0, next: 0, st: 0, bu: 0, fin: null, fc: 0, tb: R(), fr: rec ? [] : null });
  }
  let t = 0,
    left = n;
  while (left && t < 120) {
    let mean = 0;
    for (const r of rs) if (r.fin === null) mean += r.a;
    mean /= left;
    for (const r of rs) {
      if (r.fin !== null) continue;
      if (t >= r.next) {
        r.tgt = R() * 2 - 1;
        r.vt = (R() * 2 - 1) * 14;
        r.next = t + 0.3 + R() * 0.6;
      }
      if (r.st <= 0 && r.bu <= 0) {
        const q = R();
        if (q < 0.006) r.st = 0.5 + R() * 0.6;
        else if (q < 0.012) r.bu = 0.8 + R() * 0.8;
      }
      r.cur += (r.tgt - r.cur) * DT * 3;
      let v = BASE * (1 + 0.6 * r.cur);
      if (r.st > 0) v *= 0.35;
      else if (r.bu > 0) v *= 1.6;
      r.st -= DT;
      r.bu -= DT;
      const prog = (r.a - TL) / LEN,
        pk = PACK * (prog < 0.85 ? 1 : Math.max(0, 1 - (prog - 0.85) / 0.15));
      v *= Math.min(1.6, Math.max(0.45, 1 - (pk * (r.a - mean)) / 30));
      if (r.c < C0 - 4) r.vt = Math.abs(r.vt) + 4;
      if (r.c > C1 + 4) r.vt = -Math.abs(r.vt) - 4;
      r.vc += (r.vt - r.vc) * DT * 2;
      r.a += v * DT;
      r.c += r.vc * DT;
      if (rec) r.fr!.push(r.a, r.c, r.st > 0 ? 1 : r.bu > 0 ? 2 : 0);
      if (r.a >= TR) {
        r.fin = t + DT - (r.a - TR) / v;
        r.fc = r.c;
        left--;
      }
    }
    t += DT;
  }
  for (const r of rs)
    if (r.fin === null) {
      r.fin = 199 + r.tb;
      r.fc = r.c;
    }
  const done = rs as Runner[];
  const order = done.map((_, i) => i).sort((a, b) => done[a].fin - done[b].fin || done[a].tb - done[b].tb),
    rank: number[] = [];
  order.forEach((ti, p) => (rank[ti] = p));
  return { rs: done, order, rank, end: done[order[n - 1]].fin };
}

/** The draft order a lottery gives: the teams (lane by lane) in the order their runners finished. */
export function lotteryOrder(teamIds: string[], seed: number): string[] {
  return simulate(teamIds.length, seed).order.map((i) => teamIds[i]);
}

/** Shirt colours, lane by lane (Ethan, 28 Nov 2026: automatic, nothing to set up). */
export const LANE_COLOURS = [
  "#d7263d", "#1b98e0", "#f4d35e", "#7b2cbf", "#2ec4b6", "#ff8c42", "#f2f2f2", "#e84393", "#222831", "#23395d",
  "#00a86b", "#9d0208", "#3a86ff", "#ffbe0b", "#8338ec", "#fb5607", "#6a994e", "#b5838d", "#4cc9f0", "#c9184a",
] as const;
export const laneColour = (i: number) => LANE_COLOURS[i % LANE_COLOURS.length];

/** The lottery has to be done at least this long before the draft starts. */
export const LOTTERY_BEFORE_DRAFT_MS = 5 * 60_000;
/** ...and set at least this far ahead, so people can come and watch. */
export const LOTTERY_MIN_NOTICE_MS = 60_000;

/** Most teams a lottery takes (the pitch's width). */
export const MAX_LOTTERY_TEAMS = 20;
