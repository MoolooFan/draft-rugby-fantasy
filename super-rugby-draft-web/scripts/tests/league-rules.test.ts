// Run: npx tsx scripts/tests/league-rules.test.ts — Ethan's 23 Nov 2026 league rules:
// the waiver order flipped in the finals, eliminated teams, the better seed at home in the
// finals, and the commissioner reversing a trade / waiver claim / free agent move.
import { flipsInWeek, waiverOrderFromResults } from "../../lib/waivers/order";
import { eliminatedTeams } from "../../lib/league/eliminated";
import { homeShouldSwap } from "../../lib/league/schedule";
import { planMoveReversal, planTradeReversal } from "../../lib/league/reversePlan";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// A 4-team league, 2 regular weeks: A beats everyone (top), D loses everything (bottom).
const teams = ["A", "B", "C", "D"];
const g = (week: number, home: string, away: string, hs: number, as: number, kind = "regular", winner?: string) => ({
  kind, status: "final", weeks: [week], home_team_id: home, away_team_id: away, home_score: hs, away_score: as, winner_team_id: winner ?? (hs > as ? home : away),
});
const regular = [g(1, "A", "B", 300, 200), g(1, "C", "D", 250, 150), g(2, "A", "C", 280, 260), g(2, "B", "D", 240, 100)];
// ladder: A 2-0, then B / C 1-1 (B: 440 v 400 for, C: 510 v 430 -> C has more points) , D 0-2

// --- waiver order
const usual = waiverOrderFromResults(teams, regular, 3);
const flipped = waiverOrderFromResults(teams, regular, 3, true);
check("waivers: usual order is worst first", usual[0] === "D" && usual[3] === "A", usual.join(","));
check("waivers: flipped in the finals is the ladder, 1st seed first", flipped.join(",") === [...usual].reverse().join(","), flipped.join(","));
const plan = { schedule_plan: { playoffWeeks: [3, 4] } };
check("flip: on by default in a finals week", flipsInWeek(plan, 3) && flipsInWeek({ ...plan, playoff_waiver_flip: null }, 4));
check("flip: not in the regular season", !flipsInWeek(plan, 2));
check("flip: off when the setting is off", !flipsInWeek({ ...plan, playoff_waiver_flip: false }, 3));

// --- eliminated teams (2-team final: A v C; B and D miss out)
const base = { teamIds: teams, regularWeeks: [1, 2], finals: 2 };
check("eliminated: nobody before the regular season ends", eliminatedTeams({ ...base, matchups: regular, finalisedWeeks: [1] }).size === 0);
const afterRegular = eliminatedTeams({ ...base, matchups: regular, finalisedWeeks: [1, 2] });
check("eliminated: teams that missed the finals", [...afterRegular].sort().join(",") === "B,D", [...afterRegular].join(","));
const sf = { ...base, finals: 4 };
const withSemis = [...regular, g(3, "A", "D", 200, 260, "finals"), g(3, "C", "B", 300, 100, "finals"), g(3, "X", "Y", 1, 2, "consolation")];
const knocked = eliminatedTeams({ ...sf, matchups: withSemis, finalisedWeeks: [1, 2, 3] });
check("eliminated: losing a finals game knocks you out (consolation games don't count)", [...knocked].sort().join(",") === "A,B", [...knocked].join(","));
check("eliminated: none with no finals", eliminatedTeams({ ...base, finals: 0, matchups: regular, finalisedWeeks: [1, 2] }).size === 0);

// --- home team in the finals
const seeds = ["A", "C", "B", "D"];
check("home: better seed already home -> no swap", !homeShouldSwap("A", "D", seeds));
check("home: 4th seed drawn at home v the 2nd seed -> swap", homeShouldSwap("D", "C", seeds));
check("home: an unknown team is the lowest seed", homeShouldSwap("Z", "D", seeds) && !homeShouldSwap("D", "Z", seeds));

// --- reversing
const nm = (id: string) => id.toUpperCase();
const tn = (id: string) => `Team ${id}`;
const rosters = new Map<string, unknown>([
  ["A", { playerIds: ["a1", "a2", "b1"], irIds: [] }], // A got b1 for a3
  ["B", { playerIds: ["b2", "b3", "a3", "x9"], irIds: ["x9"] }],
]);
const trade = { fromTeamId: "A", toTeamId: "B", offerIds: ["a3"], requestIds: ["b1"] };
const tr = planTradeReversal(trade, rosters, nm, tn);
check("reverse trade: players go back", tr.ok && tr.next.get("A")!.sort().join(",") === "a1,a2,a3" && tr.next.get("B")!.sort().join(",") === "b1,b2,b3", JSON.stringify(tr.ok ? [...tr.next] : tr));
const gone = planTradeReversal({ ...trade, requestIds: ["b7"] }, rosters, nm, tn);
check("reverse trade: refused if a player has moved on", !gone.ok && /B7 isn't on Team A/.test(gone.error), gone.ok ? "" : gone.error);
const inIr = planTradeReversal({ fromTeamId: "A", toTeamId: "B", offerIds: ["x9"], requestIds: ["b1"] }, rosters, nm, tn);
check("reverse trade: refused if a player is in IR now", !inIr.ok && /IR/.test(inIr.error));

const fa = planMoveReversal({ teamId: "A", addId: "b1", dropId: "z1" }, rosters, nm, tn);
check("reverse move: added player out, dropped player back (and unlocked)", fa.ok && fa.next.get("A")!.sort().join(",") === "a1,a2,z1" && fa.lock.join() === "b1" && fa.unlock.join() === "z1");
const signed = planMoveReversal({ teamId: "A", addId: "b1", dropId: "b2" }, rosters, nm, tn);
check("reverse move: refused if the dropped player was signed by someone else", !signed.ok && /signed by Team B/.test(signed.error), signed.ok ? "" : signed.error);
const signedIr = planMoveReversal({ teamId: "A", addId: "b1", dropId: "x9" }, rosters, nm, tn);
check("reverse move: a player in someone's IR counts as signed", !signedIr.ok);
check("reverse move: an IR-activation drop can't be reversed", !planMoveReversal({ teamId: "A", addId: null, dropId: "z1" }, rosters, nm, tn).ok);
const noDrop = planMoveReversal({ teamId: "A", addId: "b1", dropId: null }, rosters, nm, tn);
check("reverse move: an add with no drop just removes him", noDrop.ok && noDrop.next.get("A")!.length === 2);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
if (failures) process.exit(1);
