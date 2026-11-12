// Run: npx tsx scripts/tests/projections-server.test.ts — the server's weekly expected points
// (lib/projections/server.ts) on the 2026 backup, through a small stand-in for the database
// (no Supabase needed). Checks it reads the tables right and agrees with the 2026 test.
import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { weekProjections } from "../../lib/projections/server";
import { STANDARD_SCORING } from "../../lib/scoring";
import { statusKind } from "../../lib/status/kind";
import { getSeason } from "../../lib/season";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const DIR = path.resolve(process.cwd(), "../backups/2026-11-04");
if (!fs.existsSync(DIR)) {
  console.log("SKIP  no 2026 backup on this computer");
  process.exit(0);
}
function csv(text: string): Record<string, string>[] {
  const rows = text.split(/\r?\n/).filter(Boolean).map((l) => {
    const out: string[] = []; let cell = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"') q = true; else if (c === ",") { out.push(cell); cell = ""; } else cell += c;
    }
    out.push(cell); return out;
  });
  const [h, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] ?? "").trim()])));
}

// --- tables from the backup (2026 player ids as they were, lower-cased)
const players: Record<string, unknown>[] = [];
const weekly: Record<string, unknown>[] = [];
for (const r of csv(fs.readFileSync(path.join(DIR, "sheet-playersCsv.csv"), "utf8"))) {
  const id = r.PlayerId.toLowerCase();
  if (!id) continue;
  players.push({
    season: 2026, id, first_name: r.firstName, last_name: r.lastName, team_code: r.teamCode, pos: r.posAbbrev,
    pos2: r.secondaryPosAbbrev || null, pos3: null, draft_rank: Number(r.draftRank) || null, external_id: null, status: null, active: true,
  });
  for (let w = 1; w <= 16; w++) if (r[`statusw${w}`]) weekly.push({ season: 2026, week: w, player_id: id, status: r[`statusw${w}`] });
}
const stats = (JSON.parse(fs.readFileSync(path.join(DIR, "player_round_stats.json"), "utf8")) as Array<{ internal_player_id: string; round: number; raw_json: { stats?: unknown } }>)
  .map((s) => ({ season: 2026, internal_player_id: s.internal_player_id.toLowerCase(), round: s.round, raw_json: s.raw_json }));
const tables: Record<string, Record<string, unknown>[]> = { players, player_week_status: weekly, player_round_stats: stats, team_difficulty: [] };

// --- a tiny stand-in for the Supabase query builder (select / eq / lt / in / order / range)
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let pick: ((r: Record<string, unknown>) => Record<string, unknown>) | null = null;
  const b = {
    select(cols: string) {
      if (cols.includes("raw_json->stats")) pick = (r) => ({ internal_player_id: r.internal_player_id, round: r.round, stats: (r.raw_json as { stats?: unknown })?.stats });
      return b;
    },
    eq(c: string, v: unknown) { rows = rows.filter((r) => r[c] === v); return b; },
    lt(c: string, v: number) { rows = rows.filter((r) => Number(r[c]) < v); return b; },
    in(c: string, v: unknown[]) { rows = rows.filter((r) => v.includes(r[c])); return b; },
    order() { return b; },
    range(from: number, to: number) { return Promise.resolve({ data: rows.slice(from, to + 1).map((r) => (pick ? pick(r) : r)), error: null }); },
    then(res: (v: { data: unknown[]; error: null }) => unknown) { return Promise.resolve({ data: rows.map((r) => (pick ? pick(r) : r)), error: null }).then(res); },
  };
  return b;
}
const db = { from: query } as unknown as SupabaseClient;

(async () => {
  const w8 = await weekProjections(db, 2026, 8, STANDARD_SCORING, Date.parse("2026-04-01T00:00:00Z"));
  const p = (id: string) => w8.players[id];
  check("every active player gets a projection", Object.keys(w8.players).length === players.length, `${Object.keys(w8.players).length}`);
  const playing = getSeason(2026).fixtures.filter((f) => f.week === 8).length * 2;
  check("team lists are out for every team playing in week 8 (only 3 games that round)", w8.listsOut.length === playing, w8.listsOut.join(","));
  const bye = Object.entries(w8.players).filter(([id]) => ["BLU", "HUR", "BRU"].includes(String(players.find((x) => x.id === id)?.team_code)));
  check("teams with a bye = 0", bye.length > 0 && bye.every(([, v]) => v.pts === 0 && v.kickoffMs === null));
  const named = Object.entries(w8.players).filter(([id]) => {
    const st = weekly.find((x) => x.player_id === id && x.week === 8)?.status as string | undefined;
    return statusKind(st) === "starting";
  });
  check("named starters all have projections > 0", named.every(([, v]) => v.pts > 0), `${named.length} starters`);
  const notNamed = Object.entries(w8.players).filter(([id]) => !weekly.some((x) => x.player_id === id && x.week === 8));
  check("players not named once the lists are out = 0", notNamed.every(([, v]) => v.pts === 0 && v.role === "out"));
  const kickers = Object.values(w8.players).filter((v) => v.kicker).length;
  check("one goal kicker per team playing", kickers === w8.listsOut.length, `${kickers}`);
  const top = Object.entries(w8.players).sort((a, b) => b[1].pts - a[1].pts).slice(0, 5);
  console.log("      top 5 week 8:", top.map(([id, v]) => `${id} ${v.pts} (${v.low}-${v.high})${v.kicker ? " K" : ""}`).join(", "));
  check("projections look like fantasy scores (top 5 between 35 and 75)", top.every(([, v]) => v.pts > 35 && v.pts < 75));
  check("ranges sit around the projection", Object.values(w8.players).every((v) => v.pts === 0 || (v.low <= v.pts && v.high >= v.pts)));
  check("Will Jordan (named to start) projected", (p("w.jordan")?.pts ?? 0) > 30, String(p("w.jordan")?.pts));

  // before the lists: week 8's lists hidden -> expected lineup
  const saved = tables.player_week_status;
  tables.player_week_status = saved.filter((x) => x.week !== 8);
  const pre = await weekProjections(db, 2026, 8, { ...STANDARD_SCORING, minutesUpTo60: 1.0000001 }, Date.parse("2026-04-01T00:00:00Z"));
  tables.player_week_status = saved;
  check("before the lists: no team lists out", pre.listsOut.length === 0);
  check("before the lists: projections are 'expected' with wider spreads", Object.values(pre.players).some((v) => v.role === "expected" && v.spread > 0));
  const teamTotal = (d: typeof w8) => Object.values(d.players).reduce((a, v) => a + v.pts, 0);
  check("before vs after the lists: similar totals across all players", Math.abs(teamTotal(pre) / teamTotal(w8) - 1) < 0.25, `${teamTotal(pre).toFixed(0)} vs ${teamTotal(w8).toFixed(0)}`);

  console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})();
