// Run: npx tsx scripts/tests/shield.test.ts — the Shield (lib/league/shield.ts).
import { cleanShieldName, computeShield, nextShieldGame, shieldRecap, type ShieldGame, type ShieldSeason } from "../../lib/league/shield";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// Ethan's 2025 league (home team first), replayed as if it were 2027
const R: Array<[number, string, number, number, string]> = [
  [1, "noah", 527, 432, "dt"], [1, "josh", 560, 496, "hh"],
  [2, "hh", 405, 623, "noah"], [2, "josh", 552, 535, "dt"],
  [3, "noah", 367, 504, "josh"], [3, "hh", 448, 436, "dt"],
  [4, "dt", 480, 658, "noah"], [4, "hh", 442, 618, "josh"],
  [5, "noah", 451, 372, "hh"], [5, "dt", 631, 426, "josh"],
  [6, "josh", 385, 615, "noah"], [6, "dt", 485, 501, "hh"],
  [7, "noah", 341, 502, "dt"], [7, "josh", 451, 407, "hh"],
  [8, "hh", 436, 408, "noah"], [8, "josh", 424, 449, "dt"],
  [9, "noah", 431, 368, "josh"], [9, "hh", 372, 469, "dt"],
  [10, "dt", 600, 546, "noah"], [10, "hh", 399, 543, "josh"],
  [11, "noah", 506, 687, "hh"], [11, "dt", 608, 416, "josh"],
  [12, "josh", 353, 560, "noah"], [12, "dt", 502, 409, "hh"],
  [13, "noah", 502, 579, "dt"], [13, "josh", 255, 522, "hh"],
  [14, "hh", 298, 497, "noah"], [14, "josh", 340, 602, "dt"],
];
const team = (id: string, season: number) => ({ id: `${id}${season}`, owner: id, name: id.toUpperCase() });
const games = (season: number, rows = R, finalUpTo = 99): ShieldGame[] =>
  rows.map(([w, h, hs, as, a]) => ({ week: w, homeTeamId: `${h}${season}`, awayTeamId: `${a}${season}`, homeScore: hs, awayScore: as, final: w <= finalUpTo }));
const s1: ShieldSeason = { leagueId: "L1", season: 2027, enabled: true, teams: ["noah", "dt", "josh", "hh"].map((t) => team(t, 2027)), games: games(2027) };

const r1 = computeShield([s1]);
check("round 1: highest score (Josh 560) takes it", r1.events[0]?.kind === "awarded" && r1.events[0]?.holderTeamId === "josh2027");
check("Josh defends at home in round 2", r1.events[1]?.kind === "defended" && r1.events[1]?.week === 2);
check("Noah wins it away at Josh in round 6", r1.events.some((e) => e.week === 6 && e.kind === "won" && e.holderTeamId === "noah2027"));
check("Disabled Toilets win it away at Noah in round 7", r1.events.some((e) => e.week === 7 && e.kind === "won" && e.holderTeamId === "dt2027"));
check("holder at the end: Disabled Toilets, 3 defences", r1.holder?.teamId === "dt2027" && r1.holder.reign.defences === 3, `${r1.holder?.teamId} ${r1.holder?.reign.defences}`);
check("history: 3 reigns (Josh 1 defence, Noah 0, DT 3)", r1.reigns.map((r) => `${r.owner}:${r.defences}`).join(",") === "josh:1,noah:0,dt:3");
check("away games and byes are never on the line", !r1.events.some((e) => e.week === 8 || e.week === 9 || e.week === 13 || e.week === 14));

// before 2027 doesn't count
check("seasons before 2027 don't count", computeShield([{ ...s1, season: 2026 }]).holder === null);

// ties: most tries, then next round
const tie: ShieldSeason = { ...s1, games: [
  { week: 1, homeTeamId: "noah2027", awayTeamId: "dt2027", homeScore: 500, awayScore: 300, homeTries: 2, awayTries: 1, final: true },
  { week: 1, homeTeamId: "josh2027", awayTeamId: "hh2027", homeScore: 500, awayScore: 300, homeTries: 3, awayTries: 1, final: true },
] };
check("level top score: most tries takes it", computeShield([tie]).holder?.teamId === "josh2027");
const tie2: ShieldSeason = { ...s1, games: [
  { week: 1, homeTeamId: "noah2027", awayTeamId: "dt2027", homeScore: 500, awayScore: 300, homeTries: 2, final: true },
  { week: 1, homeTeamId: "josh2027", awayTeamId: "hh2027", homeScore: 500, awayScore: 300, homeTries: 2, final: true },
  { week: 2, homeTeamId: "hh2027", awayTeamId: "noah2027", homeScore: 610, awayScore: 300, final: true },
  { week: 2, homeTeamId: "dt2027", awayTeamId: "josh2027", homeScore: 400, awayScore: 300, final: true },
] };
check("still level: round 2's top score takes it", computeShield([tie2]).holder?.teamId === "hh2027");
const draw: ShieldSeason = { ...s1, games: [
  { week: 1, homeTeamId: "noah2027", awayTeamId: "dt2027", homeScore: 600, awayScore: 300, final: true },
  { week: 2, homeTeamId: "noah2027", awayTeamId: "josh2027", homeScore: 400, awayScore: 400, final: true },
] };
check("a draw: the holder keeps it (a defence)", computeShield([draw]).holder?.reign.defences === 1);

