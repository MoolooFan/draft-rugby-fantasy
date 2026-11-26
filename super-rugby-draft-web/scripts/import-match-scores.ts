// scripts/import-match-scores.ts
// Saves real Super Rugby final scores from the official fantasy game into match_results
// (lib/results/matchScores.ts). The site's cron does this by itself after each game; this is for
// filling in a whole season at once or checking what the feed has. Only games that match the
// season's fixtures file are saved. Safe to run again (saves only new or changed scores).
//
// Run (from super-rugby-draft-web):  npx tsx scripts/import-match-scores.ts [--season=2026] [--dry]
//   online 2027 database:            npx tsx scripts/import-match-scores.ts --live --confirm=<project address>
import { scriptDb } from "./lib/db";
import { currentSeasonYear, getSeason } from "../lib/season";
import { FANTASY_ROUNDS_URL, getJson } from "../lib/status/fantasyFeed";
import { feedGames, importMatchScores, planMatchScores } from "../lib/results/matchScores";

const { db } = scriptDb();
const season = Number(process.argv.find((a) => a.startsWith("--season="))?.slice(9)) || currentSeasonYear();
const dry = process.argv.includes("--dry");

(async () => {
  if (dry) {
    const games = feedGames(await getJson(FANTASY_ROUNDS_URL));
    const { scores, unmatched } = planMatchScores(games, getSeason(season).fixtures);
    console.log(`${season}: the feed has ${games.length} finished games; ${scores.length} match the fixtures, ${unmatched.length} don't.`);
    for (const s of scores.slice(0, 5)) console.log(`  Round ${s.realRound}: ${s.homeTeam} ${s.homeScore} - ${s.awayScore} ${s.awayTeam}`);
    if (unmatched.length) console.log("  Not matched:", unmatched.slice(0, 10).join("; "));
    return;
  }
  const r = await importMatchScores(db, season, Date.now(), { force: true });
  console.log(`${season}: saved ${r.saved} new or changed scores.${r.unmatched.length ? ` ${r.unmatched.length} feed games didn't match a fixture: ${r.unmatched.slice(0, 10).join("; ")}` : ""}`);
})().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
