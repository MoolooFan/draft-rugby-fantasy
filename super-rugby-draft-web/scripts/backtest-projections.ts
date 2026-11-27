// scripts/backtest-projections.ts
// How accurate would expected points (lib/projections/project.ts) have been in 2026?
// Goes through the 2026 season round by round using only what was known before each round
// (earlier rounds' stats and results, the team lists / injury list as they came out, the
// fixture's FDR and home/away) and compares the projection with what each player actually
// scored. Then the same for the fantasy teams' lineups: projected team totals (with auto-subs
// for ruled-out starters) vs real scores, and how often the team projected to win did win.
// Reads the 2026 backup files only (no database).
//
// For reference, the first recipe (before the 12 Nov 2026 changes) missed by 10.66 pts per
// player after the team lists (correlation 0.531), 11.19 before them, 10.08 midweek.
// Even knowing every player's true 2026 average in advance would miss by 9.24 (game-day luck).
//
// Position matchups (Ethan, 27 Nov 2026): `--matchups` tries the points each opponent gave up to
// the player's position (lib/coach/matchups.ts) instead of / as well as the opponent effect.
// 2026 result: no better (best 10.46 / corr 0.552 vs 10.46 / 0.550 now; no opponent at all 10.50).
// Odd vs even rounds: a team's overall leakiness repeats (0.44), one position on top of that
// hardly does (0.15); by position OB 0.61, CE 0.45, PR 0.36, HO 0.21, the rest about 0.
//
// Run (from super-rugby-draft-web): npx tsx scripts/backtest-projections.ts [--matchups]
import fs from "node:fs";
import path from "node:path";
import { isFrontRow, playerPoints, statCountsFromRaw, statPoints, STANDARD_SCORING, type StatCounts } from "../lib/scoring";
import { pointsAllowed, posGroup, type AllowedRow, type Appearance, type PosGroup } from "../lib/coach/matchups";
import { statusKind } from "../lib/status/kind";
import type { Lineup } from "../lib/scoring/week";
import { lineupSpread, teamOutlook, winProbability } from "../lib/projections/live";
import {
  DEFAULT_PARAMS, PLAY_STATS, averageRates, dutyKicker, lineoutStealFactor, seasonPrior, expectedRole, kickingOrder, kickingPoints, opponentWeakness,
  projectPoints, projectPointsExpectedLineup, projectTeamScore, teamStrength,
  type ListRole, type PastGame, type ProjectionParams, type Role, type StatRates, type TeamGame, type TeamStrength,
} from "../lib/projections/project";

const USE_RANK = !process.argv.includes("--no-rank"); // draft rank in the starting estimate
const LAST_LISTED_ROUND = 15; // the 2026 data has no team lists for round 16
const DIR = path.resolve(process.cwd(), "../backups/2026-11-04");
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");

function csv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x !== "")) rows.push(row);
  const [h, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? "").trim()])));
}

const CODE: Record<string, string> = { Blues: "BLU", Brumbies: "BRU", Chiefs: "CHI", Crusaders: "CRU", Drua: "DRU", Force: "FOR", Highlanders: "HIG", Hurricanes: "HUR", Moana: "MOP", Reds: "RED", Waratahs: "WAR" };

// ---- players: positions and team-list status per round
type Pl = { id: string; team: string; posAbbrev: string; secondaryPosAbbrev: string | null; frontRow: boolean; draftRank: number | null; status: Record<number, string> };
const players = new Map<string, Pl>();
for (const r of csv(read("sheet-playersCsv.csv"))) {
  const id = r.PlayerId.toLowerCase();
  if (!id) continue;
  const status: Record<number, string> = {};
  for (let w = 1; w <= 16; w++) status[w] = r[`statusw${w}`] ?? "";
  const pos = { posAbbrev: r.posAbbrev, secondaryPosAbbrev: r.secondaryPosAbbrev || null };
  players.set(id, { id, team: (r.teamCode || "").toUpperCase().replace("MOA", "MOP"), ...pos, frontRow: isFrontRow(pos, STANDARD_SCORING), draftRank: Number(r.draftRank) || null, status });
}

