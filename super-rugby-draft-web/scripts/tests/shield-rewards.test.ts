// Run: npx tsx scripts/tests/shield-rewards.test.ts — rewards for holding the Shield
// (lib/league/shield.ts), the waiver order with the holder's first pick (lib/waivers/order.ts)
// and the ladder's shield points and tie-break (lib/league/ladder.ts).
import { cleanShieldRewards, computeShield, holderAfterWeek, shieldLadderPoints, shieldRewardLines, type ShieldGame, type ShieldSeason } from "../../lib/league/shield";
import { waiverOrderFromResults, waiverRounds } from "../../lib/waivers/order";
import { buildLadder, ladderOrder, tieBreakHolder, type LadderMatchup } from "../../lib/league/ladder";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// ---- settings
const r = cleanShieldRewards({ firstWaiverPick: true, defencePoints: 1, winPoints: 7, tieBreak: "yes" });
check("rewards: cleaned (points 0-2, only true counts)", r.firstWaiverPick && r.defencePoints === 1 && r.winPoints === 2 && !r.tieBreak, JSON.stringify(r));
check("rewards: nothing saved = none", JSON.stringify(cleanShieldRewards(null)) === JSON.stringify({ firstWaiverPick: false, defencePoints: 0, winPoints: 0, tieBreak: false }));
check("rewards: described for the Shield tab", shieldRewardLines(r).join(" | ") === "First waiver pick each week | 1 ladder point for each defence | 2 ladder points for taking it");

// ---- who held it after each week (Ethan's 2025 league replayed: Josh R1, Noah takes it R6, DT R7)
const R: Array<[number, string, number, number, string]> = [
  [1, "noah", 527, 432, "dt"], [1, "josh", 560, 496, "hh"],
  [2, "hh", 405, 623, "noah"], [2, "josh", 552, 535, "dt"],
  [3, "noah", 367, 504, "josh"], [3, "hh", 448, 436, "dt"],
  [4, "dt", 480, 658, "noah"], [4, "hh", 442, 618, "josh"],
  [5, "noah", 451, 372, "hh"], [5, "dt", 631, 426, "josh"],
  [6, "josh", 385, 615, "noah"], [6, "dt", 485, 501, "hh"],
  [7, "noah", 341, 502, "dt"], [7, "josh", 451, 407, "hh"],
];
const games: ShieldGame[] = R.map(([w, h, hs, as, a]) => ({ week: w, homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as, final: true }));
const season: ShieldSeason = { leagueId: "L", season: 2027, enabled: true, teams: ["noah", "dt", "josh", "hh"].map((id) => ({ id, owner: id, name: id })), games };
const st = computeShield([season]);
const ev = st.events;
check("nobody holds it before round 1", holderAfterWeek(ev, st.seasonStart.L ?? null, 0) === null);
check("holder after each round: Josh R1-5, Noah R6, DT R7", [1, 2, 5, 6, 7].map((w) => holderAfterWeek(ev, null, w)).join(",") === "josh,josh,josh,noah,dt");
check("switched-off weeks: holder kept (no events those weeks)", holderAfterWeek(ev, null, 10) === "dt");

// carried over: next season starts with the holder already holding it
const next: ShieldSeason = { leagueId: "L2", season: 2028, enabled: true, teams: season.teams.map((t) => ({ ...t, id: `${t.id}28` })), games: [] };
const st2 = computeShield([season, next]);
check("next season: last season's holder holds it from the start (waivers in week 1)", st2.seasonStart.L2 === "dt28" && holderAfterWeek([], st2.seasonStart.L2, 0) === "dt28");

// ladder points from the shield
const pts = { firstWaiverPick: false, defencePoints: 1, winPoints: 2, tieBreak: false };
check("defence: +1 to the holder (Josh R2)", shieldLadderPoints(ev, pts, 2, "josh") === 1 && shieldLadderPoints(ev, pts, 2, "dt") === 0);
check("taking it: +2 (Noah R6, DT R7)", shieldLadderPoints(ev, pts, 6, "noah") === 2 && shieldLadderPoints(ev, pts, 7, "dt") === 2);
check("first award (round 1 top score) earns nothing", shieldLadderPoints(ev, pts, 1, "josh") === 0);
check("rewards off: no points", shieldLadderPoints(ev, cleanShieldRewards({}), 2, "josh") === 0);

