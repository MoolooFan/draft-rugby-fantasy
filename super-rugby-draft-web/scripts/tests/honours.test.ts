// Run: npx tsx scripts/tests/honours.test.ts — season honours for the championship stars (E8).
import { seasonHonours, type HonourMatchup } from "../../lib/league/honours";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const g = (kind: string, key: string | null, h: string, a: string | null, hs: number, as: number | null, extra: Partial<HonourMatchup> = {}): HonourMatchup => ({
  kind, playoff_key: key, decides: null, status: "final", home_team_id: h, away_team_id: a, home_score: hs, away_score: as,
  winner_team_id: as == null ? null : hs > as ? h : as > hs ? a : null, ...extra,
});
const teams = ["A", "B", "C", "D", "E"];
const regular = [
  g("regular", null, "A", "B", 500, 400), g("regular", null, "C", "D", 450, 300), g("regular", null, "E", null, 350, null),
  g("regular", null, "A", "C", 480, 470), g("regular", null, "B", "E", 420, 300), g("regular", null, "D", null, 200, null),
];
// ladder: A 8, C 4 (920), B 4 (820), E 0 (650), D 0 (500)

const finals = [
  ...regular,
  g("finals", "SF1", "A", "B", 400, 450),
  g("finals", "SF2", "C", "E", 500, 300),
  g("finals", "GF", "B", "C", 520, 510, { decides: "champion" }),
  g("consolation", "WS", "E", "D", 300, 250, { decides: "spoon" }),
];
const h = seasonHonours(teams, finals)!;
const place = (t: string) => h.find((x) => x.teamId === t)?.place;
check("grand final winner is champion", place("B") === "champion");
check("grand final loser is runner-up", place("C") === "runner_up");
check("semi-final losers are semi-finalists", place("A") === "semi_finalist" && place("E") === "semi_finalist");
check("spoon game loser gets the wooden spoon", place("D") === "wooden_spoon");

const withThird = [...finals.filter((m) => m.playoff_key !== "WS"), g("finals", "3P", "A", "E", 410, 380)];
const h3 = seasonHonours(teams, withThird)!;
check("3rd place playoff winner is third", h3.find((x) => x.teamId === "A")?.place === "third");
check("no spoon game: bottom of the ladder", h3.find((x) => x.teamId === "D")?.place === "wooden_spoon");

const noFinals = seasonHonours(teams, regular)!;
check("no finals: ladder top is champion, second runner-up", noFinals.find((x) => x.place === "champion")?.teamId === "A" && noFinals.find((x) => x.place === "runner_up")?.teamId === "C");

check("not finished: nothing yet", seasonHonours(teams, [...regular, { ...g("finals", "GF", "A", "C", 0, 0, { decides: "champion" }), status: "scheduled", winner_team_id: null }]) === null);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