const listedAs = (st: string): "starting" | "bench" | null => {
  const k = statusKind(st);
  return k === "starting" || k === "bench" ? k : null;
};

// ---- stats per player per round
const games = new Map<string, Map<number, PastGame & { points: number; play: number }>>();
for (const s of JSON.parse(read("player_round_stats.json")) as Array<{ internal_player_id: string; round: number; raw_json: { stats?: unknown } }>) {
  const id = s.internal_player_id.toLowerCase();
  const pl = players.get(id);
  const counts: StatCounts = statCountsFromRaw(s.raw_json?.stats);
  if (!(Number(counts.minutesPlayed) > 0)) continue;
  if (!games.has(id)) games.set(id, new Map());
  games.get(id)!.set(s.round, {
    round: s.round, counts, listed: pl ? listedAs(pl.status[s.round] ?? "") : null,
    points: playerPoints(counts, pl?.frontRow ?? false, STANDARD_SCORING),
    play: PLAY_STATS.reduce((a, k) => a + statPoints(k, Number(counts[k]) || 0, pl?.frontRow ?? false, STANDARD_SCORING), 0),
  });
}
const pastOf = (id: string, R: number) => [...(games.get(id)?.values() ?? [])].filter((g) => g.round < R).sort((a, b) => a.round - b.round);

// ---- fixtures and real teams' games
const fixtureOf = new Map<string, { fdr: number; home: boolean; opp: string; pf: number; pa: number }>();
for (const f of csv(read("sheet-fixturesCsv.csv"))) {
  const w = Number(f.week);
  const h = CODE[f.homeTeam], a = CODE[f.awayTeam];
  if (!h || !a) continue;
  const hs = Number(f.homeScore) || 0, as = Number(f.awayScore) || 0;
  fixtureOf.set(`${h}|${w}`, { fdr: Number(f.fdrHome) || 3, home: true, opp: a, pf: hs, pa: as });
  fixtureOf.set(`${a}|${w}`, { fdr: Number(f.fdrAway) || 3, home: false, opp: h, pf: as, pa: hs });
}
const teamGames = new Map<string, TeamGame[]>();
for (const [key, f] of fixtureOf) {
  const [team, w] = key.split("|");
  let tries = 0, penaltyShots = 0, lineoutSteals = 0;
  for (const pl of players.values()) {
    if (pl.team !== team) continue;
    const c = games.get(pl.id)?.get(Number(w))?.counts;
    if (!c) continue;
    tries += Number(c.tries) || 0;
    penaltyShots += (Number(c.penaltyGoals) || 0) + (Number(c.penaltyGoalsMissed) || 0);
    lineoutSteals += Number(c.lineoutSteals) || 0;
  }
  if (!teamGames.has(team)) teamGames.set(team, []);
  teamGames.get(team)!.push({ round: Number(w), pointsFor: f.pf, pointsAgainst: f.pa, tries, penaltyShots, lineoutSteals });
}

// ---- play points each team gave up per position (per 80 minutes) before round R
const MATCHUP_PRIOR = Number(process.argv.find((a) => a.startsWith("--matchup-prior="))?.split("=")[1] ?? 3);
const allowedCache = new Map<string, Map<string, Map<PosGroup, AllowedRow>>>();
function allowedBefore(R: number, priorGames = MATCHUP_PRIOR) {
  const key = `${R}|${priorGames}`;
  if (allowedCache.has(key)) return allowedCache.get(key)!;
  const apps: Appearance[] = [];
  for (const pl of players.values()) {
    const group = posGroup(pl.posAbbrev, null);
    if (!group) continue;
    for (const g of games.get(pl.id)?.values() ?? []) {
      if (g.round >= R) continue;
      const fx = fixtureOf.get(`${pl.team}|${g.round}`);
      if (!fx) continue;
      apps.push({ opp: fx.opp, game: g.round, group, points: g.play, minutes: Number(g.counts.minutesPlayed) || 0 });
    }
  }
  const out = pointsAllowed(apps, { priorGames });
  allowedCache.set(key, out);
  return out;
}
function positionFactor(R: number, opp: string, pos: string, priorGames = MATCHUP_PRIOR): number | null {
  const group = posGroup(pos, null);
  const row = group ? allowedBefore(R, priorGames).get(opp)?.get(group) : null;
  return row && row.leagueAverage > 0 ? row.per80 / row.leagueAverage : null;
}

