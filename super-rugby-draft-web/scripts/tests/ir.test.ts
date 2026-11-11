// Run: npx tsx scripts/tests/ir.test.ts — injury reserve (IR) rules agreed with Ethan (Nov 2026),
// and the position rules for a team with a player in IR.
import { activeIdsOf, applyIrAction, healthyIrPlayerId, irEligible, irIdsOf, ownedIdsOf } from "../../lib/league/ir";
import { rosterProblem, type RosterPlayer } from "../../lib/league/rosterChange";
import { buildAndValidateNextIds } from "../../lib/transactions/rosterValidate";
import { updateLineup } from "../../lib/league/lineup";
import { STARTER_SLOTS } from "../../lib/scoring/week";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const P = (id: string, pos: string, pos2?: string): RosterPlayer => ({
  id,
  firstName: id,
  lastName: "",
  teamCode: "CHI",
  posAbbrev: pos,
  secondaryPosAbbrev: pos2 ?? null,
  thirdPosAbbrev: null,
  draftRank: 1,
});

// A valid 20: 2 PR, 1 HO, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB + 5 wildcards (PR, LK, HB, CE, OB)
const squad: RosterPlayer[] = [
  P("pr1", "PR"), P("pr2", "PR"), P("ho1", "HO"), P("lk1", "LK"), P("lk2", "LK"),
  P("lf1", "LF"), P("lf2", "LF"), P("lf3", "LF"), P("hb1", "HB"), P("fh1", "FH"),
  P("ce1", "CE"), P("ce2", "CE"), P("ob1", "OB"), P("ob2", "OB"), P("ob3", "OB"),
  P("pr3", "PR"), P("lk3", "LK"), P("hb2", "HB"), P("ce3", "CE"), P("ob4", "OB"),
];
const extra = [P("fa_ho", "HO"), P("fa_ob", "OB"), P("fa_pr", "PR"), P("fa_ce", "CE")];
const players = new Map([...squad, ...extra].map((p) => [p.id, p]));
const active = squad.map((p) => p.id);

const statuses: Record<string, string | null> = {
  ho1: "Knee - 4 weeks",
  ob1: "Out - Personal reasons",
  ce1: "Suspended - 2 weeks",
  lf1: "Starting",
  hb2: "Benched",
  ob2: "Injury - TBC",
};
const statusOf = (id: string) => statuses[id] ?? null;

// eligibility
check("injured can go in IR", irEligible("Knee - 4 weeks") && irEligible("Injury - TBC"));
check("out (personal reasons) can go in IR", irEligible("Out - Personal reasons"));
check("suspended / starting / sub / not named can't", !irEligible("Suspended - 1 week") && !irEligible("Starting") && !irEligible("Benched") && !irEligible(null));

// moving to IR
{
  const r = applyIrAction({ active, ir: [] }, { action: "move", playerId: "ho1" }, players, statusOf);
  check("injured hooker moves to IR (allowed even though he's the only hooker)", r.ok && r.ir[0] === "ho1" && r.active.length === 19 && !r.active.includes("ho1"));
}
{
  const r = applyIrAction({ active, ir: [] }, { action: "move", playerId: "ob1" }, players, statusOf);
  check("player out for personal reasons moves to IR", r.ok && r.ir[0] === "ob1");
}
for (const id of ["ce1", "lf1", "hb2", "pr1"]) {
  const r = applyIrAction({ active, ir: [] }, { action: "move", playerId: id }, players, statusOf);
  check(`not allowed in IR: ${statuses[id] ?? "not named"}`, !r.ok);
}
{
  const r = applyIrAction({ active: active.filter((x) => x !== "ob2"), ir: ["ob2"] }, { action: "move", playerId: "ho1" }, players, statusOf);
  check("only one IR spot", !r.ok && r.error.includes("already"));
}
{
  const r = applyIrAction({ active, ir: [] }, { action: "move", playerId: "fa_ob" }, players, () => "Knee - TBC");
  check("can't put a player you don't have in IR (no adding straight to IR)", !r.ok);
}

