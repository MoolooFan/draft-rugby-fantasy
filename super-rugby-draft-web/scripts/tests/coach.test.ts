// Run: npx tsx scripts/tests/coach.test.ts — the AI coach's fact sheet and note handling (lib/coach).
import { ageOn, buildFacts, gameLine, hisSpread, keyStatAverages, notePoints, pointsProfile, repeatability, type CoachFactsInput, type CoachGame } from "../../lib/coach/facts";
import { cleanNote, coachSystemPrompt, coachUserMessage, COACH_NOTE_SCHEMA } from "../../lib/coach/prompt";
import { STANDARD_SCORING } from "../../lib/scoring";
import { allowedText, pointsAllowed, posGroup, type Appearance } from "../../lib/coach/matchups";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// repeatability (from the projections' trust in each stat)
check("tackles and metres repeat; tries are streaky; intercepts / cards mostly luck",
  repeatability("tackles") === "very repeatable" && repeatability("metresGained") === "very repeatable" && repeatability("tries") === "streaky"
  && repeatability("interceptions") === "mostly luck" && repeatability("yellowCards") === "mostly luck");
check("his own spread: steady / big swings / too few games or a rare stat", hisSpread([10, 11, 9, 10]) === "steady" && hisSpread([0, 3, 0, 4]) === "big swings" && hisSpread([10, 12, 9]) === null && hisSpread([0, 0, 1, 0]) === null);

// points profile
const prof = pointsProfile([20, 20, 20, 20])!;
check("steady scorer: consistent, no booms or busts", prof.consistency === "consistent" && prof.boomRate === 0 && prof.bustRate === 0 && prof.average === 20);
const wild = pointsProfile([5, 40, 6, 38, 4, 45])!;
check("wild scorer: boom or bust, with boom and bust rates", wild.consistency === "boom or bust" && wild.boomRate === 50 && wild.bustRate === 50, JSON.stringify(wild));
check("no games: no profile; two games: too few to tell", pointsProfile([]) === null && pointsProfile([10, 30])!.consistency === "too few games to tell");

// age
check("age on a date (birthday not yet reached)", ageOn("1995-04-20", Date.parse("2027-03-01")) === 31 && ageOn("1995-04-20", Date.parse("2027-04-20")) === 32 && ageOn(null, Date.now()) === null);

// games
const g = (round: number, c: Record<string, number>, opp = "Chiefs", home: boolean | null = true): CoachGame => ({ round, label: `Round ${round}`, opp, home, counts: c, listed: "starting" });
const games = [
  g(1, { minutesPlayed: 80, tackles: 12, metresGained: 40, tries: 0 }),
  g(2, { minutesPlayed: 80, tackles: 10, metresGained: 55, tries: 2 }, "Blues", false),
  g(3, { minutesPlayed: 0 }),
];
const line = gameLine(games[1], false, STANDARD_SCORING);
check("game line: opponent, minutes, points and stats", line.startsWith("Round 2 v Blues (A): 80 min,") && line.includes("2 Tries") && line.includes("10 Tackles"), line);
check("game line: didn't play", gameLine(games[2], false, STANDARD_SCORING).includes("did not play"));
const avg = keyStatAverages(games);
check("key stat averages over games played only", avg.Tackles?.perGame === 11 && avg.Tries?.perGame === 1 && !("Intercepts" in avg), JSON.stringify(avg));

// the whole fact sheet
const input: CoachFactsInput = {
  kind: "post_game",
  season: 2027,
  nowMs: Date.parse("2027-03-10"),
  rules: STANDARD_SCORING,
  player: { name: "Test Player", team: "Hurricanes", positions: "LF", posAbbrev: "LF", draftRank: 40, expectedRole: "starter", kickOrder: null, status: "Starting - #7", birthDate: "1999-01-01", international: "All Blacks", restNotes: "2 rest weeks", injuryNotes: null },
  games: games.slice(0, 2),
  lastSeasonGames: [g(1, { minutesPlayed: 60, tackles: 8 })],
  next: { label: "Round 3", opp: "Crusaders", home: true, oppAllows: "loose forwards score 34 pts per 80 minutes against them (league average 31.1; the most of 11 teams)", projection: { pts: 18.5, low: 9, high: 27, role: "starting", kicker: false } },
  remaining: [{ label: "Round 4", opp: "Reds", home: false, oppAllows: null }],
  finalsWeeks: [{ label: "Round 16", opp: "Force", home: true, oppAllows: null }],
  teammates: [{ name: "Other Flanker", positions: "LF", status: "Knee - 4 weeks" }],
  matchupGroup: "LF",
  thisGame: { ...games[1], teamScore: 31, oppScore: 24, projected: 15 },
  notes: ["2027-03-01: plays openside this year"],
  previous: [{ kind: "outlook", label: "Season", headline: "A workhorse to rely on" }],
};
const facts = buildFacts(input) as Record<string, Record<string, unknown>>;
check("fact sheet: player (age, international, rest), this season, team, next game, finals, teammates, notes",
  facts.player.age === 28 && facts.player.international === "All Blacks" && !!facts.stats2027.fantasyPoints && String(facts.stats2026.note).includes("2026") && !("team" in facts) && String((facts.nextGame as Record<string, unknown>).game).includes("loose forwards score")
  && String((facts.nextGame as Record<string, unknown>).game).includes("Crusaders") && (facts.fantasyFinalsWeeks as unknown as string[]).length === 1
  && (facts.teammatesSamePositionWithNews as unknown as string[])[0].includes("Knee") && (facts.latestNews as unknown as string[]).length === 1);
