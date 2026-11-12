// Run: npx tsx scripts/tests/power.test.ts — weekly power rankings (lib/league/powerRankings.ts).
import { bestXvProjection, powerRankings } from "../../lib/league/powerRankings";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// a full squad: 2 of each position (one good, one poor), and a utility back
const POS = ["PR", "PR", "HO", "LK", "LK", "LF", "LF", "LF", "HB", "FH", "CE", "CE", "OB", "OB", "OB"];
const squad = [
  ...POS.map((pos, i) => ({ id: `good${i}`, posAbbrev: pos })),
  ...POS.map((pos, i) => ({ id: `poor${i}`, posAbbrev: pos })),
  { id: "util", posAbbrev: "OB", secondaryPosAbbrev: "FH" },
];
const proj = (id: string) => (id.startsWith("good") ? 30 : id === "util" ? 50 : 10);
// best XV: util (50) takes a back spot it can play, the other 14 spots the "good" players (30 each)
const best = bestXvProjection(squad, proj);
check("best XV picks the best player for every spot it can (and the captain doubles the best)", best === 14 * 30 + 50 + 50, String(best));
check("no props: those spots stay empty (worth 0)", bestXvProjection(squad.filter((p) => p.posAbbrev !== "PR"), proj) === 12 * 30 + 50 + 50);

// rankings
const rows = powerRankings({
  teamIds: ["a", "b", "c"],
  scores: [
    { teamId: "a", week: 1, score: 500 }, { teamId: "b", week: 1, score: 400 }, { teamId: "c", week: 1, score: 300 },
    { teamId: "a", week: 2, score: 400 }, { teamId: "b", week: 2, score: 400 }, { teamId: "c", week: 2, score: 400 },
    { teamId: "a", week: 3, score: 400 }, { teamId: "b", week: 3, score: 400 }, { teamId: "c", week: 3, score: 400 },
    { teamId: "a", week: 4, score: 300 }, { teamId: "b", week: 4, score: 400 }, { teamId: "c", week: 4, score: 500 },
  ],
  rosterProjection: { a: 400, b: 400, c: 400 },
});
check("same season total and rosters: the better last 3 rounds ranks higher (c)", rows[0].teamId === "c", JSON.stringify(rows.map((r) => [r.teamId, r.score])));
check("scores sit around 100 (average)", Math.abs(rows.reduce((x, r) => x + r.score, 0) / 3 - 100) < 1);
const pre = powerRankings({ teamIds: ["a", "b"], scores: [], rosterProjection: { a: 450, b: 350 } });
check("before round 1: roster strength only", pre[0].teamId === "a" && pre[0].seasonAvg === null);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
