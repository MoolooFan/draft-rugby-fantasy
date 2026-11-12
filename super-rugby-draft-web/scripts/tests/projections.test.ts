// Run: npx tsx scripts/tests/projections.test.ts — expected points (lib/projections/project.ts).
import {
  dutyKicker, expectedRole, kickingOrder, kickingPoints, projectPoints, projectTeamScore, scoringRate80, teamStrength,
  type PastGame, type StatRates,
} from "../../lib/projections/project";
import { ALTERNATE_SCORING, STANDARD_SCORING } from "../../lib/scoring";
import type { Lineup } from "../../lib/scoring/week";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const game = (round: number, c: Record<string, number>, listed: "starting" | "bench" | null = "starting"): PastGame => ({ round, counts: { minutesPlayed: 80, ...c }, listed });
const prior: StatRates = { tackles: 8, tries: 3, metresGained: 3, lineoutsWon: 1 };
const base = { pos: "OB", frontRow: false, prior };
const steady = [1, 2, 3, 4].map((r) => game(r, { tackles: 6, metresGained: 60 }));

// --- ruled out
check("injured / out / not named = 0", projectPoints({ ...base, games: steady, role: "out" }) === 0);
check("named to start > named on the bench", projectPoints({ ...base, games: steady, role: "starting" }) > projectPoints({ ...base, games: steady, role: "bench" }));

// --- streaky stats lean on the starting estimate longer than steady ones
const oneTry = [game(1, { tries: 2 })];
const lineouts = [game(1, { lineoutsWon: 12 })];
const tryRate = scoringRate80(oneTry, false, prior) - scoringRate80([game(1, {})], false, prior);
const lineoutRate = scoringRate80(lineouts, false, prior) - scoringRate80([game(1, {})], false, prior);
check("two tries in one game: rate rises much less than the 30 pts they scored", tryRate > 0 && tryRate < 6, tryRate.toFixed(1));
check("12 lineouts in one game: a bigger share is trusted (steady stat)", lineoutRate / 12 > (tryRate / 30) * 1.5, `${((lineoutRate / 12) * 100).toFixed(0)}% vs ${((tryRate / 30) * 100).toFixed(0)}%`);

// --- opponent: outside backs gain against weak teams, locks don't
const weak = 10;
const ob = projectPoints({ ...base, games: steady, role: "starting", opponentWeakness: weak }) - projectPoints({ ...base, games: steady, role: "starting", opponentWeakness: 0 });
const lk = projectPoints({ ...base, pos: "LK", games: steady, role: "starting", opponentWeakness: weak }) - projectPoints({ ...base, pos: "LK", games: steady, role: "starting", opponentWeakness: 0 });
check("weak opponent: outside back up, lock unchanged", ob > 0 && lk === 0, `OB +${ob.toFixed(1)}, LK +${lk.toFixed(1)}`);

// --- position minutes: a prop with no history starts ~53 minutes (1 pt for minutes, not 2)
const propNew = projectPoints({ games: [], pos: "PR", frontRow: true, prior: {}, role: "starting" });
check("new prop: under 61 minutes, so 1 minutes point", propNew === 1, String(propNew));

// --- goal kicking
const team = [
  { id: "ten", games: [1, 2, 3].map((r) => game(r, { conversions: 3, conversionsMissed: 1, penaltyGoals: 2 })) },
  { id: "twelve", games: [game(1, { conversions: 1 }), game(2, {})] },
  { id: "lock", games: [game(1, {})] },
];
const order = kickingOrder(team, 4);
check("kicking order: main kicker first, back-up second, non-kickers left out", JSON.stringify(order) === '["ten","twelve"]', JSON.stringify(order));
check("duty kicker: first in the order who's playing", dutyKicker(order, () => true) === "ten");
check("duty kicker: back-up takes over when the main kicker is out", dutyKicker(order, (id) => id !== "ten") === "twelve");
const avgTeam = teamStrength([]);
const leaky = { ...avgTeam, pointsAgainst: 45 };
const kickAvg = kickingPoints(team[0].games, avgTeam, avgTeam);
const kickBlowout = kickingPoints(team[0].games, avgTeam, leaky);
check("kicking points: more against a team that leaks points (blowout)", kickBlowout > kickAvg && kickAvg > 5, `${kickAvg.toFixed(1)} -> ${kickBlowout.toFixed(1)}`);
check("kicking points use the league's scoring", kickingPoints(team[0].games, avgTeam, avgTeam, ALTERNATE_SCORING) < kickingPoints(team[0].games, avgTeam, avgTeam, STANDARD_SCORING));
const withKick = projectPoints({ ...base, games: steady, role: "starting", kicking: kickAvg });
const noKick = projectPoints({ ...base, games: steady, role: "starting" });
check("the kicker gets his kicking points", withKick > noKick + 4);
check("no kicking points off the bench", projectPoints({ ...base, games: steady, role: "bench", kicking: kickAvg }) === projectPoints({ ...base, games: steady, role: "bench" }));

// --- expected lineup: injured weeks don't count against him
const r = expectedRole(["starting", "starting", "out", "out"]);
check("expected lineup ignores injured weeks", r.start === 1 && r.bench === 0);
check("expected lineup: recent lists count most", expectedRole(["bench", "bench", "bench", "starting"]).start > 0.4);

// --- team totals and auto-subs
const P = (id: string, pos: string, pos2?: string) => ({ id, posAbbrev: pos, secondaryPosAbbrev: pos2 ?? null });
const lineup: Lineup = {
  prop1: P("p1", "PR"), hooker1: P("h1", "HO"), prop2: P("p2", "PR"), lock1: P("l1", "LK"), lock2: P("l2", "LK"),
  looseforward1: P("f1", "LF"), looseforward2: P("f2", "LF"), looseforward3: P("f3", "LF"), halfback1: P("hb", "HB"), flyhalf1: P("fh", "FH"),
  centre1: P("c1", "CE"), centre2: P("c2", "CE"), outsideback1: P("o1", "OB"), outsideback2: P("o2", "OB"), outsideback3: P("o3", "OB"),
  bench1: P("bf", "LF"), bench2: P("bb", "OB"), bench3: P("bp", "PR"), bench4: P("bh", "HB"), bench5: P("bl", "LK"),
};
const proj = (id: string) => (id.startsWith("b") ? 5 : 20);
const none = projectTeamScore({ lineup, captainId: "fh", viceId: "c1", projection: proj, ruledOut: () => false });
check("no one ruled out: 15 starters, captain x2, bench not counted", none.total === 15 * 20 + 20, String(none.total));
const o1Out = projectTeamScore({ lineup, captainId: "fh", viceId: "c1", projection: proj, ruledOut: (id) => id === "o1" });
check("starter ruled out: bench outside back auto-subs in", o1Out.total === 14 * 20 + 20 + 5, String(o1Out.total));
const capOut = projectTeamScore({ lineup, captainId: "fh", viceId: "c1", projection: proj, ruledOut: (id) => id === "fh" });
check("captain ruled out: vice gets the x2 (and the bench halfback covers 10 if he can)", capOut.captainUsedId === "c1", String(capOut.total));

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
