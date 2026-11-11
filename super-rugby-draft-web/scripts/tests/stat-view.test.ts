// Run: npx tsx scripts/tests/stat-view.test.ts — Per game / Total / Per 80 (C1).
import { applyStatView, formatStatView } from "../../lib/players/statView";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

check("total", applyStatView(120, 4, 300, "total") === 120);
check("per game", applyStatView(120, 4, 300, "game") === 30);
check("per 80", applyStatView(120, 4, 320, "per80") === 30);
check("per 80 needs 20+ minutes", applyStatView(10, 1, 19, "per80") === null && applyStatView(10, 1, 20, "per80") === 40);
check("no games: no per game", applyStatView(0, 0, 0, "game") === null);
check("no data: dash", formatStatView(applyStatView(null, 3, 200, "total"), "total") === "–");
check("formatting", formatStatView(12, "total") === "12" && formatStatView(12.5, "total") === "12.5" && formatStatView(7.25, "game") === "7.3");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
