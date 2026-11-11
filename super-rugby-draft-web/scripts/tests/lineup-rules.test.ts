// Run: npx tsx scripts/tests/lineup-rules.test.ts — lineups fixing themselves after roster changes,
// and captain / vice-captain rules (agreed with Ethan, Nov 2026).
import { fixCaptains, updateLineup } from "../../lib/league/lineup";
import { BENCH_SLOTS, SLOT_POSITION, STARTER_SLOTS, type Lineup, type SlotId } from "../../lib/scoring/week";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const P = (id: string, pos: string, pos2?: string, pos3?: string) => ({ id, posAbbrev: pos, secondaryPosAbbrev: pos2 ?? null, thirdPosAbbrev: pos3 ?? null });
type Pl = ReturnType<typeof P>;
function base(): Lineup {
  const l: Lineup = {};
  for (const s of STARTER_SLOTS) l[s] = P(`s_${s}`, SLOT_POSITION[s]);
  l.bench1 = P("b1", "LK"); l.bench2 = P("b2", "HB"); l.bench3 = P("b3", "CE"); l.bench4 = P("b4", "OB"); l.bench5 = P("b5", "PR");
  return l;
}
const rosterOf = (l: Lineup) => Object.values(l).filter(Boolean) as Pl[];
const swap = (l: Lineup, outId: string, inP: Pl) => rosterOf(l).filter((p) => p.id !== outId).concat(inP);
const where = (l: Lineup, id: string) => (Object.keys(l) as SlotId[]).find((s) => l[s]?.id === id);
const allPlaced = (l: Lineup, roster: Pl[]) => {
  const got = Object.values(l).filter(Boolean).map((p) => p!.id).sort();
  return JSON.stringify(got) === JSON.stringify(roster.map((p) => p.id).sort());
};
const valid = (l: Lineup) => STARTER_SLOTS.every((s) => {
  const p = l[s] as Pl | null | undefined;
  return !!p && [p.posAbbrev, p.secondaryPosAbbrev, p.thirdPosAbbrev].includes(SLOT_POSITION[s]);
});

