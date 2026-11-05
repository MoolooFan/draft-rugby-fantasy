// Run: npx tsx scripts/tests/status.test.ts — reading team lists / injury lists and matching names.
// Uses small made-up articles in the same layout as the official ones.
import { injuryStatus, parseInjuryList, parseTeamLists, splitInjury } from "../../lib/status/articles";
import { matchName, type MatchPlayer } from "../../lib/status/match";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const teamsHtml = `
<h2>ACT Brumbies v NSW Waratahs</h2>
<p>FRI 27 MAR: GIO Stadium, Canberra (19:35)</p>
<p><strong>BRUMBIES (1-15): </strong>Ann One, Bob Two (c), Cal Three</p>
<p><strong>Replacements:</strong> Dee Four, Eli Fai&rsquo;fa</p>
<p><strong>WARATAHS (1-15):</strong> Fay Five, Gus Six</p>
<p><strong>Replacements:</strong> Hal Seven</p>
<p><strong>Referee: </strong>Someone</p>`;
const injuryHtml = `
<h2>Super Rugby Pacific Round Seven Injury/Unavailability List</h2>
<h2><span><span>Queensland Reds</span></span></h2>
<ul><li><span>Ivy Eight (knee, season)</span></li><li><span>Jo Nine (concussion)</span></li><li><span>Kit Ten</span></li></ul>`;

const lists = parseTeamLists(teamsHtml);
check("two teams read", lists.length === 2 && lists[0].team === "BRU" && lists[1].team === "WAR");
check("starting XV names, captain marker removed", JSON.stringify(lists[0].starting) === JSON.stringify(["Ann One", "Bob Two", "Cal Three"]));
check("replacements, curly apostrophe kept", lists[0].replacements[1] === "Eli Fai’fa");
const inj = parseInjuryList(injuryHtml);
check("injury list team from a long name", inj.length === 1 && inj[0].team === "RED");
check("injury + timeframe", injuryStatus(inj[0].players[0]) === "Knee - Season");
check("injury without timeframe gets TBC", injuryStatus(inj[0].players[1]) === "Concussion - TBC");
// the many ways teams write injuries all come out the same shape
const std = (inner: string) => injuryStatus({ name: "x", ...splitInjury(inner) });
for (const [inner, want] of [
  ["knee/season", "Knee - Season"], ["Knee, Season", "Knee - Season"], ["Hamstring/ 6-8 weeks", "Hamstring - 6-8 weeks"],
  ["concussion 1-2 weeks", "Concussion - 1-2 weeks"], ["foot/4weeks", "Foot - 4 weeks"], ["calf/1 weeks", "Calf - 1 week"],
  ["ankle/Rd 12", "Ankle - Round 12"], ["hamstring/rnd 8-10", "Hamstring - Rounds 8-10"], ["HIA", "Concussion - TBC"],
  ["head knock", "Concussion - TBC"], ["nkle", "Ankle - TBC"], ["concussion/ min 12 days", "Concussion - 12+ days"],
  ["birth of first child", "Paternity leave - TBC"], ["resting policy", "Rested - TBC"], ["ACL/season", "ACL - Season"],
  ["foot - integrating back into team units this week", "Foot - Returning"], ["shoulder/medium term", "Shoulder - Medium term"],
  ["head injury/return to play protocols", "Concussion - TBC"], ["hamstring tightness", "Hamstring - TBC"],
] as const) check(`"${inner}" -> "${want}"`, std(inner) === want, std(inner));
check("no reason given = Out", injuryStatus(inj[0].players[2]) === "Out");

const players: MatchPlayer[] = [
  { id: "E.Faifa", firstName: "Eli", lastName: "Fai'fa", teamCode: "BRU" },
  { id: "P.Ahki", firstName: "Pita", lastName: "Ahki", teamCode: "BLU" },
  { id: "N.AhKuoi", firstName: "Naitoa", lastName: "Ah Kuoi", teamCode: "CHI" },
  { id: "T.Smith", firstName: "Tom", lastName: "Smith", teamCode: "CHI" },
  { id: "T.Smith2", firstName: "Tim", lastName: "Smith", teamCode: "CRU" },
  { id: "M.Moved", firstName: "Max", lastName: "Moved", teamCode: "HUR" },
];
const m = (name: string, team: string) => matchName(name, team, players);
const id = (r: ReturnType<typeof matchName>) => (r.kind === "match" ? r.player.id : `flag:${r.suggestion?.id ?? "-"}`);
check("curly vs straight apostrophe", id(m("Eli Fai’fa", "BRU")) === "E.Faifa");
check("misspelling is flagged with a suggestion", id(m("Pita Akhi", "BLU")) === "flag:P.Ahki");
check("extra first name still matches", id(m("Seuseu Naitoa Ah Kuoi", "CHI")) === "N.AhKuoi");
check("short first name matches (Thomas/Tom)", id(m("Thomas Smith", "CHI")) === "T.Smith");
check("same surname in another team isn't confused", id(m("Tim Smith", "CHI")) !== "T.Smith2");
check("player named for another team is flagged", id(m("Max Moved", "BLU")) === "flag:M.Moved");
check("unknown player is flagged without a suggestion", id(m("Nobody Atall", "BLU")) === "flag:-");

console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
