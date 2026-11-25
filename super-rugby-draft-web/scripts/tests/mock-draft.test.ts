// Draft strategy (lib/draft/strategy.ts) and the mock draft's computer teams (lib/draft/cpu.ts):
// the strategy's choices, and whole mock drafts with the real player pool from the LOCAL test
// database (read only). Run (from super-rugby-draft-web, Docker + `npx supabase start` running):
//   NODE_OPTIONS=--experimental-websocket npx tsx scripts/tests/mock-draft.test.ts
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { loadSeasonPlayers, type SitePlayer } from "../../lib/players/db";
import { cleanStrategy, isEmptyStrategy, myRanks, strategyChoice, targetProgress, type DraftStrategy } from "../../lib/draft/strategy";
import { cpuPick, draftGrade, draftValues, makePersonality, starterDemand, teamStrength } from "../../lib/draft/cpu";
import { rosterSize, squadFits, squadStartingGaps, STANDARD_SQUAD, TEN_SQUAD, type SquadFormat } from "../../lib/league/squad";
import { teamForPick } from "../../lib/draft/rules";
import { seededRandom } from "../../lib/league/odds";

loadEnvConfig(process.cwd(), true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("This test only runs against the local test database");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// --- strategy, with made-up players
type P = { id: string; posAbbrev: string; secondaryPosAbbrev?: string; draftRank: number };
const pl = (id: string, pos: string, rank: number, pos2?: string): P => ({ id, posAbbrev: pos, secondaryPosAbbrev: pos2, draftRank: rank });
const pool: P[] = [pl("ob1", "OB", 1), pl("lf1", "LF", 2), pl("lk1", "LK", 3), pl("ho1", "HO", 4), pl("lf2", "LF", 5), pl("fh1", "FH", 6, "CE"), pl("lk2", "LK", 7)];

const junk = cleanStrategy({ rounds: ["LF", "XX", "", "BK", "", ""], targets: { LF: 4, HO: 99, ZZ: 3, PR: -2 }, avoid: ["a", "a", "", 5], ranking: "nope" });
check("strategy: junk is cleaned", JSON.stringify(junk) === JSON.stringify({ rounds: ["LF", "", "", "BK"], targets: { HO: 15, LF: 4 }, avoid: ["a", "5"], ranking: [] }), JSON.stringify(junk));
check("strategy: empty", isEmptyStrategy(cleanStrategy({})) && !isEmptyStrategy(junk));

// the page saves the whole order; a player added to the pool later slots in at his Draft Rank
// spot (here 3rd: Draft Rank has him after ob1 and lf1)
const mine: DraftStrategy = { rounds: [], targets: {}, avoid: [], ranking: ["lk2", "ho1", "ob1", "lf1", "lk1", "lf2", "fh1"] };
const r = myRanks([...pool, pl("new", "CE", 2)], mine);
check("own rankings: their order, a newcomer slots in at his Draft Rank", r.get("lk2") === 1 && r.get("ho1") === 2 && r.get("new") === 3 && r.get("fh1") === 8, JSON.stringify([...r]));
check("own rankings: none = Draft Rank", myRanks(pool, null).get("ob1") === 1 && myRanks(pool, null).get("lk2") === 7);

const choose = (s: Partial<DraftStrategy>, round = 1, roster: P[] = [], available = pool) =>
  strategyChoice({ available, roster, round, strategy: { rounds: [], targets: {}, avoid: [], ranking: [], ...s } })?.id;
check("strategy pick: nothing set = best Draft Rank", choose({}) === "ob1");
check("strategy pick: round plan (round 2 = Lock)", choose({ rounds: ["", "LK"] }, 2) === "lk1");
check("strategy pick: any forward", choose({ rounds: ["FW"] }) === "lf1");
check("strategy pick: second position counts (Centre)", choose({ rounds: ["CE"] }) === "fh1");
check("strategy pick: do-not-draft is skipped", choose({ avoid: ["ob1", "lf1"] }) === "lk1");
check("strategy pick: only do-not-draft left -> still picks", choose({ avoid: ["ob1"] }, 1, [], [pool[0]]) === "ob1");
check("strategy pick: own rankings", choose({ ranking: ["ho1", "ob1", "lf1", "lk1", "lf2", "fh1", "lk2"] }) === "ho1");
check("strategy pick: target reached -> next position", choose({ targets: { OB: 1 } }, 3, [pl("x", "OB", 50)]) === "lf1");
check("strategy pick: plan beats a full target only if nothing else fits the plan", choose({ rounds: ["LF"], targets: { LF: 1 } }, 1, [pl("x", "LF", 50)]) === "lf1");
check("targets: progress by main position", JSON.stringify(targetProgress([pl("a", "LF", 1), pl("b", "LF", 2, "LK")], { ...mine, targets: { LF: 3 } }).find((t) => t.pos === "LF")) === '{"pos":"LF","have":2,"want":3}');

// --- computer teams
check("demand: Standard = its starting spots", JSON.stringify(starterDemand(STANDARD_SQUAD)) === '{"PR":2,"HO":1,"LK":2,"LF":3,"HB":1,"FH":1,"CE":2,"OB":3}');
const ten = starterDemand(TEN_SQUAD);
check("demand: 10-starter squad shares flex spots out (sums to 10)", Math.abs(Object.values(ten).reduce((a, b) => a + b, 0) - 10) < 1e-9 && ten.HO > 0 && ten.LF > 0, JSON.stringify(ten));

type Mock = { rosters: SitePlayer[][]; firstRound: SitePlayer[]; ms: number };
function runMock(players: SitePlayer[], teams: number, format: SquadFormat, seed: number): Mock {
  const t0 = Date.now();
  const rng = seededRandom(seed);
  const values = draftValues(players, format, teams);
  const personalities = Array.from({ length: teams }, () => makePersonality(rng));
  const order = Array.from({ length: teams }, (_, i) => String(i));
  const rosters: SitePlayer[][] = order.map(() => []);
  const taken = new Set<string>();
  const firstRound: SitePlayer[] = [];
  const total = teams * rosterSize(format);
  for (let pick = 1; pick <= total; pick++) {
    const t = Number(teamForPick(order, pick));
    const choice = cpuPick({ available: players.filter((p) => !taken.has(p.id)), roster: rosters[t], format, values, personality: personalities[t], rng });
    if (!choice) throw new Error(`no pick for team ${t} at ${pick}`);
    taken.add(choice.id);
    rosters[t].push(choice);
    if (pick <= teams) firstRound.push(choice);
  }
  return { rosters, firstRound, ms: Date.now() - t0 };
}

async function main() {
  const players = await loadSeasonPlayers(db, 2027);
  check("player pool loaded (2027)", players.length > 200, `${players.length} players`);

  for (const [label, teams, format, runs] of [["8 teams, Standard", 8, STANDARD_SQUAD, 12], ["12 teams, Standard", 12, STANDARD_SQUAD, 4], ["6 teams, 10 starters", 6, TEN_SQUAD, 6]] as const) {
    const mocks = Array.from({ length: runs }, (_, i) => runMock(players, teams, format, 1000 + i));
    const allRosters = mocks.flatMap((m) => m.rosters);
    check(`${label}: every team is full and legal`, allRosters.every((r) => r.length === rosterSize(format) && squadFits(r, format) && squadStartingGaps(r, format) === 0));
    const firstPicks = new Set(mocks.map((m) => m.firstRound[0].id));
    check(`${label}: pick 1 isn't always the same player`, firstPicks.size > 1, `${firstPicks.size} different over ${runs}`);
    const r1 = mocks.flatMap((m) => m.firstRound.map((p) => p.draftRank));
    const avgR1 = r1.reduce((a, b) => a + b, 0) / r1.length;
    check(`${label}: round 1 still takes good players (avg Draft Rank under ${teams * 2.5})`, avgR1 < teams * 2.5, `avg ${avgR1.toFixed(1)}, worst ${Math.max(...r1)}`);
    const notTop = mocks.filter((m) => m.firstRound.some((p, i) => p.draftRank !== [...m.firstRound].sort((a, b) => a.draftRank - b.draftRank)[i].draftRank)).length;
    check(`${label}: not just straight Draft Rank order`, notTop === runs, `${notTop}/${runs} drafts`);
    const demand = starterDemand(format);
    const maxStack = Math.max(...allRosters.flatMap((r) => Object.keys(demand).map((pos) => r.filter((p) => p.posAbbrev === pos).length - Math.ceil(demand[pos as keyof typeof demand]))));
    const worst = allRosters.map((r) => Object.keys(demand).map((pos) => [pos, r.filter((p) => p.posAbbrev === pos).length - Math.ceil(demand[pos as keyof typeof demand])] as const).sort((a, b) => b[1] - a[1])[0]);
    const tally: Record<string, number> = {};
    for (const [pos, n] of worst) if (n >= 2) tally[pos + "+" + n] = (tally[pos + "+" + n] ?? 0) + 1;
    check(`${label}: balanced (no team has 4+ more of a position than it starts)`, maxStack < 4, `most extra: ${maxStack}; ${JSON.stringify(tally)}`);
    const ms = Math.max(...mocks.map((m) => m.ms)) / (teams * rosterSize(format));
    check(`${label}: quick (under 25 ms a pick)`, ms < 25, `${ms.toFixed(1)} ms`);
    const strengths = mocks[0].rosters.map((r) => teamStrength(r, format, draftValues(players, format, teams)));
    const grades = strengths.map((s) => draftGrade(s, strengths));
    console.log(`      grades: ${grades.join(" ")}`);
  }

  // positions are valued differently: with a short supply, the best hooker beats an outside back ranked a little higher
  const values = draftValues(players, STANDARD_SQUAD, 10);
  const hookers = players.filter((p) => p.posAbbrev === "HO").sort((a, b) => a.draftRank - b.draftRank);
  const obs = players.filter((p) => p.posAbbrev === "OB").sort((a, b) => a.draftRank - b.draftRank);
  console.log(`      replacement: ${Object.entries(values.replacement).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}`);
  const ho = hookers[0], ob = obs.find((o) => o.draftRank < ho.draftRank) ?? obs[0];
  console.log(`      best hooker #${ho.draftRank} ${values.value.get(ho.id)!.toFixed(1)}; outside back #${ob.draftRank} ${values.value.get(ob.id)!.toFixed(1)}`);
  check("positions have different replacement levels", new Set(Object.values(values.replacement).map((v) => v.toFixed(2))).size > 3);
  check("form: points per game changes values", (() => {
    const form = new Map(players.slice(0, 120).map((p, i) => [p.id, { ppg: 10 + ((i * 37) % 30), games: 8 }]));
    const v2 = draftValues(players, STANDARD_SQUAD, 10, form);
    return players.slice(0, 120).some((p) => Math.abs(v2.value.get(p.id)! - values.value.get(p.id)!) > 0.5);
  })());

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
