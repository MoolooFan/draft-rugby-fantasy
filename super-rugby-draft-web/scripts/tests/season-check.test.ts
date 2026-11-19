// Run: npx tsx scripts/tests/season-check.test.ts — the Admin page's season checklist (lib/admin/seasonCheck.ts).
import { seasonChecks, type CheckPlayer } from "../../lib/admin/seasonCheck";
import type { SeasonConfig } from "../../lib/season";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const cfg: SeasonConfig = {
  season: 2099,
  fantasyWeeks: [[1], [2]],
  fixtures: [
    { id: "a", week: 1, kickoffAt: "2099-02-01T07:00:00Z", homeTeam: "Blues", awayTeam: "Chiefs" },
    { id: "b", week: 2, kickoffAt: "2099-02-08T07:00:00Z", homeTeam: "Chiefs", awayTeam: "Blues" },
    { id: "c", week: 2, kickoffAt: "soon", homeTeam: "Blues", awayTeam: "Wizards" },
    { id: "c", week: 3, kickoffAt: "2099-02-15T07:00:00Z", homeTeam: "Blues", awayTeam: "Chiefs" },
  ],
};
const squad = (team: string, n: number): CheckPlayer[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${team}${i}`, firstName: team, lastName: `P${i}`, teamCode: team, posAbbrev: ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"][i % 8], draftRank: i + 1 + (team === "CHI" ? 100 : 0), externalId: (team === "CHI" ? 1000 : 0) + i }));
const players = [...squad("BLU", 40), ...squad("CHI", 20), { id: "x", firstName: "Blu", lastName: "P1", teamCode: "BLU", posAbbrev: "LK", draftRank: 1, externalId: 5 }];
const checks = seasonChecks({ season: 2099, cfg, players, photoIds: new Set(["blu0"]), difficultyTeams: ["Blues"], jerseys: { BLU: 1 }, logos: { BLU: 1, CHI: 1 } });
const by = Object.fromEntries(checks.map((c) => [c.id, c]));

check("an unknown team name fails", by["fixture-teams"].status === "fail" && by["fixture-teams"].items?.includes("Wizards") === true);
check("a bad kickoff time fails", by.kickoffs.status === "fail");
check("a repeated fixture id fails", by["fixture-ids"].status === "fail");
check("a round in no fantasy week fails", by.weeks.status === "fail" && by.weeks.items?.some((x) => x.includes("Round 3")) === true);
check("a team playing twice in a week is flagged", by["double-games"].status === "warn" && by["double-games"].items?.some((x) => x.includes("BLU plays 2")) === true);
check("a short squad is flagged", by.squads.status === "warn" && by.squads.items?.some((x) => x.startsWith("CHI: 20")) === true);
check("the same name twice is flagged", by["dup-names"].status === "warn");
check("a shared playfantasyrugby id fails", by["dup-ext"].status === "fail");
check("shared draft ranks are flagged", by.ranks.status === "warn");
check("missing photos are counted", by.photos.status === "warn" && by.photos.detail.startsWith("60 players"), by.photos.detail);
check("a team without a jersey fails", by.jerseys.status === "fail" && by.jerseys.items?.includes("CHI") === true);
check("difficulty ratings saved by team name count", by.difficulty.items?.includes("CHI") === true && !by.difficulty.items?.includes("BLU"));
check("no season settings: one failing check", seasonChecks({ season: 1999, cfg: null, players: [], photoIds: new Set(), difficultyTeams: [], jerseys: {}, logos: {} })[0].status === "fail");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
