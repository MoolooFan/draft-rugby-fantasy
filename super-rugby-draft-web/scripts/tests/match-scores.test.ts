// Run: npx tsx scripts/tests/match-scores.test.ts — real final scores from the official fantasy
// game's rounds.json (lib/results/matchScores.ts) and putting them on fixtures (lib/fixtures/scores.ts).
import { feedGames, planMatchScores } from "../../lib/results/matchScores";
import { teamCode, withScores } from "../../lib/fixtures/scores";
import type { SeasonFixture } from "../../lib/season";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// the feed's shape (2026's rounds.json)
const game = (status: string, home: string, away: string, hs: number | null, as: number | null, date: string) => ({
  status, homeSquadName: home, awaySquadName: away, homeScore: hs, awayScore: as, date,
});
const feed = [
  {
    number: 1,
    status: "completed",
    tournaments: [
      game("completed", "Highlanders", "Crusaders", 25, 23, "2027-02-13T17:05:00+11:00"),
      game("completed", "NSW Waratahs", "Queensland Reds", 36, 12, "2027-02-13T19:35:00+11:00"),
      game("completed", "Moana Pasifika", "Fijian Drua", 40, 26, "2027-02-14T14:35:00+11:00"), // home/away the other way round to our file
      game("playing", "Blues", "Chiefs", 15, 19, "2027-02-14T17:05:00+11:00"), // not finished
      game("completed", "Western Force", "ACT Brumbies", null, null, "2027-02-14T19:35:00+11:00"), // no score
      game("completed", "Hurricanes", "Blues", 30, 10, "2026-02-14T19:35:00+11:00"), // last season's: no fixture
    ],
  },
];
const fx = (id: string, week: number, home: string, away: string, kickoffAt: string): SeasonFixture => ({ id, week, kickoffAt, homeTeam: home, awayTeam: away, status: "scheduled", homeScore: null, awayScore: null });
const fixtures = [
  fx("a", 1, "Highlanders", "Crusaders", "2027-02-13T17:05:00+11:00"),
  fx("b", 1, "Waratahs", "Reds", "2027-02-13T19:35:00+11:00"),
  fx("c", 1, "Drua", "Moana", "2027-02-14T14:35:00+11:00"),
  fx("d", 1, "Blues", "Chiefs", "2027-02-14T17:05:00+11:00"),
  fx("e", 1, "Force", "Brumbies", "2027-02-14T19:35:00+11:00"),
  fx("f", 9, "Hurricanes", "Blues", "2027-04-17T19:35:00+12:00"),
];

check("team names to codes", teamCode("NSW Waratahs") === "WAR" && teamCode("Moana Pasifika") === "MOA" && teamCode("MOP") === "MOA" && teamCode("CRU") === "CRU" && teamCode("Fijian Drua") === "DRU");

const games = feedGames(feed);
check("only finished games with both scores", games.length === 4, String(games.length));

const { scores, unmatched } = planMatchScores(games, fixtures);
const find = (round: number, home: string) => scores.find((s) => s.realRound === round && s.homeTeam === home);
check("matched to the fixtures", scores.length === 3, JSON.stringify(scores));
check("home win kept", find(1, "HIG")?.homeScore === 25 && find(1, "HIG")?.awayScore === 23);
check("our home team kept, scores swapped to match", find(1, "DRU")?.awayTeam === "MOA" && find(1, "DRU")?.homeScore === 26 && find(1, "DRU")?.awayScore === 40);
check("a game with no fixture that day isn't saved", unmatched.length === 1 && unmatched[0].includes("Hurricanes"), unmatched.join("; "));

// onto the pages' fixtures (fantasy week + realRound)
const pageFixtures = fixtures.map((f) => ({ ...f, realRound: f.week, week: f.week }));
const shown = withScores(pageFixtures, scores);
check("score shown and the game final", shown[0].homeScore === 25 && shown[0].awayScore === 23 && shown[0].status === "final");
check("games without a score unchanged", shown[3] === pageFixtures[3] && shown[4] === pageFixtures[4]);
check("official score wins over the file's", withScores([{ ...pageFixtures[1], homeScore: 12, awayScore: 36, status: "final" }], scores)[0].homeScore === 36);
check("no scores: same list back", withScores(pageFixtures, []) === pageFixtures);

// live scores (Ethan, 27 Nov 2026): games being played, while they're on
const during = Date.parse("2027-02-14T17:45:00+11:00"); // Blues v Chiefs kicked off 40 min ago
const liveGames = feedGames(feed, during);
const bc = liveGames.find((g) => g.homeTeam === "Blues" && g.awayTeam === "Chiefs");
check("live: a game being played (kicked off, not completed) comes in as not final", liveGames.length === 5 && !!bc && bc.final === false && bc.homeScore === 15);
check("live: not before kickoff, and not for a postponed game",
  feedGames([{ number: 1, tournaments: [game("playing", "Blues", "Chiefs", 0, 0, "2027-02-14T17:05:00+11:00")] }], Date.parse("2027-02-14T16:00:00+11:00")).length === 0
  && feedGames([{ number: 1, tournaments: [game("postponed", "Blues", "Chiefs", 0, 0, "2027-02-14T17:05:00+11:00")] }], during).length === 0);
const livePlan = planMatchScores(liveGames, fixtures).scores;
const liveShown = withScores(pageFixtures, livePlan);
check("live: shown with the score and marked live; finished games still final",
  liveShown[3].status === "live" && liveShown[3].homeScore === 15 && liveShown[3].awayScore === 19 && liveShown[0].status === "final");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
