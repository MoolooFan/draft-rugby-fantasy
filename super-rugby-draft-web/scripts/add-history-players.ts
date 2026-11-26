// scripts/add-history-players.ts
// Past seasons' players who didn't place (Ethan, 26 Nov 2026: Isaac and Josh were missing from
// Admin -> History): adds a 'played' honours row for everyone in backups/history.json's
// "players" lists who has no honours row for that season yet. Keeps the account link a name
// already has (user_id) and the season's league details. Safe to run again (adds only what's missing).
//
// Run (from super-rugby-draft-web):  npx tsx scripts/add-history-players.ts
//   online 2027 database:            npx tsx scripts/add-history-players.ts --live --confirm=<project address>
// Needs backups/history.json (private, not in git).
import fs from "node:fs";
import path from "node:path";
import { scriptDb } from "./lib/db";

const { db } = scriptDb();
const history = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../backups/history.json"), "utf8")) as Record<string, { leagueName?: string; players?: string[] }>;

type Row = { season: number; league_id: string | null; league_name: string; lineage_id: string | null; person_name: string; user_id: string | null; place: string };

(async () => {
  const { data, error } = await db.from("honours").select("season, league_id, league_name, lineage_id, person_name, user_id, place");
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const linked = new Map<string, string>();
  for (const r of rows) if (r.user_id) linked.set(r.person_name, r.user_id);

  const add: Row[] = [];
  for (const [key, h] of Object.entries(history)) {
    const season = Number(key);
    if (!Number.isFinite(season) || !h.players?.length) continue;
    const seasonRows = rows.filter((r) => r.season === season);
    const like = seasonRows[0];
    for (const person of h.players) {
      if (seasonRows.some((r) => r.person_name === person)) continue;
      add.push({
        season,
        league_id: like?.league_id ?? null,
        league_name: like?.league_name ?? h.leagueName ?? `${season} league`,
        lineage_id: like?.lineage_id ?? null,
        person_name: person,
        user_id: linked.get(person) ?? null,
        place: "played",
      });
    }
  }
  if (add.length) {
    const { error: e2 } = await db.from("honours").insert(add);
    if (e2) throw e2;
  }
  console.log(add.length ? `Added: ${add.map((r) => `${r.person_name} (${r.season})`).join(", ")}` : "Nothing missing");
})();
