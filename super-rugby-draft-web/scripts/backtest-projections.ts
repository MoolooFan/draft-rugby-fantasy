// scripts/backtest-projections.ts
// How accurate would expected points (lib/projections/project.ts) have been in 2026?
// Goes through the 2026 season round by round using only what was known before each round
// (earlier rounds' stats, that round's team lists, the fixture's FDR and home/away) and
// compares the projection with what each player actually scored. Then the same for the
// fantasy teams' lineups: projected team totals vs real scores, and how often the team
// projected to win did win. Reads the 2026 backup files only (no database).
//
// Run (from super-rugby-draft-web): npx tsx scripts/backtest-projections.ts
import fs from "node:fs";
import path from "node:path";
import { isFrontRow, playerPoints, statCountsFromRaw } from "../lib/scoring";
import { statusKind } from "../lib/status/kind";
import { DEFAULT_PARAMS, eventRate80, projectPoints, type PastGame, type ProjectionParams, type Role } from "../lib/projections/project";

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
type Pl = { id: string; team: string; posAbbrev: string; secondaryPosAbbrev: string | null; status: Record<number, string> };
const players = new Map<string, Pl>();
for (const r of csv(read("sheet-playersCsv.csv"))) {
  const id = r.PlayerId.toLowerCase();
  if (!id) continue;
  const status: Record<number, string> = {};
  for (let w = 1; w <= 16; w++) status[w] = r[`statusw${w}`] ?? "";
  players.set(id, { id, team: (r.teamCode || "").toUpperCase().replace("MOA", "MOP"), posAbbrev: r.posAbbrev, secondaryPosAbbrev: r.secondaryPosAbbrev || null, status });
}

// ---- stats: minutes and fantasy points per player per round
const games = new Map<string, Map<number, PastGame>>();
for (const s of JSON.parse(read("player_round_stats.json")) as Array<{ internal_player_id: string; round: number; raw_json: { stats?: unknown } }>) {
  const id = s.internal_player_id.toLowerCase();
  const pl = players.get(id);
  const counts = statCountsFromRaw(s.raw_json?.stats);
  const minutes = Number(counts.minutesPlayed) || 0;
  const points = playerPoints(counts, isFrontRow(pl ?? { posAbbrev: "" }));
  if (!games.has(id)) games.set(id, new Map());
  games.get(id)!.set(s.round, { round: s.round, minutes, points });
}

// ---- fixtures: opponent difficulty and home/away per team per round
const fixtureOf = new Map<string, { fdr: number; home: boolean }>();
for (const f of csv(read("sheet-fixturesCsv.csv"))) {
  const w = Number(f.week);
  const h = CODE[f.homeTeam], a = CODE[f.awayTeam];
  if (h) fixtureOf.set(`${h}|${w}`, { fdr: Number(f.fdrHome) || 3, home: true });
  if (a) fixtureOf.set(`${a}|${w}`, { fdr: Number(f.fdrAway) || 3, home: false });
}

const roleOf = (status: string): Role => {
  const k = statusKind(status);
  return k === "starting" ? "starting" : k === "bench" ? "bench" : "out";
};
const posGroup = (p: Pl | undefined) => (p ? p.posAbbrev : "??");

/** Average scoring rate per 80 for each position from all games before this round. */
function positionRates(beforeRound: number): Map<string, number> {
  const acc = new Map<string, { points: number; minutes: number }>();
  for (const [id, byRound] of games) {
    const g = [...byRound.values()].filter((x) => x.round < beforeRound);
    const r = eventRate80(g);
    const k = posGroup(players.get(id));
    const a = acc.get(k) ?? { points: 0, minutes: 0 };
    a.points += r.points; a.minutes += r.minutes;
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, a]) => [k, a.minutes ? (a.points * 80) / a.minutes : 20]));
}

type Pred = { id: string; round: number; role: Role; actual: number; model: number; ppg: number; ppgRole: number };

function run(params: ProjectionParams, firstRound = 3): Pred[] {
  const out: Pred[] = [];
  for (let R = 1; R <= 16; R++) {
    const rates = positionRates(R);
    const fallback = rates.size ? [...rates.values()].reduce((a, b) => a + b, 0) / rates.size : 20;
    for (const pl of players.values()) {
      const role = roleOf(pl.status[R] ?? "");
      const actualGame = games.get(pl.id)?.get(R);
      if (role === "out" && !actualGame) continue; // not named and didn't play: nothing to judge
      const past = [...(games.get(pl.id)?.values() ?? [])].filter((g) => g.round < R).sort((a, b) => a.round - b.round);
      const fx = fixtureOf.get(`${pl.team}|${R}`);
      const model = projectPoints({ games: past, priorRate80: rates.get(posGroup(pl)) ?? fallback, role, fdr: fx?.fdr ?? null, home: fx?.home ?? null }, params);
      const played = past.filter((g) => g.minutes > 0);
      const ppgRaw = played.length ? played.reduce((a, g) => a + g.points, 0) / played.length : 0;
      const ppg = role === "out" ? 0 : ppgRaw;
      const ppgRole = role === "starting" ? ppgRaw * 1.1 : role === "bench" ? ppgRaw * 0.45 : 0;
      if (R >= firstRound) out.push({ id: pl.id, round: R, role, actual: actualGame?.points ?? 0, model, ppg, ppgRole });
    }
  }
  return out;
}