// ---- what was known before each round
type Before = { priors: Map<string, StatRates>; strength: Map<string, TeamStrength>; order: Map<string, string[]> };
const beforeCache = new Map<number, Before>();
function before(R: number): Before {
  if (beforeCache.has(R)) return beforeCache.get(R)!;
  const byPos = new Map<string, Array<{ games: PastGame[]; frontRow: boolean }>>();
  const byTeam = new Map<string, Array<{ id: string; games: PastGame[] }>>();
  for (const pl of players.values()) {
    const past = pastOf(pl.id, R);
    if (!byPos.has(pl.posAbbrev)) byPos.set(pl.posAbbrev, []);
    byPos.get(pl.posAbbrev)!.push({ games: past, frontRow: pl.frontRow });
    if (!byTeam.has(pl.team)) byTeam.set(pl.team, []);
    byTeam.get(pl.team)!.push({ id: pl.id, games: past });
  }
  const priors = new Map([...byPos].map(([pos, g]) => [pos, averageRates(g)]));
  const strength = new Map([...teamGames].map(([t, g]) => [t, teamStrength(g.filter((x) => x.round < R))]));
  const order = new Map([...byTeam].map(([t, g]) => [t, kickingOrder(g, R)]));
  const out = { priors, strength, order };
  beforeCache.set(R, out);
  return out;
}

const roleOf = (status: string): Role => {
  const k = statusKind(status);
  return k === "starting" ? "starting" : k === "bench" ? "bench" : "out";
};
const isOut = (status: string) => {
  const k = statusKind(status);
  return k === "injured" || k === "suspended" || k === "out";
};
/**
 * His status before this week's injury list: the latest injury / suspension / "Out - reason" he
 * had (it stays until it's changed). A plain "Out" in the 2026 lists just meant not picked
 * that week, so it doesn't carry over.
 */
function carriedStatus(pl: Pl, R: number): string {
  for (let r = R - 1; r >= 1; r--) {
    const st = (pl.status[r] ?? "").trim();
    if (!st) continue;
    return st.toLowerCase() === "out" ? "" : st;
  }
  return "";
}

/** What the team list said about a player in a round (a game with no listed status: from his minutes). */
function listRole(pl: Pl, R: number): ListRole {
  if (!fixtureOf.has(`${pl.team}|${R}`)) return "none";
  const st = pl.status[R] ?? "";
  if (st) {
    const k = statusKind(st);
    return k === "starting" ? "starting" : k === "bench" ? "bench" : "out";
  }
  const g = games.get(pl.id)?.get(R);
  if (g) return Number(g.counts.minutesPlayed) >= 40 ? "starting" : "bench";
  return "notNamed";
}

type Stage = "after" | "start" | "mid";
type Pred = { id: string; round: number; role: Role; actual: number; after: number; start: number; mid: number; namedOrPlayed: boolean; preSpread: number };