// next season
const s2teams = ["noah", "dt", "josh", "hh", "sam"].map((t) => team(t, 2028));
const s2: ShieldSeason = { leagueId: "L2", season: 2028, enabled: true, teams: s2teams, games: [
  { week: 1, homeTeamId: "dt2028", awayTeamId: "josh2028", homeScore: 300, awayScore: 290, final: true },
] };
const carry = computeShield([s1, s2]);
check("next season: the holder keeps it and defends in round 1", carry.holder?.teamId === "dt2028" && carry.holder.reign.defences === 4);
const noDt: ShieldSeason = { ...s2, teams: s2teams.filter((t) => t.owner !== "dt"), games: [] };
check("holder doesn't come back: handed to the team before them (Noah)", computeShield([s1, noDt]).holder?.owner === "noah");
const noDtNoah: ShieldSeason = { ...s2, teams: s2teams.filter((t) => t.owner !== "dt" && t.owner !== "noah"), games: [
  { week: 1, homeTeamId: "sam2028", awayTeamId: "josh2028", homeScore: 650, awayScore: 300, final: true },
] };
check("...and if they're gone too: awarded again on round 1's top score", computeShield([s1, noDtNoah]).holder?.owner === "sam" && computeShield([s1, noDtNoah]).holder?.reign.how === "reawarded");
const s3: ShieldSeason = { leagueId: "L3", season: 2029, enabled: true, teams: ["noah", "dt", "josh", "sam"].map((t) => team(t, 2029)), games: [] };
check("DT back the season after missing one: no claim, Sam keeps it", computeShield([s1, noDtNoah, s3]).holder?.owner === "sam");
check("switched off for a season: nothing happens, the holder keeps it", computeShield([s1, { ...s2, enabled: false }]).holder?.reign.defences === 3);

// next shield game: the holder's next home game
const live: ShieldSeason = { ...s1, games: games(2027, R, 10) };
const st = computeShield([live]);
const next = nextShieldGame(live, st.holder?.teamId ?? null);
check("next shield game: DT's next home game (round 11 v Josh)", next?.week === 11 && next.awayTeamId === "josh2027", JSON.stringify(next));

// name
check("name always ends in Shield", cleanShieldName("Ranfurly") === "Ranfurly Shield" && cleanShieldName("the shield") === "the Shield" && cleanShieldName("") === "The Shield");

// weekly recap lines
const ev = computeShield([s1]).events;
const rc = (week: number, me: string, next: { week: number; homeTeamId: string; awayTeamId: string } | null = null, myNextWeek: number | null = null) =>
  shieldRecap({ name: "The Shield", enabled: true, events: ev, week, myTeamId: me, next, myNextWeek });
check("recap: Josh awarded it in round 1", rc(1, "josh2027")?.thisWeek?.kind === "you_awarded");
check("recap: everyone else hears Josh won it in round 1", rc(1, "dt2027")?.thisWeek?.kind === "news_awarded");
check("recap: Noah took it off Josh in round 6", rc(6, "noah2027")?.thisWeek?.kind === "you_won");
check("recap: Josh lost it in round 6", rc(6, "josh2027")?.thisWeek?.kind === "you_lost");
check("recap: DT defended v Josh in round 11; Josh challenged and fell short", rc(11, "dt2027")?.thisWeek?.kind === "you_defended" && rc(11, "josh2027")?.thisWeek?.kind === "you_challenged");
check("recap: next game is a shield defence / challenge", rc(9, "dt2027", { week: 10, homeTeamId: "dt2027", awayTeamId: "noah2027" }, 10)?.next === "defending" && rc(9, "noah2027", { week: 10, homeTeamId: "dt2027", awayTeamId: "noah2027" }, 10)?.next === "challenging");
check("recap: nothing to say = no shield section", rc(9, "hh2027") === null);
check("recap: shield switched off = nothing", shieldRecap({ name: "x", enabled: false, events: ev, week: 6, myTeamId: "noah2027", next: null, myNextWeek: null }) === null);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
