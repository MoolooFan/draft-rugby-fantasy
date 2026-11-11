// Run: npx tsx scripts/tests/recap.test.ts — the weekly recap (E7).
import { buildRecap, type RecapMatchup, type RecapWeekResult } from "../../lib/league/recap";
import { STARTER_SLOTS, type Lineup } from "../../lib/scoring/week";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const reg = (w: number, h: string, a: string | null, hs: number | null, as: number | null, status = "final"): RecapMatchup => ({
  kind: "regular", status, label: null, weeks: [w], home_team_id: h, away_team_id: a, home_score: hs, away_score: as,
});

// lineup: 15 starters p1..p15, bench b1..b5
const lineup: Lineup = {};
STARTER_SLOTS.forEach((s, i) => (lineup[s] = { id: `p${i + 1}` } as never));
const pts: Record<string, number> = {};
for (let i = 1; i <= 15; i++) pts[`p${i}`] = 20 + i; // p1 = 21 (lowest starter) ... p15 = 35
pts["b1"] = 40; // a sub who came on and scored the most

const matchups: RecapMatchup[] = [
  reg(1, "A", "B", 300, 400),
  reg(1, "C", "D", 350, 200),
  reg(2, "A", "C", 450, 300),
  reg(2, "B", "D", 390, 380),
  reg(3, "A", "D", null, null, "scheduled"),
  reg(3, "B", "C", null, null, "scheduled"),
];
const res = (w: number, t: string, score: number, extra: Partial<RecapWeekResult> = {}): RecapWeekResult => ({
  week: w, team_id: t, score, final_lineup: null, player_points: null, captain_used_id: null, ...extra,
});
const results: RecapWeekResult[] = [
  res(1, "A", 300), res(1, "B", 400), res(1, "C", 350), res(1, "D", 200),
  res(2, "A", 450, { final_lineup: lineup, player_points: pts, captain_used_id: "p15" }), res(2, "B", 390), res(2, "C", 300), res(2, "D", 380),
];

const r = buildRecap({ week: 2, myTeamId: "A", teamIds: ["A", "B", "C", "D"], matchups, results, playerName: (id) => id.toUpperCase() });

check("matchup: win 450 v 300 against C", r.matchup?.kind === "game" && r.matchup.result === "win" && r.matchup.myScore === 450 && r.matchup.oppScore === 300 && r.matchup.opponentId === "C");
check("best player: the sub who scored 40", r.best?.id === "b1" && r.best.points === 40);
check("biggest dud: lowest-scoring starter", r.dud?.id === "p1" && r.dud.points === 21);
check("captain marked", buildRecap({ week: 2, myTeamId: "A", teamIds: ["A", "B", "C", "D"], matchups, results, playerName: (x) => x }).dud?.captain === false);
check("crown: A (450)", JSON.stringify(r.crown?.teamIds) === '["A"]' && r.crown?.score === 450);
check("spoon: C (300)", JSON.stringify(r.spoon?.teamIds) === '["C"]' && r.spoon?.score === 300);
// after week 1: B 4pts 400, C 4pts 350, A 0 300, D 0 200 -> A 3rd
// after week 2: A 4 (750), B 8, C 4 (650), D 0 -> B 1st, A 2nd (more points for than C)
check("ladder: 3rd -> 2nd", r.ladder?.before === 3 && r.ladder?.after === 2 && r.ladder?.teams === 4, JSON.stringify(r.ladder));
check("next opponent: D in week 3", r.next?.opponentId === "D" && r.next?.week === 3);

const r1 = buildRecap({ week: 1, myTeamId: "A", teamIds: ["A", "B", "C", "D"], matchups, results, playerName: (id) => id });
check("week 1: loss, no 'before' ladder spot", r1.matchup?.kind === "game" && r1.matchup.result === "loss" && r1.ladder?.before === null);
check("week 1: no player points saved -> no best / dud", r1.best === null && r1.dud === null);

const bye = buildRecap({ week: 1, myTeamId: "E", teamIds: ["A", "E"], matchups: [reg(1, "E", null, 310, null)], results: [res(1, "E", 310)], playerName: (x) => x });
check("bye week", bye.matchup?.kind === "bye" && bye.matchup.myScore === 310);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