function run(params: ProjectionParams = DEFAULT_PARAMS, firstRound = 3, matchupPrior = MATCHUP_PRIOR) {
  const preds: Pred[] = [];
  const ruledOut = new Map<string, Record<Stage, boolean>>(); // `${id}|${R}`
  for (let R = 1; R <= LAST_LISTED_ROUND; R++) {
    const b = before(R);
    const teamPlayers = (t: string) => [...players.values()].filter((p) => p.team === t);
    // this week's kicker at each stage
    const kicker = new Map<string, Record<Stage, string | null>>();
    for (const t of new Set([...players.values()].map((p) => p.team))) {
      const order = b.order.get(t) ?? [];
      const byId = new Map(teamPlayers(t).map((p) => [p.id, p]));
      const likelyStarter = (id: string, outNow: (p: Pl) => boolean) => {
        const p = byId.get(id);
        if (!p || outNow(p)) return false;
        const h: ListRole[] = [];
        for (let r = 1; r < R; r++) h.push(listRole(p, r));
        return expectedRole(h).start >= 0.5;
      };
      kicker.set(t, {
        after: dutyKicker(order, (id) => roleOf(byId.get(id)?.status[R] ?? "") === "starting"),
        start: dutyKicker(order, (id) => likelyStarter(id, (p) => isOut(carriedStatus(p, R)))),
        mid: dutyKicker(order, (id) => likelyStarter(id, (p) => isOut(p.status[R] ?? ""))),
      });
    }
    for (const pl of players.values()) {
      const fx = fixtureOf.get(`${pl.team}|${R}`);
      const role = roleOf(pl.status[R] ?? "");
      const actualGame = games.get(pl.id)?.get(R);
      const outStart = !fx || isOut(carriedStatus(pl, R));
      const outMid = !fx || isOut(pl.status[R] ?? "");
      ruledOut.set(`${pl.id}|${R}`, { after: !fx || role === "out", start: outStart, mid: outMid });
      if (!fx) continue;
      const past = pastOf(pl.id, R);
      const opp = b.strength.get(fx.opp);
      const own = b.strength.get(pl.team);
      const kick = (stage: Stage) =>
        kicker.get(pl.team)?.[stage] === pl.id && own && opp ? kickingPoints(past, own, opp) : null;
      const base = {
        games: past, pos: pl.posAbbrev, frontRow: pl.frontRow, draftRank: USE_RANK ? pl.draftRank : null,
        prior: USE_RANK ? seasonPrior(b.priors.get(pl.posAbbrev) ?? {}, pl.draftRank) : b.priors.get(pl.posAbbrev) ?? {},
        fdr: fx.fdr, home: fx.home, opponentWeakness: opp ? opponentWeakness(opp) : null,
        opponentSteals: opp ? lineoutStealFactor(opp) : null,
        opponentPositionFactor: params.positionMatchup ? positionFactor(R, fx.opp, pl.posAbbrev, matchupPrior) : null,
      };
      const after = projectPoints({ ...base, role, kicking: kick("after") }, params);
      const history: ListRole[] = [];
      for (let r = 1; r < R; r++) history.push(listRole(pl, r));
      const chances = expectedRole(history);
      const start = outStart ? 0 : projectPointsExpectedLineup({ ...base, chances, kicking: kick("start") }, params);
      const mid = outMid ? 0 : projectPointsExpectedLineup({ ...base, chances, kicking: kick("mid") }, params);
      const preSpread = outStart ? 0 : lineupSpread([
        { chance: chances.start, projected: projectPoints({ ...base, role: "starting", kicking: kick("start") }, params) },
        { chance: chances.bench, projected: projectPoints({ ...base, role: "bench" }, params) },
      ]);
      const namedOrPlayed = !(role === "out" && !actualGame);
      // judged: everyone named or who played, plus anyone in contention from his recent lists
      // (so a player correctly held at 0 for an injury counts as a correct call)
      if (!namedOrPlayed && chances.start + chances.bench <= 0) continue;
      if (R >= firstRound) preds.push({ id: pl.id, round: R, role, actual: actualGame?.points ?? 0, after, start, mid, namedOrPlayed, preSpread });
    }
  }
  return { preds, ruledOut };
}

function stats(preds: Pred[], key: Stage) {
  const n = preds.length;
  const err = preds.map((p) => p[key] - p.actual);
  const mae = err.reduce((a, e) => a + Math.abs(e), 0) / n;
  const bias = err.reduce((a, e) => a + e, 0) / n;
  const mx = preds.reduce((a, p) => a + p[key], 0) / n, my = preds.reduce((a, p) => a + p.actual, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of preds) { sxy += (p[key] - mx) * (p.actual - my); sxx += (p[key] - mx) ** 2; syy += (p.actual - my) ** 2; }
  return { mae: +mae.toFixed(2), bias: +bias.toFixed(2), corr: +(sxy / Math.sqrt(sxx * syy)).toFixed(3) };
}

