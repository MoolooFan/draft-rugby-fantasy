// lib/demo.ts
// Demo site (Ethan, 18 Nov 2026): a copy of the test site that shows a league part-way through a
// season. It's switched on only for the `demo-2026` branch on Vercel (or SR_DEMO=1 on a
// computer), so the normal test site and the real site never change.
//
// In demo mode:
//   - the current season is 2026
//   - the clock is frozen at Wednesday 8 April 2026, 7pm NZ time (round 8 scored, round 9 team
//     lists out, waivers and lineups still open). Each page load / server start begins at that
//     moment and only the seconds since then pass, so rounds never move on.
//   - player stats stop after real round 8 (nothing from "the future" shows)
//   - the Shield counts from 2026
// The demo league itself is copied in by scripts/demo-league.ts (and removed with --remove).
// Isomorphic: no imports, so lib/season can use it.

export const DEMO_BRANCH = "demo-2026";

export const DEMO_SETTINGS = {
  season: 2026,
  /** the frozen moment */
  now: "2026-04-08T07:00:00.000Z",
  /** the last real round with stats */
  lastRealRound: 8,
  label: "Demo · 2026 season after round 8 · time is frozen",
} as const;

declare global {
  interface Window {
    __SR_DEMO__?: boolean;
  }
}

/** Is this the demo site? (Browser: set by the script in app/layout.tsx; server: the branch.) */
export function demoActive(): boolean {
  if (typeof window !== "undefined") return window.__SR_DEMO__ === true;
  return process.env.VERCEL_GIT_COMMIT_REF === DEMO_BRANCH || process.env.SR_DEMO === "1";
}

export function demo(): typeof DEMO_SETTINGS | null {
  return demoActive() ? DEMO_SETTINGS : null;
}

/**
 * Make `Date.now()` and `new Date()` start at the frozen moment (dates passed in explicitly are
 * unchanged). Runs once on the server (instrumentation.ts) and in the browser (the same code
 * as an inline script in app/layout.tsx, before anything else).
 */
export function demoClockSource(baseIso: string): string {
  return `(function(){if(Date.__srDemo)return;var R=Date,b=R.parse(${JSON.stringify(baseIso)}),s=R.now();
function n(){return b+(R.now()-s)}
function D(){var a=[].slice.call(arguments);if(!(this instanceof D))return new R(n()).toString();return a.length?new (Function.prototype.bind.apply(R,[null].concat(a)))():new R(n())}
D.prototype=R.prototype;D.now=n;D.parse=R.parse;D.UTC=R.UTC;D.__srDemo=true;
try{Object.setPrototypeOf(D,R)}catch(e){}
globalThis.Date=D;})();`;
}

/** Install the frozen clock in this process (server; the same as demoClockSource). */
export function installDemoClock(): void {
  const d = demo();
  const G = globalThis as unknown as { Date: DateConstructor & { __srDemo?: boolean } };
  if (!d || G.Date.__srDemo) return;
  const Real = G.Date;
  const base = Real.parse(d.now);
  const start = Real.now();
  const now = () => base + (Real.now() - start);
  function DemoDate(this: unknown, ...args: unknown[]): unknown {
    if (!(this instanceof DemoDate)) return new Real(now()).toString();
    return args.length ? new (Real as unknown as new (...a: unknown[]) => Date)(...args) : new Real(now());
  }
  DemoDate.prototype = Real.prototype;
  Object.setPrototypeOf(DemoDate, Real);
  Object.assign(DemoDate, { now, parse: Real.parse, UTC: Real.UTC, __srDemo: true });
  G.Date = DemoDate as unknown as DateConstructor & { __srDemo?: boolean };
}
