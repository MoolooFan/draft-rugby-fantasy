// Run: npx tsx scripts/tests/lineup-warnings.test.ts — lineup warnings (lib/league/lineupWarnings.ts).
import { lineupWarnings, warningSummary } from "../../lib/league/lineupWarnings";
import type { PlayerProjection } from "../../lib/projections/server";
import { startersOf } from "../../lib/scoring/week";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const slots = startersOf(null);
const lineup: Record<string, { id: string } | null> = Object.fromEntries(slots.map((s, i) => [s, { id: `p${i}` }]));
lineup[slots[14]] = null; // an empty spot
lineup.bench1 = { id: "benchOut" };
const proj = (over: Partial<PlayerProjection>): PlayerProjection => ({ pts: 20, low: 15, high: 25, spread: 5, role: "expected", kicker: false, kickoffMs: 1, ...over });
const table: Record<string, PlayerProjection> = {
  p0: proj({ role: "out", pts: 0, kickoffMs: null, outReason: "bye" }),
  p1: proj({ role: "out", pts: 0, outReason: "injured" }),
  p2: proj({ role: "out", pts: 0, outReason: "notNamed" }),
  p3: proj({ role: "bench" }),
  p4: proj({ questionable: true }),
  p5: proj({ role: "starting" }),
  benchOut: proj({ role: "out", pts: 0, outReason: "injured" }),
};
const w = lineupWarnings(lineup, (id) => table[id] ?? null, null);
const reasons = Object.fromEntries(w.warnings.map((x) => [x.playerId, x.reason]));
check("bye, injured and not named starters are flagged as out", reasons.p0 === "bye" && reasons.p1 === "injured" && reasons.p2 === "notNamed");
check("named on the bench / questionable are doubtful", reasons.p3 === "bench" && reasons.p4 === "questionable" && w.warnings.filter((x) => x.level === "doubt").length === 2);
check("fine starters and bench players aren't flagged", !reasons.p5 && !reasons.benchOut);
check("empty starting spots are counted", w.emptySpots === 1);
check("summary line", warningSummary(w) === "3 starters aren't playing, 1 starting spot is empty and 2 are doubtful", String(warningSummary(w)));
check("nothing to say: no summary", warningSummary({ warnings: [], emptySpots: 0 }) === null);
check("one player", warningSummary({ warnings: [{ playerId: "x", reason: "bye", level: "out" }], emptySpots: 0 }) === "1 starter isn't playing");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