// with the hooker in IR: 19 players, no hooker
const act19 = active.filter((x) => x !== "ho1");
{
  const built = buildAndValidateNextIds({ currentIds: act19, addPlayerId: "fa_ho", dropPlayerId: null });
  check("free place: add without a drop", built.ok && built.nextIds.length === 20);
  check("adding a hooker into the free place is fine", built.ok && rosterProblem(built.nextIds, players, act19) === null);
}
{
  const built = buildAndValidateNextIds({ currentIds: act19, addPlayerId: "fa_pr", dropPlayerId: null });
  check("filling the free place with a 21st... no: a full 20 with no hooker is refused", built.ok && rosterProblem(built.nextIds, players, act19) !== null);
}
{
  const built = buildAndValidateNextIds({ currentIds: act19, addPlayerId: "fa_ob", dropPlayerId: "ob4" });
  check("swapping a winger while the hooker spot is empty is fine (not worse)", built.ok && rosterProblem(built.nextIds, players, act19) === null);
}
{
  const built = buildAndValidateNextIds({ currentIds: act19, addPlayerId: "fa_ob", dropPlayerId: "fh1" });
  check("dropping the only flyhalf while short is refused (a second empty spot)", built.ok && rosterProblem(built.nextIds, players, act19) !== null);
}
{
  const built = buildAndValidateNextIds({ currentIds: active, addPlayerId: "fa_ob", dropPlayerId: null });
  check("full team still needs a drop", !built.ok);
}
{
  const fullOk = rosterProblem(active, players, active);
  check("a normal valid 20 passes", fullOk === null);
  const tooMany = rosterProblem([...active, "fa_ob"], players, active);
  check("21 not counting IR is refused", tooMany !== null);
}
{
  const roster = act19.map((id) => players.get(id)!);
  const r = updateLineup(null, roster);
  check("lineup with the hooker in IR: hooker spot empty, everyone else placed", !r.ok && !r.lineup.hooker1 && STARTER_SLOTS.filter((s) => !r.lineup[s]).length === 1);
}

// activating
{
  const r = applyIrAction({ active: act19, ir: ["ho1"] }, { action: "activate", playerId: "ho1" }, players, statusOf);
  check("activate into the free place: no drop needed", r.ok && r.active.length === 20 && r.ir.length === 0 && r.dropped === null);
}
{
  const full = [...act19, "fa_ho"];
  const r = applyIrAction({ active: full, ir: ["ho1"] }, { action: "activate", playerId: "ho1" }, players, statusOf);
  check("activate with a full team needs a drop", !r.ok && r.error.includes("drop"));
  const r2 = applyIrAction({ active: full, ir: ["ho1"] }, { action: "activate", playerId: "ho1", dropPlayerId: "ob4" }, players, statusOf);
  check("activate dropping a winger", r2.ok && r2.dropped === "ob4" && r2.active.includes("ho1") && !r2.active.includes("ob4") && r2.active.length === 20);
  const r3 = applyIrAction({ active: full, ir: ["ho1"] }, { action: "activate", playerId: "ho1", dropPlayerId: "fh1" }, players, statusOf);
  check("activate dropping the only flyhalf is refused", !r3.ok);
}

// swapping
{
  const r = applyIrAction({ active: act19.concat("fa_ho"), ir: ["ho1"] }, { action: "swap", playerId: "ho1", swapPlayerId: "ob2" }, players, statusOf);
  check("swap IR hooker with injured winger", r.ok && r.ir[0] === "ob2" && r.active.includes("ho1") && !r.active.includes("ob2"));
  const r2 = applyIrAction({ active: act19.concat("fa_ho"), ir: ["ho1"] }, { action: "swap", playerId: "ho1", swapPlayerId: "ob3" }, players, statusOf);
  check("can't swap with a fit player", !r2.ok);
}

// fit again
check("IR player still injured: no block", healthyIrPlayerId(["ho1"], statusOf) === null);
check("IR player fit again (starting): block", healthyIrPlayerId(["lf1"], statusOf) === "lf1");
check("IR player fit again (no status): block", healthyIrPlayerId(["pr1"], statusOf) === "pr1");
check("IR player now suspended counts as not in IR's rules: block", healthyIrPlayerId(["ce1"], statusOf) === "ce1");

// roster data helpers
{
  const data = { playerIds: ["a", "b", "c"], irIds: ["d"] };
  check("active / IR / owned from roster data", JSON.stringify(activeIdsOf(data)) === '["a","b","c"]' && JSON.stringify(irIdsOf(data)) === '["d"]' && ownedIdsOf(data).length === 4);
  const old = { playerIds: ["a", "b", "d"], irIds: ["d"] };
  check("an IR player wrongly also in playerIds isn't active", !activeIdsOf(old).includes("d"));
  check("no IR field = no IR", irIdsOf({ playerIds: ["a"] }).length === 0);
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