check("fact sheet: this game with result and how repeatable each stat is",
  String((facts.thisGame as Record<string, unknown>).result) === "Hurricanes 31 - 24 Blues" && "Tries" in ((facts.thisGame as Record<string, unknown>).howRepeatable as object));

check("fact sheet: never mentions the commissioner (Ethan, 27 Nov 2026)", !JSON.stringify(facts).toLowerCase().includes("commissioner") && !coachSystemPrompt(STANDARD_SCORING).replace(/no "the commissioner"/, "").toLowerCase().includes("commissioner"));
check("fact sheet: no games yet this season says so", String((buildFacts({ ...input, kind: "outlook", games: [], thisGame: null }) as Record<string, Record<string, unknown>>).stats2027.note).includes("no games yet"));
const np = notePoints(input);
check("note points: after a game = next game's projection + what he scored", np.projected === 18.5 && np.scored != null && np.scored > 0);
check("note points: other updates = this week's projection; outlooks none",
  notePoints({ ...input, kind: "team_list" }).projected === 18.5 && notePoints({ ...input, kind: "team_list" }).scored === null && notePoints({ ...input, kind: "outlook" }).projected === null);

// points allowed by position (lib/coach/matchups.ts)
check("jersey -> position: #7 loose forward, #12 centre, bench #18 uses his listed position",
  posGroup("LK", "Starting - #7") === "LF" && posGroup("OB", "Starting - #12") === "CE" && posGroup("PR", "Bench - #18") === "PR" && posGroup("HB", null) === "HB" && posGroup("XX", null) === null);
{
  const apps: Appearance[] = [];
  // BLU leak points to outside backs, CHI to loose forwards; 4 games each, 80 minutes per starter
  for (let gm = 1; gm <= 4; gm++) {
    apps.push({ opp: "BLU", game: gm, group: "OB", points: 90, minutes: 240 }, { opp: "BLU", game: gm, group: "LF", points: 45, minutes: 240 });
    apps.push({ opp: "CHI", game: gm, group: "OB", points: 45, minutes: 240 }, { opp: "CHI", game: gm, group: "LF", points: 90, minutes: 240 });
  }
  const al = pointsAllowed(apps, { priorGames: 0 });
  check("points allowed: per 80 minutes, ranked (1 = gives up the most)",
    al.get("BLU")!.get("OB")!.per80 === 30 && al.get("BLU")!.get("OB")!.rank === 1 && al.get("CHI")!.get("LF")!.rank === 1 && al.get("CHI")!.get("OB")!.rank === 2 && al.get("BLU")!.get("OB")!.leagueAverage === 22.5);
  const mixed = pointsAllowed(apps, { priorGames: 4 });
  check("points allowed: mixed with the league average early on", mixed.get("BLU")!.get("OB")!.per80 === 26.3, String(mixed.get("BLU")!.get("OB")!.per80));
  // a bench hooker's 20 minutes count as a quarter of a game
  const hk = pointsAllowed([{ opp: "RED", game: 1, group: "HO", points: 40, minutes: 60 }, { opp: "RED", game: 1, group: "HO", points: 10, minutes: 20 }], { priorGames: 0 });
  check("points allowed: starter + bench hooker = one full game", hk.get("RED")!.get("HO")!.per80 === 50);
  check("points allowed text", allowedText(al.get("BLU")!.get("OB"), "OB") === "outside backs score 30 pts per 80 minutes against them (league average 22.5; the most of 2 teams)"
    && allowedText(al.get("BLU")!.get("LF"), "LF")!.includes("the fewest"));
}

check("fact sheet: how much the matchup numbers mean for his position",
  facts.matchupReliability as unknown as string === "For loose forwards, the matchup numbers are mostly chance."
  && String((buildFacts({ ...input, matchupGroup: "OB" }) as Record<string, unknown>).matchupReliability).includes("a real pattern")
  && (buildFacts({ ...input, matchupGroup: null }) as Record<string, unknown>).matchupReliability === null);
check("system prompt: matchups only when relevant", coachSystemPrompt(STANDARD_SCORING).includes("You don't have to mention matchups"));

// prompt and notes
const sys = coachSystemPrompt(STANDARD_SCORING);
check("system prompt has scoring, what to weigh up, and the no-invention rule", sys.includes("Tries") && sys.includes("repeatable") && sys.includes("Never invent"));
check("system prompt is the same every time (cacheable)", sys === coachSystemPrompt(STANDARD_SCORING));
check("user message: the task then the fact sheet", coachUserMessage("post_game", { a: 1 }).includes("FANTASY EVALUATION") && coachUserMessage("outlook", {}).includes("SEASON OUTLOOK"));
check("schema: every field required, nothing extra", COACH_NOTE_SCHEMA.required.length === Object.keys(COACH_NOTE_SCHEMA.properties).length && COACH_NOTE_SCHEMA.additionalProperties === false);
const n = cleanNote({ headline: "  Big game  ", body: "He scored twice.", next_week: "", verdict: "nonsense", trend: "sideways", factors: ["a", "b", "c", "d", "e"] });
check("note cleaned: trimmed, unknown verdict -> monitor, unknown trend -> steady, 4 factors max", !!n && n.headline === "Big game" && n.verdict === "monitor" && n.trend === "steady" && n.factors.length === 4);
check("empty note rejected", cleanNote({ headline: "", body: "x" }) === null && cleanNote(null) === null);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
