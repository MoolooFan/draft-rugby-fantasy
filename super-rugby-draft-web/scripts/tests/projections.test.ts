// Run: npx tsx scripts/tests/projections.test.ts — expected points (lib/projections/project.ts).
import {
  rankMinutes, rankMultiplier, seasonPrior,
  dutyKicker, expectedRole, kickingOrder, kickingPoints, projectPoints, projectTeamScore, scoringRate80, teamStrength,
  type PastGame, type StatRates,
} from "../../lib/projections/project";
import { ALTERNATE_SCORING, STANDARD_SCORING } from "../../lib/scoring";
import type { Lineup } from "../../lib/scoring/week";
import { lineupSpread, playerSpread, projectionRange, teamOutlook, winProbability, type PlayerWeekState } from "../../lib/projections/live";

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

// --- better players start with more minutes until they have their own
check("rank minutes: rank 1 about +9, rank 100 about 0, worse ranks slightly fewer", rankMinutes(1) > 9 && Math.abs(rankMinutes(100)) < 0.5 && rankMinutes(300) < 0 && rankMinutes(null) === 0);
const topNew = projectPoints({ games: [], pos: "FH", frontRow: false, prior: {}, role: "starting", draftRank: 1 });
check("a top-ranked new 10 is expected to play 61+ minutes (2 pts for minutes)", topNew === 2, String(topNew));

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

// --- draft rank and Ethan's start-of-season notes
check("draft rank: top players start above their position's average", rankMultiplier(1) > 1.4 && rankMultiplier(100) > 0.95 && rankMultiplier(100) < 1.05 && rankMultiplier(400) < 0.95);
check("no draft rank: position average", rankMultiplier(null) === 1 && rankMultiplier(9999) === 1);
const posAvg: StatRates = { tries: 4, tackles: 8, conversions: 1 };
const top = seasonPrior(posAvg, 2);
check("starting estimate scales play stats by rank, not goal kicking", top.tries! > 5 && top.conversions === 1);
const lastYear = seasonPrior(posAvg, 100, { games: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => game(r, { tackles: 16 })), frontRow: false });
check("last season's own numbers move the starting estimate", lastYear.tackles! > 10, String(lastYear.tackles?.toFixed(1)));
check("role note 'starter' with no team lists yet: expected to start", expectedRole([], undefined, "starter").start === 1);
check("role note 'squad': not expected to play", expectedRole([], undefined, "squad").start === 0 && expectedRole([], undefined, "squad").bench === 0);
check("role note fades once real team lists come in", expectedRole(["bench", "bench", "bench"], undefined, "starter").bench > 0.9);
const moved = [{ id: "new10", games: [] as PastGame[], kickOrder: 1 }, { id: "old", games: [game(1, { conversions: 2 })] }];
check("kicker note: first-choice kicker leads the order at the start", kickingOrder(moved, 1)[0] === "new10");
const later = [{ id: "new10", games: [3, 4, 5, 6, 7].map((r) => game(r, {})), kickOrder: 1 }, { id: "old", games: [3, 4, 5, 6, 7].map((r) => game(r, { conversions: 3, penaltyGoals: 1 })) }];
check("kicker note fades once he plays and someone else does the kicking", kickingOrder(later, 8)[0] === "old");
// injured first-choice kicker keeps his place while the back-up covers (Ethan, 12 Nov 2026)
const injured = [
  { id: "first", games: [1, 2, 3, 4, 5, 6].map((r) => game(r, { conversions: 3, penaltyGoals: 2 })) },
  { id: "backup", games: [...[1, 2, 3, 4, 5, 6].map((r) => game(r, {}, "bench")), ...[7, 8, 9].map((r) => game(r, { conversions: 3, penaltyGoals: 2 }))] },
];
check("injured first-choice kicker stays first while the back-up covers", JSON.stringify(kickingOrder(injured, 10)) === '["first","backup"]', JSON.stringify(kickingOrder(injured, 10)));
check("...and the back-up kicks while he's out", dutyKicker(kickingOrder(injured, 10), (id) => id !== "first") === "backup");
// last season's minutes count early in a new season
const fullGames = [1, 2, 3, 4, 5, 6].map((r) => ({ round: r, counts: { minutesPlayed: 80 }, listed: "starting" as const }));
const withLast = projectPoints({ games: [], lastSeasonGames: fullGames, pos: "FH", frontRow: false, prior: {}, role: "starting" });
check("an 80-minute player last season starts the new season on his own minutes (2 pts for minutes)", withLast === 2, String(withLast));

// --- live: ranges, team outlook during the week, win probability
const r30 = projectionRange(30);
check("range for 30: about 15 to 44", r30.low === 15 && r30.high === 44, JSON.stringify(r30));
check("before the lists the spread is wider than once he's named", lineupSpread([{ chance: 0.6, projected: 30 }, { chance: 0.3, projected: 10 }]) > playerSpread(21));
const KO = 1_000_000_000_000;
const st = (over: Partial<PlayerWeekState>): PlayerWeekState => ({ projected: 20, actual: null, minutes: 0, kickoffMs: KO, ruledOut: false, ...over });
const flat = (fn: (id: string) => Partial<PlayerWeekState>) => (id: string) => st(fn(id));
const before = teamOutlook({ lineup, captainId: "fh", viceId: "c1", nowMs: KO - 1, state: flat((id) => ({ projected: id.startsWith("b") ? 5 : 20 })) });
check("before kickoff: expected = the projections (captain x2), nothing scored yet", before.expected === 320 && before.scored === 0, String(before.expected));
const after = teamOutlook({ lineup, captainId: "fh", viceId: "c1", nowMs: KO + 3 * 3600_000, state: flat((id) => ({ projected: id.startsWith("b") ? 5 : 20, actual: id === "o1" ? 0 : 30, minutes: id === "o1" ? 0 : 70 })) });
check("games over: real points; a starter who didn't get on is auto-subbed", after.scored === after.expected && after.finalLineup.outsideback1?.id !== "o1" && after.variance === 0, `${after.expected}`);
const half = teamOutlook({ lineup, captainId: null, viceId: null, nowMs: KO + 50 * 60_000, state: flat(() => ({ projected: 20, actual: 8, minutes: 40 })) });
check("halfway through: points so far + half the projection still to come", Math.abs(half.expected - 15 * 18) < 1, String(half.expected));
check("win probability: level = 50%, well ahead = near 100%", Math.abs(winProbability({ expected: 300, variance: 900 }, { expected: 300, variance: 900 }) - 0.5) < 1e-6 && winProbability({ expected: 400, variance: 400 }, { expected: 300, variance: 400 }) > 0.99);
check("win probability once it's all over: 100% / 0%", winProbability({ expected: 310, variance: 0 }, { expected: 300, variance: 0 }) === 1);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