function stats(preds: Pred[], key: "model" | "ppg" | "ppgRole") {
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
const preds = run(DEFAULT_PARAMS);
const avgActual = preds.reduce((a, p) => a + p.actual, 0) / preds.length;
console.log(`\nPLAYERS (rounds 3-16, ${preds.length} player-games; average actual ${avgActual.toFixed(1)} pts)`);
console.log("  season average only         ", stats(preds, "ppg"));
console.log("  season average x team list  ", stats(preds, "ppgRole"));
console.log("  full recipe (expected pts)  ", stats(preds, "model"));
for (const role of ["starting", "bench"] as Role[]) {
  const sub = preds.filter((p) => p.role === role);
  console.log(`    ${role.padEnd(9)} (${sub.length})`.padEnd(30), stats(sub, "model"), `avg actual ${(sub.reduce((a, p) => a + p.actual, 0) / sub.length).toFixed(1)}`);
}

// a few settings around the defaults (to see how sensitive it is)
const tries: Array<Partial<ProjectionParams>> = [
  { formWeight: 0 }, { formWeight: 0.4 }, { fdrStep: 0 }, { fdrStep: 0.08 }, { homeEdge: 0 }, { priorMinutes: 120 }, { priorMinutes: 480 },
  { formWeight: 0.1, priorMinutes: 480 }, { formWeight: 0.1, priorMinutes: 480, benchMinutes: 26 }, { formWeight: 0.1, priorMinutes: 800 },
];
for (const t of tries) console.log("    variant", JSON.stringify(t).padEnd(22), stats(run({ ...DEFAULT_PARAMS, ...t }), "model"));

// ---- team level: the 2026 league's lineups (a week without a saved lineup uses the latest earlier one)
type Sel = { team_id: string; week: number; lineup: Record<string, { id?: string } | null>; captain_id: string | null };
const sels = (JSON.parse(read("team_selections.json")) as Array<Sel & { week: string }>).map((s) => ({ ...s, week: Number(s.week) }));
const STARTERS = ["prop1", "hooker1", "prop2", "lock1", "lock2", "looseforward1", "looseforward2", "looseforward3", "halfback1", "flyhalf1", "centre1", "centre2", "outsideback1", "outsideback2", "outsideback3"];
const projBy = new Map<string, number>();
for (const p of run(DEFAULT_PARAMS, 1)) projBy.set(`${p.id}|${p.round}`, p.model);

const matchups = csv(read("league-fixtures-and-results-sheet.csv")).filter((m) => m.kind === "regular" && m.homeTeamId && m.awayTeamId && m.status === "complete");
const teamRows: Array<{ proj: number; actual: number }> = [];
let right = 0, called = 0;
for (const m of matchups) {
  const wf = Number(m.weekFantasy), wr = Number(m.weekReal);
  const projFor = (teamId: string) => {
    const sel = sels.filter((s) => s.team_id === teamId && s.week <= wf).sort((a, b) => b.week - a.week)[0];
    if (!sel) return null;
    let t = 0;
    for (const slot of STARTERS) {
      const id = String(sel.lineup?.[slot]?.id ?? "").toLowerCase();
      const v = projBy.get(`${id}|${wr}`) ?? 0;
      t += id === String(sel.captain_id ?? "").toLowerCase() ? v * 2 : v;
    }
    return t;
  };
  const ph = projFor(m.homeTeamId), pa = projFor(m.awayTeamId);
  if (ph == null || pa == null) continue;
  const ah = Number(m.homeScore), aw = Number(m.awayScore);
  teamRows.push({ proj: ph, actual: ah }, { proj: pa, actual: aw });
  if (ah !== aw) { called++; if ((ph > pa) === (ah > aw)) right++; }
}
const tm = teamRows.length;
const tMae = teamRows.reduce((a, r) => a + Math.abs(r.proj - r.actual), 0) / tm;
const tAvg = teamRows.reduce((a, r) => a + r.actual, 0) / tm;
const tBias = teamRows.reduce((a, r) => a + (r.proj - r.actual), 0) / tm;
console.log(`\nTEAMS (2026 league, ${tm} team-weeks, average score ${tAvg.toFixed(0)})`);
console.log(`  average miss ${tMae.toFixed(0)} pts (${((tMae / tAvg) * 100).toFixed(1)}% of a score), bias ${tBias.toFixed(0)}`);
console.log(`  projected winner won ${right} of ${called} matchups (${((right / called) * 100).toFixed(0)}%)`);
console.log("  (team totals here leave out auto-subs, so real scores run a little higher)");
