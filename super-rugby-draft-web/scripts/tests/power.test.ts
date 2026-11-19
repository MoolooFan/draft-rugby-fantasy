// Run: npx tsx scripts/tests/power.test.ts — best possible team by projection (lib/league/powerRankings.ts).
import { bestXvProjection } from "../../lib/league/powerRankings";

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

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