// ---- player level
const { preds: all } = run();
const named = all.filter((p) => p.namedOrPlayed);
console.log(`\nPLAYERS (rounds 3-${LAST_LISTED_ROUND}; average actual ${(named.reduce((a, p) => a + p.actual, 0) / named.length).toFixed(1)} pts)`);
console.log(`  after the team lists (${named.length} named or played)  `, stats(named, "after"));
for (const role of ["starting", "bench"] as Role[]) {
  const sub = named.filter((p) => p.role === role);
  console.log(`    ${role.padEnd(9)} (${sub.length})`.padEnd(42), stats(sub, "after"));
}
console.log(`    hookers (${named.filter((p) => players.get(p.id)?.posAbbrev === "HO").length})`.padEnd(42), stats(named.filter((p) => players.get(p.id)?.posAbbrev === "HO"), "after"));
console.log(`  before the lists (${all.length} whose team played, tipped to or did play):`);
console.log("    start of week (last status carried)  ", stats(all, "start"));
console.log("    midweek (this week's injury list)    ", stats(all, "mid"));
for (const t of [{ formWeight: 0 }, { fdrStep: 0 }, { homeEdge: 0 }, { opponentEffect: {} }]) {
  console.log("    variant", JSON.stringify(t).padEnd(22), stats(run({ ...DEFAULT_PARAMS, ...t }).preds.filter((p) => p.namedOrPlayed), "after"));
}
// points given up to his position (27 Nov 2026): instead of, or as well as, the points-for /
// against opponent effect; with --matchups, every weight and prior
if (process.argv.includes("--matchups")) {
  console.log("\n  POSITION MATCHUPS (after the lists / start of week, named or played; all = everyone judged)");
  const show = (label: string, params: ProjectionParams, prior: number) => {
    const r = run(params, 3, prior).preds;
    const n = r.filter((p) => p.namedOrPlayed);
    const after = stats(n, "after"), start = stats(r, "start");
    console.log(`    ${label.padEnd(44)} after: miss ${after.mae} corr ${after.corr}   start: miss ${start.mae} corr ${start.corr}`);
  };
  show("now (points for/against effect)", DEFAULT_PARAMS, 3);
  show("no opponent at all", { ...DEFAULT_PARAMS, opponentEffect: {} }, 3);
  for (const prior of [3, 6, 10]) {
    for (const w of [0.25, 0.5, 0.75, 1]) {
      show(`position only, weight ${w}, prior ${prior} games`, { ...DEFAULT_PARAMS, opponentEffect: {}, positionMatchup: w }, prior);
    }
    for (const w of [0.25, 0.5]) {
      show(`both, weight ${w}, prior ${prior} games`, { ...DEFAULT_PARAMS, positionMatchup: w }, prior);
    }
  }
  // is it a real pattern? a team's points given up to each position in odd rounds vs even rounds
  {
    const half = (odd: boolean) => {
      const apps: Appearance[] = [];
      for (const pl of players.values()) {
        const group = posGroup(pl.posAbbrev, null);
        if (!group) continue;
        for (const g of games.get(pl.id)?.values() ?? []) {
          if ((g.round % 2 === 1) !== odd) continue;
          const fx = fixtureOf.get(`${pl.team}|${g.round}`);
          if (fx) apps.push({ opp: fx.opp, game: g.round, group, points: g.play, minutes: Number(g.counts.minutesPlayed) || 0 });
        }
      }
      return pointsAllowed(apps, { priorGames: 0, lastGames: 99 });
    };
    const o = half(true), e = half(false);
    const corr = (xs: number[], ys: number[]) => {
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
      let sxy = 0, sxx = 0, syy = 0;
      xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
      return +(sxy / Math.sqrt(sxx * syy)).toFixed(2);
    };
    const groups: PosGroup[] = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"];
    const xs: number[] = [], ys: number[] = [];
    const per: string[] = [];
    for (const gr of groups) {
      const gx: number[] = [], gy: number[] = [];
      for (const [t, m] of o) {
        const a = m.get(gr), b = e.get(t)?.get(gr);
        if (!a || !b) continue;
        gx.push(a.per80 / a.leagueAverage); gy.push(b.per80 / b.leagueAverage);
      }
      xs.push(...gx); ys.push(...gy);
      per.push(`${gr} ${corr(gx, gy)}`);
    }
    // the same for "position on top of the team's overall leakiness": factor ÷ the team's average factor
    const rel = (m: Map<PosGroup, AllowedRow>) => {
      const avg = groups.reduce((a, g) => a + m.get(g)!.per80 / m.get(g)!.leagueAverage, 0) / groups.length;
      return new Map(groups.map((g) => [g, m.get(g)!.per80 / m.get(g)!.leagueAverage / avg]));
    };
    const rx: number[] = [], ry: number[] = [];
    for (const [t, m] of o) { const a = rel(m), b = e.get(t) ? rel(e.get(t)!) : null; if (!b) continue; for (const g of groups) { rx.push(a.get(g)!); ry.push(b.get(g)!); } }
    const teamsO = [...o.keys()], tx = teamsO.map((t) => groups.reduce((a, g) => a + o.get(t)!.get(g)!.per80 / o.get(t)!.get(g)!.leagueAverage, 0)), ty = teamsO.map((t) => groups.reduce((a, g) => a + (e.get(t)?.get(g)?.per80 ?? 0) / (e.get(t)?.get(g)?.leagueAverage ?? 1), 0));
    console.log(`    odd vs even rounds: points given up per position ${corr(xs, ys)} (1 = the same every time, 0 = chance); by position: ${per.join(", ")}`);
    console.log(`      a team's overall leakiness (all positions together): ${corr(tx, ty)}; one position on top of that: ${corr(rx, ry)}`);
  }
  // by position: is it better for every position, or only some?
  const base = run(DEFAULT_PARAMS, 3, 3).preds.filter((p) => p.namedOrPlayed);
  const alt = run({ ...DEFAULT_PARAMS, opponentEffect: {}, positionMatchup: 0.5 }, 3, 6).preds.filter((p) => p.namedOrPlayed);
  console.log("    by position (now vs position only, weight 0.5, prior 6):");
  for (const pos of ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"]) {
    const a = base.filter((p) => players.get(p.id)?.posAbbrev === pos), b = alt.filter((p) => players.get(p.id)?.posAbbrev === pos);
    console.log(`      ${pos} (${a.length})  now miss ${stats(a, "after").mae}  ->  ${stats(b, "after").mae}`);
  }
  process.exit(0);
}