// ---- waiver order
const usual = ["d", "c", "b", "a"]; // worst first
const w = waiverRounds(usual, "b");
check("round 1: the holder first, the rest in the usual order without him", w.firstRound.join("") === "bdca", w.firstRound.join(""));
check("round 2 on: the usual order (holder back in his spot)", w.order.join("") === "dcba");
check("no holder / reward off: round 1 is the usual order", waiverRounds(usual, null).firstRound.join("") === "dcba" && waiverRounds(usual, null).shieldTeamId === null);
check("holder already first: nothing changes", waiverRounds(usual, "d").firstRound.join("") === "dcba");
check("holder not in this league: ignored", waiverRounds(usual, "zz").firstRound.join("") === "dcba" && waiverRounds(usual, "zz").shieldTeamId === null);

type M = LadderMatchup & { weeks: number[] };
const g = (week: number, h: string, hs: number, as: number, a: string, extra: Partial<M> = {}): M => ({
  kind: "regular", status: "final", weeks: [week], home_team_id: h, away_team_id: a, home_score: hs, away_score: as, ...extra,
});
const ms: M[] = [g(1, "a", 500, 400, "b"), g(1, "c", 450, 300, "d"), g(2, "a", 500, 400, "c"), g(2, "b", 300, 450, "d")];
check("waiver order: reverse ladder from games before the week", waiverOrderFromResults(["a", "b", "c", "d"], ms, 3).join("") === "bdca", waiverOrderFromResults(["a", "b", "c", "d"], ms, 3).join(""));
check("waiver order: only games finished before that week", waiverOrderFromResults(["a", "b", "c", "d"], ms, 2).join("") === "dbca", waiverOrderFromResults(["a", "b", "c", "d"], ms, 2).join(""));
check("waiver order: no games yet = the teams as given", waiverOrderFromResults(["a", "b", "c", "d"], ms, 1).join("") === "abcd");
// round 1 only: d (300, lost) would be last, but a losing bonus point lifts him above b (400, no bonus)
check("waiver order counts bonus points (it didn't before)",
  waiverOrderFromResults(["a", "b", "c", "d"], [g(1, "a", 500, 400, "b"), g(1, "c", 450, 300, "d", { away_bonus: 1 })], 2).join("") === "bdca");
check("waiver order counts the shield's ladder points",
  waiverOrderFromResults(["a", "b", "c", "d"], [g(1, "a", 500, 400, "b"), g(1, "c", 450, 300, "d", { away_shield_pts: 1 })], 2).join("") === "bdca");

// ---- ladder: shield points and the tie-break
const lad = buildLadder(["a", "b", "c", "d"], [g(1, "a", 500, 400, "b"), g(1, "c", 450, 300, "d", { home_shield_pts: 1 })]);
check("ladder: shield points count (and are shown separately)", lad.find((x) => x.teamId === "c")?.ladderPoints === 5 && lad.find((x) => x.teamId === "c")?.shieldPoints === 1 && lad[0].teamId === "c");
// a and c both 4 points, a has more points for; c holds the shield with the tie-break on
const tie = [g(1, "a", 600, 400, "b", { shield_holder_after: "c" }), g(1, "c", 450, 300, "d", { shield_holder_after: "c" })];
check("tie-break off: level teams go on points for", buildLadder(["a", "b", "c", "d"], tie.map((m) => ({ ...m, shield_holder_after: null })))[0].teamId === "a");
check("tie-break on: level on points, the holder ranks higher", buildLadder(["a", "b", "c", "d"], tie)[0].teamId === "c");
check("tie-break never beats more ladder points", buildLadder(["a", "b", "c", "d"], [g(1, "a", 600, 400, "c", { shield_holder_after: "c" })])[0].teamId === "a");
check("tie-break uses the holder after the latest game", tieBreakHolder([{ week: 1, holder: "x" }, { week: 3, holder: "z" }, { week: 2, holder: "y" }]) === "z" && tieBreakHolder([]) === null);
const rows = [{ id: "a", p: 4, f: 600 }, { id: "c", p: 4, f: 450 }];
check("pages' ladders sort the same way", rows.slice().sort(ladderOrder<typeof rows[number]>("c", (x) => x.id, (x) => x.p, (x) => x.f, () => 0))[0].id === "c");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
