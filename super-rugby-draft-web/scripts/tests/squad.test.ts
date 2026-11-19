// Run: npx tsx scripts/tests/squad.test.ts — custom squads (lib/league/squad.ts): slots, flex
// positions, roster rules, auto-subs and lineup fixes with a league's own squad.
import {
  cleanSquadFormat,
  isStandardSquad,
  pitchRows,
  rosterSize,
  slotAccepts,
  slotKind,
  squadFits,
  squadSlots,
  squadStartingGaps,
  STANDARD_SQUAD,
  type SquadFormat,
} from "../../lib/league/squad";
import { applyAutoSubs, BENCH_SLOTS, STARTER_SLOTS, scoreTeamWeek, type Lineup } from "../../lib/scoring/week";
import { updateLineup } from "../../lib/league/lineup";
import { positionRulesError, rosterProblem, type RosterPlayer } from "../../lib/league/rosterChange";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// --- Standard keeps the slot ids lineups have always used
const std = squadSlots(STANDARD_SQUAD);
check("Standard: same starting slots, same order", JSON.stringify(std.starters.map((s) => s.id)) === JSON.stringify(STARTER_SLOTS));
check("Standard: same bench", JSON.stringify(std.bench) === JSON.stringify(BENCH_SLOTS));
check("Standard: 20 on the roster", rosterSize(STANDARD_SQUAD) === 20);
check("no format = Standard", isStandardSquad(null) && isStandardSquad(STANDARD_SQUAD));
check("Standard pitch: 6 rows of 3,2,3,2,2,3", JSON.stringify(pitchRows(STANDARD_SQUAD).map((r) => r.length)) === "[3,2,3,2,2,3]");

// --- Ethan's example: 10 starters = 3 tight five + 2 forwards + 2 halves + 3 backs, 5 bench, 1 IR
const ethan: SquadFormat = { starters: { TF: 3, FW: 2, HV: 2, BK: 3 }, bench: 5, ir: 1 };
const es = squadSlots(ethan);
check("example: 10 starters, 5 bench, roster 15", es.starters.length === 10 && es.bench.length === 5 && rosterSize(ethan) === 15);
check("slot ids", es.starters.map((s) => s.id).join(",") === "tightfive1,tightfive2,tightfive3,forward1,forward2,halves1,halves2,back1,back2,back3");
check("slotKind reads ids", slotKind("tightfive2") === "TF" && slotKind("forward1") === "FW" && slotKind("bench3") === null && slotKind("prop1") === "PR");

const P = (id: string, pos: string, pos2?: string) => ({ id, posAbbrev: pos, secondaryPosAbbrev: pos2 ?? null, draftRank: 1 }) as RosterPlayer;
check("tight five takes props, hookers, locks", ["PR", "HO", "LK"].every((p) => slotAccepts("tightfive1", P("x", p))) && !slotAccepts("tightfive1", P("x", "LF")));
check("forward takes any forward incl. tight five", ["PR", "HO", "LK", "LF"].every((p) => slotAccepts("forward1", P("x", p))) && !slotAccepts("forward1", P("x", "HB")));
check("halves take HB and FH only", slotAccepts("halves1", P("x", "HB")) && slotAccepts("halves1", P("x", "FH")) && !slotAccepts("halves1", P("x", "CE")));
check("back takes any back", ["HB", "FH", "CE", "OB"].every((p) => slotAccepts("back1", P("x", p))) && !slotAccepts("back1", P("x", "LK")));
check("a second position counts (LF/CE fits a back slot)", slotAccepts("back1", P("x", "LF", "CE")));
check("bench takes anyone", slotAccepts("bench1", P("x", "PR")) && slotAccepts("bench1", P("x", "OB")));
check("example pitch rows", JSON.stringify(pitchRows(ethan)) === JSON.stringify([["tightfive1", "tightfive2", "tightfive3"], ["forward1", "forward2"], ["halves1", "halves2"], ["back1", "back2", "back3"]]));

