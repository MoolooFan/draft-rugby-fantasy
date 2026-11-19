// Run: npx tsx scripts/tests/odds.test.ts — finals / title chances (lib/league/odds.ts).
import { formatOdds, seededRandom, simulateOdds, teamStrengths, type OddsMatchup } from "../../lib/league/odds";
import { buildLeagueSchedule } from "../../lib/league/schedule";
import { cleanBonusRules } from "../../lib/league/bonus";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const teams = ["a", "b", "c", "d", "e", "f"];
const sch = buildLeagueSchedule({ teamIds: teams, weeks: Array.from({ length: 12 }, (_, i) => i + 1), finals: 4 });
const toRows = (): OddsMatchup[] => [
  ...sch.regular.map((g) => ({ kind: "regular", status: "scheduled", weeks: [g.week], home_team_id: g.homeTeamId, away_team_id: g.awayTeamId, home_score: null, away_score: null })),
  ...sch.playoffs.map((g) => ({
    kind: g.bracket, status: "scheduled", weeks: g.weeks, playoff_key: g.key, home_team_id: null, away_team_id: null,
    home_score: null, away_score: null, home_source: g.home, away_source: g.away, decides: g.decides ?? null,
  })),
];
const bonus = cleanBonusRules(null, true);
const run = (rows: OddsMatchup[], proj: Record<string, number>, seed = 7) =>
  simulateOdds({ teamIds: teams, matchups: rows, rosterProjection: proj, finalsSize: 4, bonusRules: bonus, sims: 4000, rng: seededRandom(seed) });
const byId = (odds: ReturnType<typeof run>) => Object.fromEntries(odds.map((o) => [o.teamId, o]));

// before a round is played: rosters only
const even = { a: 400, b: 400, c: 400, d: 400, e: 400, f: 400 };
const o1 = byId(run(toRows(), even));
const sumTitle = teams.reduce((s, t) => s + o1[t].titlePct, 0);
const sumPlayoff = teams.reduce((s, t) => s + o1[t].playoffPct, 0);
check("title chances add up to 100%", Math.abs(sumTitle - 100) < 0.01, sumTitle.toFixed(2));
check("finals chances add up to 4 teams x 100%", Math.abs(sumPlayoff - 400) < 0.01, sumPlayoff.toFixed(2));
check("even rosters: everyone about 1 in 6 for the title", teams.every((t) => Math.abs(o1[t].titlePct - 100 / 6) < 4), teams.map((t) => o1[t].titlePct.toFixed(1)).join(" "));

const strong = { ...even, a: 520, f: 300 };
const o2 = byId(run(toRows(), strong));
check("the strongest roster is the title favourite", teams.every((t) => t === "a" || o2.a.titlePct > o2[t].titlePct));
check("the weakest roster is least likely to make the finals", teams.every((t) => t === "f" || o2.f.playoffPct < o2[t].playoffPct));
check("same numbers for the same seed", JSON.stringify(run(toRows(), strong, 3)) === JSON.stringify(run(toRows(), strong, 3)));

// results so far count: f has won every game (by plenty) through round 8
const played = toRows().map((m) => {
  const w = m.weeks?.[0] ?? 99;
  if (m.kind !== "regular" || w > 8) return m;
  const hs = m.home_team_id === "f" ? 520 : m.away_team_id === "f" ? 380 : 400;
  const as = m.away_team_id === "f" ? 520 : m.home_team_id === "f" ? 380 : 390;
  return { ...m, status: "final", home_score: hs, away_score: as };
});
const st = teamStrengths(teams, played, strong);
check("8 rounds of big scores lift a weak roster's strength above its projection", st.get("f")!.mean > 300 * 1.1, String(st.get("f")!.mean.toFixed(0)));
const o3 = byId(run(played, strong));
check("8 wins from 8 with 4 rounds left: f is certain of the finals", o3.f.clinched && o3.f.playoffPct === 100, JSON.stringify(o3.f));

// the season is over: the finals places are decided
const allPlayed = played.map((m) => (m.kind === "regular" && m.status !== "final" ? { ...m, status: "final", home_score: 400, away_score: 399 } : m));
const o4 = run(allPlayed, strong);
check("after the regular season: exactly 4 teams certain, 2 out", o4.filter((o) => o.clinched).length === 4 && o4.filter((o) => o.eliminated).length === 2);
check("teams out of the finals have no title chance", o4.filter((o) => o.eliminated).every((o) => o.titlePct === 0));

// a decided Grand Final: the winner is 100%
const gf = allPlayed.map((m) => (m.decides === "champion" ? { ...m, status: "final", home_team_id: "a", away_team_id: "b", home_score: 450, away_score: 400, winner_team_id: "a" } : m));
const o5 = byId(run(gf, strong));
check("after the Grand Final: the winner is 100% for the title", o5.a.titlePct === 100 && o5.b.titlePct === 0);

// no finals: the title is the top of the ladder
const noFinals = simulateOdds({ teamIds: teams, matchups: toRows().filter((m) => m.kind === "regular"), rosterProjection: strong, finalsSize: 0, bonusRules: bonus, sims: 2000, rng: seededRandom(1) });
check("no finals: title chances still add up to 100%", Math.abs(noFinals.reduce((s, o) => s + o.titlePct, 0) - 100) < 0.01);

check("formatting", formatOdds(99.8) === ">99%" && formatOdds(0.2) === "<1%" && formatOdds(42.4) === "42%" && formatOdds(99.8, { yes: true }) === "100%" && formatOdds(0, { no: true }) === "0%");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
