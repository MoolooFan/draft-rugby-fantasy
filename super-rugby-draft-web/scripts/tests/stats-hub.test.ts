// Run: npx tsx scripts/tests/stats-hub.test.ts — Stats Hub / player comparison numbers (lib/players/statsHub.ts).
import { aggregatePlayer, better, roundsForRange, roundsWithStats, statValue, STAT_LABELS, STAT_GROUPS, COUNTING_STATS } from "../../lib/players/statsHub";
import { STANDARD_SCORING, STATS } from "../../lib/scoring";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// page-style stat rows (as /api/players/round-stats sends them)
const row = (round: number, s: Record<string, number>) => ({ round, playerId: "p1", ...Object.fromEntries(STATS.map((d) => [d.header, s[d.key] ?? 0])) });
const rows = [
  row(1, { minutesPlayed: 80, tries: 1, tackles: 10, tacklesMissed: 2 }),
  row(2, { minutesPlayed: 0 }), // named, didn't play
  row(3, { minutesPlayed: 40, tries: 0, tackles: 6, tacklesMissed: 0 }),
  row(4, { minutesPlayed: 80, tries: 2, tackles: 4, tacklesMissed: 1 }),
];
const wing = { posAbbrev: "OB" };

check("rounds with stats skip rounds nobody played", JSON.stringify(roundsWithStats(rows)) === "[1,3,4]");
check("ranges: whole season / last 2 / one round", roundsForRange({ kind: "season" }, [1, 3, 4]) === null
  && JSON.stringify([...roundsForRange({ kind: "last", n: 2 }, [1, 3, 4])!]) === "[3,4]"
  && JSON.stringify([...roundsForRange({ kind: "round", round: 3 }, [1, 3, 4])!]) === "[3]");

const all = aggregatePlayer(rows, wing, STANDARD_SCORING, null);
check("whole season: 3 games, 200 minutes, 3 tries, 20 tackles", all.games === 3 && all.minutes === 200 && all.counts.tries === 3 && all.counts.tackles === 20, JSON.stringify({ g: all.games, m: all.minutes }));
check("game log oldest first, a game per round played", all.log.map((g) => g.round).join(",") === "1,3,4");
const last2 = aggregatePlayer(rows, wing, STANDARD_SCORING, new Set([3, 4]));
check("last 2 rounds only", last2.games === 2 && last2.counts.tries === 2 && last2.counts.tackles === 10);
check("fantasy points add up the games", Math.abs(all.points - all.log.reduce((s, g) => s + g.points, 0)) < 0.01);

check("per game / total / per 80", statValue(all, "tackles", "game")!.toFixed(2) === "6.67" && statValue(all, "tackles", "total") === 20 && statValue(all, "tackles", "per80") === 8);
check("games is always the count; minutes per game; no minutes per 80", statValue(all, "games", "game") === 3 && Math.round(statValue(all, "minutesPlayed", "game")!) === 67 && statValue(all, "minutesPlayed", "per80") === null);
check("no games: nothing to show", statValue(aggregatePlayer([], wing, STANDARD_SCORING, null), "tries", "total") === null);

check("better: more tries wins", better("tries", 3, 1) === "a" && better("tries", 1, 3) === "b");
check("better: fewer missed tackles / cards wins", better("tacklesMissed", 1, 3) === "a" && better("yellowCards", 2, 0) === "b");
check("level or missing: no highlight", better("tries", 2, 2) === null && better("tries", null, 2) === null);

check("every stat has a label and a group (minutes has its own column)", STATS.every((s) => !!STAT_LABELS[s.key])
  && COUNTING_STATS.every((k) => STAT_GROUPS.some((g) => g.keys.includes(k))) && !COUNTING_STATS.includes("minutesPlayed"));

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