// --- roster rules
const team = [
  P("pr1", "PR"), P("ho1", "HO"), P("lk1", "LK"), P("lf1", "LF"), P("lf2", "LF"),
  P("hb1", "HB"), P("fh1", "FH"), P("ce1", "CE"), P("ob1", "OB"), P("ob2", "OB"),
];
check("10 who can fill the example's slots fit", squadFits(team, ethan) && squadStartingGaps(team, ethan) === 0);
const tooManyBacks = [...team.slice(0, 2), P("b1", "CE"), P("b2", "OB"), P("b3", "OB"), ...team.slice(5)];
check("only 2 forwards: 3 forward slots (1 tight five + 2 forward) can't be filled", squadStartingGaps(tooManyBacks, ethan) === 3, String(squadStartingGaps(tooManyBacks, ethan)));
check("with 5 bench places they still fit the roster (bench takes anyone)", squadFits(tooManyBacks, ethan));
check("roster can't go over its size", !squadFits([...team, ...Array.from({ length: 6 }, (_, i) => P("x" + i, "OB"))], ethan));
const map = new Map([...team, ...tooManyBacks].map((p) => [p.id, p]));
check("rosterProblem uses the league's squad", rosterProblem(team.map((p) => p.id), map, undefined, ethan) === null);
check("...and its message lists the league's slots", (rosterProblem(tooManyBacks.map((p) => p.id), map, team.map((p) => p.id), ethan) ?? "").includes("3 Tight five"));
check("Standard message unchanged", positionRulesError(STANDARD_SQUAD).includes("2 PR, 1 HO"));

// --- settings limits
check("4 starters is too few", !!cleanSquadFormat({ starters: { ANY: 4 }, bench: 2, ir: 0 }).error);
check("24 starters is too many", !!cleanSquadFormat({ starters: { ANY: 24 }, bench: 0, ir: 0 }).error);
check("over 30 on the roster is refused", !!cleanSquadFormat({ starters: { ANY: 23 }, bench: 8, ir: 0 }).error);
check("bench / IR capped", cleanSquadFormat({ starters: { ANY: 10 }, bench: 99, ir: 9 }).format.bench === 10 && cleanSquadFormat({ starters: { ANY: 10 }, bench: 0, ir: 9 }).format.ir === 3);
check("junk = Standard", isStandardSquad(cleanSquadFormat("nope").format));

// --- lineups and auto-subs with the example squad
const bench = [P("bpr", "PR"), P("bfh", "FH"), P("bce", "CE"), P("blf", "LF"), P("bob", "OB")];
const fixed = updateLineup(null, [...team, ...bench], ethan);
check("a fresh lineup fills all 10 starting slots", fixed.ok && es.starters.every((s) => !!fixed.lineup[s.id]?.id));
check("...and the 5 bench places", es.bench.every((b) => !!fixed.lineup[b]?.id));

// the halfback doesn't play: the bench flyhalf (bench order permitting) comes into a halves slot
const lineup: Lineup = {
  tightfive1: P("pr1", "PR"), tightfive2: P("ho1", "HO"), tightfive3: P("lk1", "LK"),
  forward1: P("lf1", "LF"), forward2: P("lf2", "LF"),
  halves1: P("hb1", "HB"), halves2: P("fh1", "FH"),
  back1: P("ce1", "CE"), back2: P("ob1", "OB"), back3: P("ob2", "OB"),
  bench1: P("bpr", "PR"), bench2: P("bfh", "FH"), bench3: P("bce", "CE"), bench4: P("blf", "LF"), bench5: P("bob", "OB"),
};
const played = (id: string) => id !== "hb1";
const subbed = applyAutoSubs(lineup, played, ethan);
const starters = es.starters.map((s) => subbed[s.id]?.id);
check("auto-sub: the bench flyhalf replaces the halfback", starters.includes("bfh") && !starters.includes("hb1"), starters.join(","));
check("auto-sub: the bench prop (higher on the bench) can't play halves, so stays out", !starters.includes("bpr"));

const score = scoreTeamWeek({
  lineup,
  captainId: "fh1",
  viceId: "pr1",
  statsFor: (id) => (played(id) ? { minutesPlayed: 80, tries: id === "fh1" ? 1 : 0 } : { minutesPlayed: 0 }),
  frontRow: () => false,
  format: ethan,
});
// 10 starters x 2 (80 min) + 15 (try) + captain doubles fh1's 17 = 20 + 15 + 17 = 52
check("week score with the example squad", score.score === 52, String(score.score));

console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
