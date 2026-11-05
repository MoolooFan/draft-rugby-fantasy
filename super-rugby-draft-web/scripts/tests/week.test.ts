// Run: npx tsx scripts/tests/week.test.ts — checks auto-subs and the captain rule with made-up players.
import { scoreTeamWeek, STARTER_SLOTS, SLOT_POSITION, type Lineup, type LineupPlayer } from "../../lib/scoring/week";
import type { StatCounts } from "../../lib/scoring";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// A full XV: player "s_<slot>" in each starting slot, plus a bench.
function team(bench: LineupPlayer[]): Lineup {
  const l: Lineup = {};
  for (const slot of STARTER_SLOTS) l[slot] = { id: `s_${slot}`, posAbbrev: SLOT_POSITION[slot] };
  ["bench1", "bench2", "bench3", "bench4", "bench5"].forEach((b, i) => ((l as Record<string, LineupPlayer | null>)[b] = bench[i] ?? null));
  return l;
}
// Stats: every listed player gets `minutes` and 1 tackle; unlisted = didn't play (no stats).
function stats(entries: Record<string, { min: number; tackles?: number; tries?: number }>) {
  return (id: string): StatCounts | null => {
    const e = entries[id];
    return e ? { minutesPlayed: e.min, tackles: e.tackles ?? 1, tries: e.tries ?? 0 } : null;
  };
}
const everyone = (except: string[] = [], extra: Record<string, { min: number; tackles?: number; tries?: number }> = {}) => {
  const m: Record<string, { min: number; tackles?: number; tries?: number }> = {};
  for (const slot of STARTER_SLOTS) if (!except.includes(`s_${slot}`)) m[`s_${slot}`] = { min: 80 };
  return { ...m, ...extra };
};
const xv = (l: Lineup) => STARTER_SLOTS.map((s) => l[s]?.id);
const frontRow = () => false;

// 1. Nobody missing: nothing changes. 15 players x (2 for 61+ min + 1 tackle) = 45, captain x2 = 48.
{
  const l = team([{ id: "b1", posAbbrev: "CE" }]);
  const r = scoreTeamWeek({ lineup: l, captainId: "s_flyhalf1", viceId: "s_halfback1", statsFor: stats(everyone([], { b1: { min: 80 } })), frontRow });
  check("full team: no subs", JSON.stringify(xv(r.finalLineup)) === JSON.stringify(xv(l)));
  check("full team: score 45 + captain bonus 3 = 48", r.score === 48, String(r.score));
}
// 2. Centre didn't play: bench centre comes on.
{
  const l = team([{ id: "b1", posAbbrev: "CE" }]);
  const r = scoreTeamWeek({ lineup: l, captainId: null, viceId: null, statsFor: stats(everyone(["s_centre1"], { b1: { min: 20 } })), frontRow });
  check("missing centre replaced by bench centre", xv(r.finalLineup).includes("b1") && !xv(r.finalLineup).includes("s_centre1"));
}
// 3. Bench player who didn't play can't come on.
{
  const l = team([{ id: "b1", posAbbrev: "CE" }]);
  const r = scoreTeamWeek({ lineup: l, captainId: null, viceId: null, statsFor: stats(everyone(["s_centre1"])), frontRow });
  check("bench player who didn't play stays on the bench", !xv(r.finalLineup).includes("b1"));
}
// 4. Bench order: bench1 before bench2 when both fit.
{
  const l = team([{ id: "b1", posAbbrev: "OB" }, { id: "b2", posAbbrev: "OB" }]);
  const r = scoreTeamWeek({ lineup: l, captainId: null, viceId: null, statsFor: stats(everyone(["s_outsideback2"], { b1: { min: 5 }, b2: { min: 80, tackles: 20 } })), frontRow });
  check("bench order decides who comes on first", xv(r.finalLineup).includes("b1") && !xv(r.finalLineup).includes("b2"));
}
// 5. Reshuffle: a centre is missing, the bench has an outside back; a starting outside back who can also play centre moves in.
{
  const l = team([{ id: "b1", posAbbrev: "OB" }]);
  l.outsideback1 = { id: "s_outsideback1", posAbbrev: "OB", secondaryPosAbbrev: "CE" };
  const r = scoreTeamWeek({ lineup: l, captainId: null, viceId: null, statsFor: stats(everyone(["s_centre1"], { b1: { min: 30 } })), frontRow });
  check("players move to their other position so a bench player fits", xv(r.finalLineup).includes("b1") && (r.finalLineup.centre1?.id === "s_outsideback1" || r.finalLineup.centre2?.id === "s_outsideback1"));
}
// 6. Wrong position and no way to reshuffle: no sub.
{
  const l = team([{ id: "b1", posAbbrev: "PR" }]);
  const r = scoreTeamWeek({ lineup: l, captainId: null, viceId: null, statsFor: stats(everyone(["s_flyhalf1"], { b1: { min: 80 } })), frontRow });
  check("a prop can't replace a missing flyhalf", !xv(r.finalLineup).includes("b1"));
}
// 7. A starter who played but scored 0 or less is NOT subbed (minutes rule).
{
  const l = team([{ id: "b1", posAbbrev: "LK" }]);
  const r = scoreTeamWeek({ lineup: l, captainId: null, viceId: null, statsFor: stats(everyone([], { s_lock1: { min: 1, tackles: -1 }, b1: { min: 80, tackles: 10 } })), frontRow });
  check("starter who played (even scoring 0) keeps his spot", xv(r.finalLineup).includes("s_lock1") && !xv(r.finalLineup).includes("b1"));
}
// 8. Captain played: captain x2 even if his score is low; vice not used.
{
  const l = team([]);
  const r = scoreTeamWeek({ lineup: l, captainId: "s_lock1", viceId: "s_lock2", statsFor: stats(everyone([], { s_lock1: { min: 1, tackles: -1 } })), frontRow });
  check("captain who played keeps the x2 (even with a low score)", r.captainUsedId === "s_lock1");
}
// 9. Captain didn't play: vice gets the x2.
{
  const l = team([]);
  const r = scoreTeamWeek({ lineup: l, captainId: "s_lock1", viceId: "s_lock2", statsFor: stats(everyone(["s_lock1"])), frontRow });
  check("captain didn't play: vice-captain gets the x2", r.captainUsedId === "s_lock2");
}
// 10. Tries counted from the final XV; captain's try counts once.
{
  const l = team([]);
  const r = scoreTeamWeek({ lineup: l, captainId: "s_centre1", viceId: null, statsFor: stats(everyone([], { s_centre1: { min: 80, tries: 2 }, s_hooker1: { min: 80, tries: 1 } })), frontRow });
  check("tries counted once each (3)", r.tries === 3, String(r.tries));
}

console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