// nothing changed
{
  const l = base();
  const r = updateLineup(l, rosterOf(l));
  check("no change: nobody moves", r.ok && r.moved.length === 0 && STARTER_SLOTS.every((s) => r.lineup[s]?.id === l[s]?.id));
}
// rule 1: new player takes the vacated spot
{
  const l = base();
  const roster = swap(l, "s_centre1", P("new_ce", "CE"));
  const r = updateLineup(l, roster);
  check("rule 1: new centre takes the dropped centre's spot", r.ok && r.lineup.centre1?.id === "new_ce" && r.moved.length === 0);
}
// rule 1 with a multi-position player
{
  const l = base();
  const roster = swap(l, "s_flyhalf1", P("new_ce_fh", "CE", "FH"));
  const r = updateLineup(l, roster);
  check("rule 1: CE/FH takes the dropped flyhalf's spot", r.ok && r.lineup.flyhalf1?.id === "new_ce_fh" && r.moved.length === 0);
}
// rule 2: highest bench player who fits moves up
{
  const l = base();
  l.bench1 = P("b1", "CE"); // bench1 and bench3 both centres
  const roster = swap(l, "s_centre2", P("new_pr", "PR"));
  const r = updateLineup(l, roster);
  check("rule 2: bench1 (highest) centre moves up, not bench3", r.ok && r.lineup.centre2?.id === "b1" && r.lineup.bench1?.id === "new_pr" && r.lineup.bench3?.id === "b3", JSON.stringify(r.ok && r.moved));
  check("rule 2: only one player moved", r.ok && r.moved.length === 1);
}
{
  const l = base();
  const roster = swap(l, "s_centre1", P("new_pr", "PR"));
  const r = updateLineup(l, roster);
  check("rule 2: bench centre moves up, new prop takes his bench spot", r.ok && r.lineup.centre1?.id === "b3" && r.lineup.bench3?.id === "new_pr");
}
// rule 3: fewest moves when no bench player fits
{
  const l = base();
  l.outsideback1 = P("s_outsideback1", "OB", "FH"); // a starting OB who can also play FH
  const roster = swap(l, "s_flyhalf1", P("new_ob", "OB"));
  const r = updateLineup(l, roster);
  check("rule 3: OB/FH shifts to flyhalf, new OB takes his wing spot (1 move)", r.ok && r.lineup.flyhalf1?.id === "s_outsideback1" && r.lineup.outsideback1?.id === "new_ob" && r.moved.length === 1, JSON.stringify(r.ok && r.moved));
}
{
  // two-step: no one can play HB directly from the bench; a starting FH/HB moves to HB, bench FH moves up
  const l = base();
  l.flyhalf1 = P("s_flyhalf1", "FH", "HB");
  l.bench2 = P("b2", "FH");
  const roster = swap(l, "s_halfback1", P("new_lk", "LK"));
  const r = updateLineup(l, roster);
  check("rule 3: chain of 2 moves when needed", r.ok && r.lineup.halfback1?.id === "s_flyhalf1" && r.lineup.flyhalf1?.id === "b2" && r.moved.length === 2 && valid(r.lineup), JSON.stringify(r.ok && r.moved));
}
// a bench player dropped: new player goes to that bench spot
{
  const l = base();
  const roster = swap(l, "b4", P("new_lf", "LF"));
  const r = updateLineup(l, roster);
  check("bench player dropped: new player takes his bench spot", r.ok && r.lineup.bench4?.id === "new_lf" && r.moved.length === 0);
}
// impossible: nobody can play hooker
{
  const l = base();
  const roster = swap(l, "s_hooker1", P("new_ob", "OB"));
  const r = updateLineup(l, roster);
  check("no one can play hooker: change refused", !r.ok);
}
// trade: two out, two in
{
  const l = base();
  const roster = rosterOf(l).filter((p) => p.id !== "s_lock1" && p.id !== "b2").concat(P("new_lk", "LK"), P("new_ob", "OB"));
  const r = updateLineup(l, roster);
  check("2-for-2 trade: new lock starts, new OB takes the bench spot", r.ok && r.lineup.lock1?.id === "new_lk" && r.lineup.bench2?.id === "new_ob" && r.moved.length === 0);
}
// IR: player goes to IR (removed from roster list), roster now 19 + nobody added
{
  const l = base();
  const roster = rosterOf(l).filter((p) => p.id !== "s_lock2");
  const r = updateLineup(l, roster);
  check("starter to IR: bench lock moves up, one bench spot empty", r.ok && r.lineup.lock2?.id === "b1" && BENCH_SLOTS.filter((s) => !r.lineup[s]).length === 1);
}
// never saved a lineup: best players start
{
  const roster: Pl[] = [];
  for (const s of STARTER_SLOTS) roster.push(P(`best_${s}`, SLOT_POSITION[s]));
  roster.push(P("w1", "PR"), P("w2", "LK"), P("w3", "OB"), P("w4", "CE"), P("w5", "HB"));
  const r = updateLineup(null, roster);
  check("no lineup yet: the best 15 start, everyone placed", r.ok && STARTER_SLOTS.every((s) => String(r.lineup[s]?.id).startsWith("best_")) && allPlaced(r.lineup, roster));
}
// everyone placed exactly once, lineup valid, in a few random roster changes
{
  let ok = true;
  for (let t = 0; t < 200; t++) {
    const l = base();
    const out = Object.values(l).filter(Boolean)[Math.floor(Math.random() * 20)]!.id;
    const pos = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"][Math.floor(Math.random() * 8)];
    const roster = swap(l, out, P("rand", pos));
    const r = updateLineup(l, roster);
    if (r.ok && (!allPlaced(r.lineup, roster) || !valid(r.lineup))) ok = false;
    // only fails when a starter with no bench cover (HO, FH, LF here) is replaced by someone of another position
    const uncovered = { s_hooker1: "HO", s_flyhalf1: "FH", s_looseforward1: "LF", s_looseforward2: "LF", s_looseforward3: "LF" } as Record<string, string>;
    if (!r.ok !== (!!uncovered[out] && uncovered[out] !== pos)) { ok = false; console.log("  unexpected:", out, pos, r.ok); }
  }
  check("200 random swaps: always valid, everyone placed once", ok);
}

// ---- captain and vice-captain
const l = base();
const picks: Record<string, number> = { s_centre1: 1, s_lock1: 2, b1: 3, s_prop1: 4 };
const rank = (id: string) => picks[id] ?? 1000;
{
  const r = fixCaptains(l, null, null, rank);
  check("start of season: 1st and 2nd picks", r.captainId === "s_centre1" && r.viceId === "s_lock1");
}
{
  const r = fixCaptains(l, "s_prop1", "s_centre1", rank);
  check("carry over: unchanged when both start", r.captainId === "s_prop1" && r.viceId === "s_centre1");
}
{
  const r = fixCaptains(l, "gone_player", "s_lock1", rank);
  check("captain left: vice becomes captain, new vice = earliest pick starting", r.captainId === "s_lock1" && r.viceId === "s_centre1");
}
{
  const r = fixCaptains(l, "b1", "s_lock1", rank);
  check("captain on the bench: vice promoted (bench player can't be captain)", r.captainId === "s_lock1" && r.viceId === "s_centre1");
}
{
  const r = fixCaptains(l, "s_centre1", "b2", rank);
  check("vice on the bench: new vice = earliest pick starting", r.captainId === "s_centre1" && r.viceId === "s_lock1");
}
{
  const r = fixCaptains(l, "s_centre1", "s_centre1", rank);
  check("same player can't be both", r.captainId === "s_centre1" && r.viceId === "s_lock1");
}

console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