// ---- team level: the 2026 league's lineups (a week without a saved lineup uses the latest earlier one)
type Sel = { team_id: string; week: number; lineup: Record<string, Record<string, unknown> | null>; captain_id: string | null; vice_id: string | null };
const sels = (JSON.parse(read("team_selections.json")) as Array<Sel & { week: string }>).map((s) => ({ ...s, week: Number(s.week) }));
const full = run(DEFAULT_PARAMS, 1);
const projBy = new Map<string, Pred>(full.preds.map((p) => [`${p.id}|${p.round}`, p]));

const matchups = csv(read("league-fixtures-and-results-sheet.csv")).filter((m) => m.kind === "regular" && m.homeTeamId && m.awayTeamId && m.status === "complete" && Number(m.weekReal) <= LAST_LISTED_ROUND);
function teamProjection(teamId: string, wf: number, wr: number, stage: Stage, autoSubs: boolean): number | null {
  const sel = sels.filter((s) => s.team_id === teamId && s.week <= wf).sort((a, b) => b.week - a.week)[0];
  if (!sel) return null;
  const lineup: Lineup = {};
  for (const [slot, p] of Object.entries(sel.lineup ?? {})) {
    if (p && typeof p.id === "string") (lineup as Record<string, unknown>)[slot] = { ...p, id: p.id.toLowerCase() };
  }
  const out = (id: string) => full.ruledOut.get(`${id}|${wr}`)?.[stage] ?? true;
  return projectTeamScore({
    lineup,
    captainId: sel.captain_id?.toLowerCase() ?? null,
    viceId: sel.vice_id?.toLowerCase() ?? null,
    projection: (id) => projBy.get(`${id}|${wr}`)?.[stage] ?? 0,
    ruledOut: autoSubs ? out : () => false,
  }).total;
}

