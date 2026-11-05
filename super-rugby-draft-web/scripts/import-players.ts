// scripts/import-players.ts
// Loads the 2026 player pool (from the players Google Sheet backup) into the database:
//   - season 2026: every player, with the weekly statuses from 2026
//   - season 2027: the same pool as a starting point (statuses blank; Moana Pasifika players
//     hidden as they aren't in the 2027 competition). Replace with the official 2027 list when
//     it comes out; Ethan edits positions/draft ranks on the admin page.
// playfantasyrugby ids come from lib/players/externalIdMap.ts.
// Safe to run again: it replaces both seasons' players (and 2026 statuses).
//
// Run (from super-rugby-draft-web): npx tsx scripts/import-players.ts
// (On Node 20, first set NODE_OPTIONS=--experimental-websocket.)
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { EXTERNAL_PLAYER_ID_MAP } from "../lib/players/externalIdMap";

loadEnvConfig(process.cwd(), true);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CSV = path.resolve(process.cwd(), "../backups/2026-11-04/sheet-playersCsv.csv");
const POS = new Set(["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"]);
const NOT_IN_2027 = new Set(["MOA", "MOP"]); // Moana Pasifika

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

async function must<T>(p: PromiseLike<{ data: T | null; error: unknown }>) {
  const { data, error } = await p;
  if (error) throw error;
  return data;
}

async function main() {
  const [header, ...rows] = parseCsv(fs.readFileSync(CSV, "utf8"));
  const col = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iId = col("PlayerId"), iFirst = col("firstName"), iLast = col("lastName"), iTeam = col("teamCode");
  const iPos = col("posAbbrev"), iPos2 = header.findIndex((h, i) => h.trim() === "secondaryPosAbbrev" && i !== -1);
  const iRank = col("draftRank"), iStatus = col("status");
  const weekCols = header.map((h, i) => ({ m: h.trim().toLowerCase().match(/^statusw(\d+)$/), i })).filter((x) => x.m).map((x) => ({ week: Number(x.m![1]), i: x.i }));

  const players2026: Record<string, unknown>[] = [];
  const statuses: Record<string, unknown>[] = [];
  const problems: string[] = [];
  for (const r of rows) {
    const id = (r[iId] ?? "").trim();
    if (!id) continue;
    const pos = (r[iPos] ?? "").trim().toUpperCase();
    const pos2 = (r[iPos2] ?? "").trim().toUpperCase();
    if (!POS.has(pos)) { problems.push(`${id}: unknown position "${pos}"`); continue; }
    const rank = Number(r[iRank]);
    players2026.push({
      season: 2026,
      id,
      first_name: (r[iFirst] ?? "").trim(),
      last_name: (r[iLast] ?? "").trim(),
      team_code: (r[iTeam] ?? "").trim().toUpperCase(),
      pos,
      pos2: POS.has(pos2) ? pos2 : null,
      draft_rank: Number.isFinite(rank) && rank > 0 ? rank : null,
      // the id map uses lower-case ids, e.g. "j.fusitu'a"
      external_id: (EXTERNAL_PLAYER_ID_MAP as Record<string, number>)[id.toLowerCase()] ?? null,
      status: (r[iStatus] ?? "").trim() || null,
      active: true,
      updated_by: "import",
    });
    for (const { week, i } of weekCols) {
      const s = (r[i] ?? "").trim();
      if (s) statuses.push({ season: 2026, week, player_id: id, status: s, source: "import", updated_by: "import" });
    }
  }
  const players2027 = players2026.map((p) => ({
    ...p,
    season: 2027,
    status: null,
    active: !NOT_IN_2027.has(String(p.team_code)),
  }));

  for (const season of [2026, 2027]) await must(db.from("players").delete().eq("season", season));
  await must(db.from("player_week_status").delete().eq("season", 2026));
  for (let i = 0; i < players2026.length; i += 500) await must(db.from("players").insert(players2026.slice(i, i + 500)));
  for (let i = 0; i < players2027.length; i += 500) await must(db.from("players").insert(players2027.slice(i, i + 500)));
  for (let i = 0; i < statuses.length; i += 1000) await must(db.from("player_week_status").insert(statuses.slice(i, i + 1000)));

  const noExternal = players2026.filter((p) => p.external_id == null).length;
  console.log(`2026: ${players2026.length} players, ${statuses.length} weekly statuses; ${noExternal} without a playfantasyrugby id`);
  console.log(`2027: ${players2027.length} players (${players2027.filter((p) => !p.active).length} hidden: Moana Pasifika)`);
  if (problems.length) console.log("Skipped:", problems);
}

main().catch((e) => { console.error(e); process.exit(1); });
