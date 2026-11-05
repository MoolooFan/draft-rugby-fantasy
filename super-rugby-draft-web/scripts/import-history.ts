// scripts/import-history.ts
// Imports past seasons into the database: the 2026 league's results (from the Google Sheet
// backup + backups/history.json) and the honours list (2025 and 2026).
// Safe to run more than once: it replaces what it imported before.
//
// Run (from super-rugby-draft-web):  npx tsx scripts/import-history.ts
// (On Node 20, first set NODE_OPTIONS=--experimental-websocket; not needed on Node 22, item 10.)
// Needs backups/history.json and the 2026 sheet backup (private, not in git).
// Uses the keys in .env.development.local (local test database) unless told otherwise.
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd(), true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase URL / service role key in the env files");
const db = createClient(url, key, { auth: { persistSession: false } });

const BACKUPS = path.resolve(process.cwd(), "../backups");
const history = JSON.parse(fs.readFileSync(path.join(BACKUPS, "history.json"), "utf8"));
const sheetCsv = fs.readFileSync(path.join(BACKUPS, "2026-11-04/league-fixtures-and-results-sheet.csv"), "utf8");

function must<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

async function main() {
  const h26 = history["2026"];
  const [firstWeek, lastRegularWeek] = h26.regularSeasonWeeks as [number, number];

  // --- 2026 league + its teams
  const rows = sheetCsv.split(/\r?\n/).filter(Boolean).slice(1).map((l) => l.split(","));
  const someTeamId = rows[0][6];
  const team = must(await db.from("teams").select("league_id").eq("id", someTeamId).single()) as { league_id: string };
  const leagueId = team.league_id;
  const league = must(await db.from("leagues").select("id, name").eq("id", leagueId).single()) as { id: string; name: string };
  const teams = must(await db.from("teams").select("id, owner_username").eq("league_id", leagueId)) as Array<{ id: string; owner_username: string }>;
  const teamByOwner = new Map(teams.map((t) => [t.owner_username, t.id]));
  const tid = (owner: string) => {
    const id = teamByOwner.get(owner);
    if (!id) throw new Error(`No team for ${owner}`);
    return id;
  };

  // --- regular season from the sheet (the scores Ethan typed are the official ones)
  const matchups: Record<string, unknown>[] = [];
  for (const c of rows) {
    const week = Number(c[2]);
    if (week < firstWeek || week > lastRegularWeek || c[8] !== "complete") continue;
    const home = c[6];
    const away = c[7] || null;
    const hs = Number(c[9]);
    const as = away ? Number(c[10]) : null;
    matchups.push({
      league_id: leagueId,
      kind: "regular",
      weeks: [week],
      home_team_id: home,
      away_team_id: away,
      status: "final",
      home_score: hs,
      away_score: as,
      winner_team_id: away == null || hs === as ? null : hs > (as as number) ? home : away,
      finalised_at: new Date().toISOString(),
    });
  }

  // --- playoffs
  for (const p of h26.playoffs) {
    const home = tid(p.home);
    const away = tid(p.away);
    matchups.push({
      league_id: leagueId,
      kind: "finals",
      playoff_key: p.key,
      label: p.label,
      weeks: [p.week],
      home_team_id: home,
      away_team_id: away,
      home_source: p.homeSeed ? { seed: p.homeSeed } : null,
      away_source: p.awaySeed ? { seed: p.awaySeed } : null,
      decides: p.decides ?? null,
      status: "final",
      home_score: p.homeScore,
      away_score: p.awayScore,
      winner_team_id: p.homeScore > p.awayScore ? home : away,
      finalised_at: new Date().toISOString(),
    });
  }

  must(await db.from("league_matchups").delete().eq("league_id", leagueId));
  must(await db.from("league_matchups").insert(matchups));
  must(
    await db
      .from("leagues")
      .update({ season: 2026, first_week: firstWeek, bonus_points: false, playoff_format: h26.finalsFormat })
      .eq("id", leagueId)
  );

  // --- honours
  must(await db.from("honours").delete().in("season", [2025, 2026]));
  const honours = [
    ...h26.honours.map((x: { person: string; place: string }) => ({
      season: 2026, league_id: leagueId, league_name: league.name, person_name: x.person, place: x.place,
    })),
    ...history["2025"].honours.map((x: { person: string; place: string }) => ({
      season: 2025, league_id: null, league_name: history["2025"].leagueName, person_name: x.person, place: x.place,
    })),
  ];
  must(await db.from("honours").insert(honours));

  const regular = matchups.filter((m) => m.kind === "regular").length;
  console.log(`2026 league "${league.name}": ${regular} regular-season rows (weeks ${firstWeek}-${lastRegularWeek}), ${h26.playoffs.length} finals`);
  console.log(`Honours: ${honours.length} rows (2025 and 2026)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
