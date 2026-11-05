// Run: npx tsx scripts/tests/ladder-lineup.test.ts — ladder, bonus points and carried-forward lineups.
import { bonusPoints, buildLadder } from "../../lib/league/ladder";
import { reconcileLineup } from "../../lib/league/lineup";
import { STARTER_SLOTS, SLOT_POSITION, type Lineup } from "../../lib/scoring/week";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- bonus points (win by 140+, lose by 40 or less)
check("win by 140: winner bonus", eq(bonusPoints(500, 360, true), { home: 1, away: 0 }));
check("win by 139: no bonus", eq(bonusPoints(500, 361, true), { home: 0, away: 0 }));
check("lose by 40: loser bonus", eq(bonusPoints(400, 440, true), { home: 1, away: 0 }));
check("lose by 41: no bonus", eq(bonusPoints(400, 441, true), { home: 0, away: 0 }));
check("draw: no bonus", eq(bonusPoints(400, 400, true), { home: 0, away: 0 }));
check("bonus points switched off", eq(bonusPoints(600, 300, false), { home: 0, away: 0 }));

// ---- ladder
const m = (h: string, a: string | null, hs: number, as: number | null, hb = 0, ab = 0) => ({
  kind: "regular", status: "final", home_team_id: h, away_team_id: a, home_score: hs, away_score: as, home_bonus: hb, away_bonus: ab,
});
const ladder = buildLadder(["A", "B", "C"], [
  m("A", "B", 500, 300, 1, 0), // A wins with bonus
  m("C", null, 450, null),     // C bye: points for only
  m("B", "C", 400, 400),       // draw
  { ...m("A", "C", 900, 100), kind: "finals" }, // finals don't count
]);
check("ladder order", eq(ladder.map((r) => r.teamId), ["A", "C", "B"]), ladder.map((r) => `${r.teamId}:${r.ladderPoints}`).join(" "));
check("win = 4 + bonus 1", ladder[0].ladderPoints === 5);
check("bye adds points for only", ladder[1].pointsFor === 850 && ladder[1].byes === 1 && ladder[1].played === 1);
check("draw = 2 points each", ladder[1].ladderPoints === 2 && ladder[2].ladderPoints === 2);
check("tie on points broken by points for", ladder[1].teamId === "C");

// ---- carried-forward lineup vs roster changes
const P = (id: string, pos: string, pos2?: string) => ({ id, posAbbrev: pos, secondaryPosAbbrev: pos2 ?? null });
function savedLineup(): Lineup {
  const l: Lineup = {};
  for (const s of STARTER_SLOTS) l[s] = P(`s_${s}`, SLOT_POSITION[s]);
  l.bench1 = P("b1", "LK"); l.bench2 = P("b2", "HB"); l.bench3 = P("b3", "CE"); l.bench4 = P("b4", "OB"); l.bench5 = P("b5", "PR");
  return l;
}
const rosterOf = (l: Lineup) => Object.values(l).filter(Boolean) as ReturnType<typeof P>[];
const ids = (l: Lineup) => Object.values(l).filter(Boolean).map((p) => p!.id).sort();

{
  const l = savedLineup();
  const r = reconcileLineup(l, rosterOf(l));
  check("no roster changes: lineup unchanged", eq(r, l));
}
{
  const l = savedLineup();
  const roster = rosterOf(l).filter((p) => p.id !== "s_centre1").concat(P("new_ce", "CE"));
  const r = reconcileLineup(l, roster);
  check("dropped centre replaced by new centre in the same slot", r.centre1?.id === "new_ce");
  check("every roster player placed exactly once", eq(ids(r), roster.map((p) => p.id).sort()));
}
{
  const l = savedLineup();
  const roster = rosterOf(l).filter((p) => p.id !== "s_centre1").concat(P("new_pr", "PR"));
  const r = reconcileLineup(l, roster);
  check("new prop: bench centre moves up, prop goes to the bench", r.centre1?.id === "b3" && r.bench3?.id === "new_pr");
}
{
  const l = savedLineup();
  const roster = rosterOf(l).filter((p) => p.id !== "s_flyhalf1").concat(P("new_lk", "LK"));
  const r = reconcileLineup(l, roster);
  check("no one can play flyhalf: new player fills the gap anyway", r.flyhalf1?.id === "new_lk" && eq(ids(r), roster.map((p) => p.id).sort()));
}
{
  const roster = rosterOf(savedLineup());
  const r = reconcileLineup(null, roster);
  check("team that never saved a lineup: everyone placed", eq(ids(r), roster.map((p) => p.id).sort()) && STARTER_SLOTS.every((s) => !!r[s]));
}

console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
