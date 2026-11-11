// Run: npx tsx scripts/tests/weekly-awards.test.ts — weekly crown (top score) and spoon (lowest).
import { weeklyAwards } from "../../lib/league/weeklyAwards";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const r = weeklyAwards([
  { week: 1, teamId: "a", score: 400 },
  { week: 1, teamId: "b", score: 350 },
  { week: 1, teamId: "c", score: 300 },
  { week: 1, teamId: "d", score: 420 },
  { week: 2, teamId: "a", score: 500 },
  { week: 2, teamId: "b", score: 500 }, // tied top
  { week: 2, teamId: "c", score: 280 },
  { week: 2, teamId: "d", score: 280 }, // tied bottom
  { week: 3, teamId: "a", score: 300 }, // only one team: no award
  { week: 4, teamId: "a", score: 300 },
  { week: 4, teamId: "b", score: 300 }, // everyone level: no award
]);

check("week 1 crown to the top score", JSON.stringify(r.weeks[0]?.crown) === '["d"]' && r.weeks[0]?.top === 420);
check("week 1 spoon to the lowest score", JSON.stringify(r.weeks[0]?.spoon) === '["c"]' && r.weeks[0]?.bottom === 300);
check("ties: both get the crown", JSON.stringify(r.weeks[1]?.crown) === '["a","b"]');
check("ties: both get the spoon", JSON.stringify(r.weeks[1]?.spoon) === '["c","d"]');
check("a week with one team or everyone level has no awards", r.weeks.length === 2);
check("latest = the most recent round with awards (they move each week)", r.latest?.week === 2 && JSON.stringify(r.latest?.crown) === '["a","b"]');

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