console.log(`\nTEAMS (2026 league, regular season rounds 1-${LAST_LISTED_ROUND})`);
for (const [label, stage] of [["after the team lists", "after"], ["start of week", "start"], ["midweek", "mid"]] as Array<[string, Stage]>) {
  for (const autoSubs of [false, true]) {
    let miss = 0, bias = 0, sum = 0, n = 0, right = 0, called = 0;
    for (const m of matchups) {
      const wf = Number(m.weekFantasy), wr = Number(m.weekReal);
      const ph = teamProjection(m.homeTeamId, wf, wr, stage, autoSubs), pa = teamProjection(m.awayTeamId, wf, wr, stage, autoSubs);
      if (ph == null || pa == null) continue;
      const ah = Number(m.homeScore), aw = Number(m.awayScore);
      for (const [p, a] of [[ph, ah], [pa, aw]]) { miss += Math.abs(p - a); bias += p - a; sum += a; n++; }
      if (ah !== aw) { called++; if ((ph > pa) === (ah > aw)) right++; }
    }
    console.log(`  ${label.padEnd(21)} ${autoSubs ? "with auto-subs   " : "no auto-subs     "} miss ${(miss / n).toFixed(0)} pts (${((miss / sum) * 100).toFixed(1)}% of a score), bias ${(bias / n).toFixed(0)}, projected winner won ${right} of ${called} (${((right / called) * 100).toFixed(0)}%)`);
  }
}

// ---- win probability (before kickoff, after the team lists): is it well calibrated?
{
  const outlook = (teamId: string, wf: number, wr: number, stage: Stage) => {
    const sel = sels.filter((s) => s.team_id === teamId && s.week <= wf).sort((a, b) => b.week - a.week)[0];
    if (!sel) return null;
    const lineup: Lineup = {};
    for (const [slot, p] of Object.entries(sel.lineup ?? {})) {
      if (p && typeof p.id === "string") (lineup as Record<string, unknown>)[slot] = { ...p, id: p.id.toLowerCase() };
    }
    return teamOutlook({
      lineup, captainId: sel.captain_id?.toLowerCase() ?? null, viceId: sel.vice_id?.toLowerCase() ?? null, nowMs: 0,
      state: (id) => {
        const out = full.ruledOut.get(`${id}|${wr}`)?.[stage] ?? true;
        const pr = projBy.get(`${id}|${wr}`);
        return { projected: out ? 0 : pr?.[stage] ?? 0, spread: stage === "after" || !pr ? undefined : pr.preSpread, actual: null, minutes: 0, kickoffMs: out ? null : 1, ruledOut: out };
      },
    });
  };
  for (const stage of ["after", "start"] as Stage[]) {
    let brier = 0, n = 0, zz = 0;
    const buckets = new Map<number, { n: number; won: number; p: number }>();
    for (const m of matchups) {
      const wf = Number(m.weekFantasy), wr = Number(m.weekReal);
      const a = outlook(m.homeTeamId, wf, wr, stage), b = outlook(m.awayTeamId, wf, wr, stage);
      if (!a || !b) continue;
      const ah = Number(m.homeScore), aw = Number(m.awayScore);
      if (ah === aw) continue;
      const p = winProbability(a, b), won = ah > aw ? 1 : 0;
      brier += (p - won) ** 2; n++;
      zz += (((ah - aw) - (a.expected - b.expected)) ** 2) / (a.variance + b.variance);
      const k = Math.min(4, Math.floor(Math.max(p, 1 - p) * 10) - 5);
      const bk = buckets.get(k) ?? { n: 0, won: 0, p: 0 };
      bk.n++; bk.p += Math.max(p, 1 - p); bk.won += (p >= 0.5 ? won : 1 - won);
      buckets.set(k, bk);
    }
    console.log(`\nWIN PROBABILITY (${stage === "after" ? "after the team lists" : "start of week"}, ${n} matchups): Brier ${(brier / n).toFixed(3)} (coin flip 0.250); spread check ${Math.sqrt(zz / n).toFixed(2)} (1.00 = right size)`);
    for (const [k, b] of [...buckets].sort((x, y) => x[0] - y[0])) console.log(`  favourite given ${(50 + k * 10)}-${60 + k * 10}%: ${b.n} matchups, said ${((b.p / b.n) * 100).toFixed(0)}% on average, favourite won ${b.won} (${((b.won / b.n) * 100).toFixed(0)}%)`);
  }
}
