// scripts/demo-league.ts
// The demo site's league (lib/demo.ts): a copy of Ethan's real 2026 league ("Epstein Try League")
// as it stood at the demo moment (Wednesday 8 April 2026, 7pm NZ: round 8 scored, round 9 not
// yet played), copied from the LOCAL test database into the online test database, with Ethan's
// login as his own team. Everything it adds has ids starting "demo_", so it's easy to remove
// (run with --remove before launch).
//
// Run (from super-rugby-draft-web, local database running):
//   SR_DEMO=1 npx tsx scripts/demo-league.ts --confirm=dbmzgofmjbeeskhwohuv            (copy / refresh)
//   npx tsx scripts/demo-league.ts --confirm=dbmzgofmjbeeskhwohuv --remove             (remove it)
//   SR_DEMO=1 npx tsx scripts/demo-league.ts --local                                   (copy into the local database)
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO_SETTINGS } from "../lib/demo";
import { getSeason, weekFinaliseAtMs } from "../lib/season";

const DEMO_LEAGUE = "demo_league_2026";
const SOURCE_OWNER = "ethanaccount"; // Ethan's team in the local copy of the 2026 league
const NOW_MS = Date.parse(DEMO_SETTINGS.now);
const LAST_WEEK_PLAYED = 8; // 2026: one real round per fantasy week

function env(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
const client = (vars: Record<string, string>) =>
  createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${(error as { message?: string }).message ?? JSON.stringify(error)}`);
  return data as T;
}

const localVars = env(".env.development.local");
const remoteVars = env(".env.local");
if (!/127\.0\.0\.1|localhost/.test(localVars.NEXT_PUBLIC_SUPABASE_URL)) throw new Error(".env.development.local should be the local test database");
// --local: copy into the local database instead (to try the demo on this computer with SR_DEMO=1)
const LOCAL = process.argv.includes("--local");
const remoteHost = new URL(remoteVars.NEXT_PUBLIC_SUPABASE_URL).host;
const confirm = process.argv.find((a) => a.startsWith("--confirm="))?.slice(10) ?? "";
if (!LOCAL && (!remoteHost.startsWith(confirm) || !confirm)) throw new Error(`This changes the online project ${remoteHost}. Run again with --confirm=${remoteHost.split(".")[0]}`);
if (!LOCAL && remoteHost.startsWith("lwgoikbsonppjafkbscz")) throw new Error("That's the OLD live database: never touch it");
const src = client(localVars);
const dst = LOCAL ? client(localVars) : client(remoteVars);

/** Tables the demo league fills, in the order they're added (removed in reverse). */
const TABLES = [
  "draft_state", "draft_picks", "rosters", "team_selections", "league_matchups", "league_week_finalisations",
  "waiver_claims", "free_agent_transfers", "trade_offers", "drop_locks", "waiver_runs",
];
const CLEAN_ONLY = ["chat_messages", "chat_reads", "power_rankings", "team_week_results", "waiver_order", "watchlist", "draft_queue", "honours"];

async function remove(db: SupabaseClient) {
  for (const t of [...CLEAN_ONLY, ...[...TABLES].reverse()]) {
    const { error } = await db.from(t).delete().eq("league_id", DEMO_LEAGUE);
    if (error && !/does not exist|schema cache/.test(error.message)) throw new Error(`${t}: ${error.message}`);
  }
  // chat_reads are per team
  const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", DEMO_LEAGUE), "teams");
  if (teams.length) await db.from("chat_reads").delete().in("team_id", teams.map((t) => t.id));
  await q(db.from("teams").delete().eq("league_id", DEMO_LEAGUE), "teams");
  await q(db.from("leagues").delete().eq("id", DEMO_LEAGUE), "leagues");
}

async function main() {
  if (process.argv.includes("--remove")) {
    await remove(dst);
    console.log(`Removed the demo league from ${remoteHost}.`);
    return;
  }
  if (process.env.SR_DEMO !== "1") throw new Error("Run with SR_DEMO=1 (so the Shield counts from 2026 when the chat posts are written)");

  // --- the local 2026 league
  const srcTeams = await q<Array<Record<string, unknown>>>(src.from("teams").select("*").eq("owner_username", SOURCE_OWNER), "teams");
  const srcLeagueId = String(srcTeams.find((t) => String((t.league_id as string) ?? "").length)?.league_id ?? "");
  if (!srcLeagueId) throw new Error("No 2026 league for ethanaccount in the local database");
  const league = await q<Record<string, unknown>>(src.from("leagues").select("*").eq("id", srcLeagueId).single(), "league");
  const teams = await q<Array<Record<string, unknown>>>(src.from("teams").select("*").eq("league_id", srcLeagueId), "teams");

  // --- Ethan's login on the online database (the site admin)
  const admins = await q<Array<{ id: string; username: string; username_norm: string }>>(dst.from("users").select("id, username, username_norm").eq("is_site_admin", true), "users");
  const me = admins.find((u) => u.username_norm === "stoutman") ?? admins[0];
  if (!me) throw new Error("No site admin account on the online database");

  // --- ids: every team and the league get demo ids
  const idMap = new Map<string, string>([[srcLeagueId, DEMO_LEAGUE]]);
  for (const t of teams) idMap.set(String(t.id), `demo_${t.id}`);
  const ids = [...idMap.keys()].sort((a, b) => b.length - a.length);
  const remap = <T>(row: T): T => {
    let s = JSON.stringify(row);
    for (const id of ids) s = s.split(`"${id}"`).join(`"${idMap.get(id)}"`);
    return JSON.parse(s) as T;
  };
  const rows = async (table: string) => q<Array<Record<string, unknown>>>(src.from(table).select("*").eq("league_id", srcLeagueId), table);

  // --- league and teams
  const demoLeague = remap({
    ...league,
    name: `DEMO · ${league.name} (after round 8)`,
    code: "DEMO26",
    created_by: me.username_norm,
    lineage_id: null,
    schedule_built_at: null,
    schedule_plan: null,
    shield_enabled: true,
    shield_toggles: [],
    // sample Shield rewards so the Shield tab's rewards box shows (no ladder points, so the
    // ladder is as it really was)
    shield_rewards: { firstWaiverPick: true, defencePoints: 0, winPoints: 0, tieBreak: true },
  });
  const demoTeams = teams.map((t) =>
    remap({
      ...t,
      user_id: t.owner_username === SOURCE_OWNER ? me.username_norm : `demo_${t.user_id ?? t.owner_username}`,
      owner_username: t.owner_username === SOURCE_OWNER ? me.username_norm : `demo_${t.owner_username}`,
      recap_seen_week: LAST_WEEK_PLAYED,
    })
  );

  // --- what had happened by the demo moment
  const fa = await rows("free_agent_transfers");
  const claims = await rows("waiver_claims");
  const trades = await rows("trade_offers");
  const locks = await rows("drop_locks");
  const ms = (v: unknown) => Number(v) || 0;
  const faBefore = fa.filter((r) => ms(r.created_at_ms) <= NOW_MS);
  const claimsBefore = claims
    .filter((r) => ms(r.created_at_ms) <= NOW_MS)
    .map((r) =>
      ms(r.processed_at_ms) > NOW_MS || ms(r.decided_at_ms) > NOW_MS
        ? { ...r, status: "PENDING", decided_reason: null, processed_at_ms: null, decided_at_ms: null }
        : r
    );
  const tradesBefore = trades.filter((r) => Date.parse(String(r.created_at)) <= NOW_MS);
  const locksBefore = locks.filter((r) => ms(r.dropped_at_ms) <= NOW_MS);

  // rosters: undo every add / drop that happened after the demo moment (newest first)
  const rosters = await rows("rosters");
  const later = [
    ...fa.filter((r) => r.status === "PROCESSED" && ms(r.created_at_ms) > NOW_MS).map((r) => ({ at: ms(r.created_at_ms), r })),
    ...claims.filter((r) => r.status === "PROCESSED" && ms(r.processed_at_ms) > NOW_MS).map((r) => ({ at: ms(r.processed_at_ms), r })),
  ].sort((a, b) => b.at - a.at);
  if (trades.some((t) => t.status === "accepted" && Date.parse(String(t.updated_at)) > NOW_MS)) throw new Error("A trade was accepted after the demo moment: undoing trades isn't built");
  const byTeam = new Map(rosters.map((r) => [String(r.team_id), { ...(r.data as Record<string, unknown>), playerIds: [...(((r.data as { playerIds?: string[] }).playerIds) ?? [])] }]));
  let undone = 0;
  for (const { r } of later) {
    const roster = byTeam.get(String(r.team_id));
    if (!roster) continue;
    roster.playerIds = roster.playerIds.filter((p: string) => p !== r.add_player_id);
    if (r.drop_player_id && !roster.playerIds.includes(String(r.drop_player_id))) roster.playerIds.push(String(r.drop_player_id));
    undone++;
  }
  const demoRosters = rosters.map((r) => remap({ ...r, data: byTeam.get(String(r.team_id)) }));

  // matchups: rounds 2-8 played; round 9 on not yet (finals teams not known)
  const matchups = (await rows("league_matchups")).map((m) => {
    const w = Math.min(...(m.weeks as number[]));
    if (m.kind === "regular" && w <= LAST_WEEK_PLAYED) return m;
    return {
      ...m,
      status: "scheduled",
      home_score: null, away_score: null, home_tries: null, away_tries: null, winner_team_id: null,
      home_bonus: 0, away_bonus: 0, finalised_at: null, home_shield_pts: 0, away_shield_pts: 0, shield_holder_after: null,
      ...(m.kind === "regular" ? {} : { home_team_id: null, away_team_id: null }),
    };
  });
  const fins = (await rows("league_week_finalisations")).filter((r) => Number(r.week) <= LAST_WEEK_PLAYED);
  const selections = (await rows("team_selections")).filter((r) => Number(r.week) <= LAST_WEEK_PLAYED + 1);
  const runs = (await rows("waiver_runs")).filter((r) => Number(r.week) <= LAST_WEEK_PLAYED);

  // --- write (replacing any earlier demo copy)
  await remove(dst);
  await q(dst.from("leagues").insert(demoLeague), "leagues");
  await q(dst.from("teams").insert(demoTeams), "teams");
  const put = async (table: string, list: Array<Record<string, unknown>>) => {
    // in the same database the original rows' own ids are taken, so let it give new ones
    // (draft_picks has text ids with no default, so those get a demo_ prefix)
    const fresh = (r: Record<string, unknown>) =>
      !LOCAL || !("id" in r) ? r : table === "draft_picks" ? { ...r, id: `demo_${r.id}` } : Object.fromEntries(Object.entries(r).filter(([k]) => k !== "id"));
    for (let i = 0; i < list.length; i += 500) await q(dst.from(table).insert(list.slice(i, i + 500).map(remap).map(fresh)), table);
  };
  await put("draft_state", await rows("draft_state").catch(() => []));
  await put("draft_picks", await rows("draft_picks"));
  await put("rosters", demoRosters);
  await put("team_selections", selections);
  await put("league_matchups", matchups);
  await put("league_week_finalisations", fins);
  await put("waiver_claims", claimsBefore);
  await put("free_agent_transfers", faBefore);
  await put("trade_offers", tradesBefore);
  await put("drop_locks", locksBefore);
  await put("waiver_runs", runs);

  // --- the league chat's automated posts for rounds 2-8 (dated when each round was scored)
  const { postRoundPosts } = await import("../lib/chat/server");
  const s = getSeason(DEMO_SETTINGS.season);
  for (let w = Number(league.first_week) || 1; w <= LAST_WEEK_PLAYED; w++) {
    try {
      await postRoundPosts(dst, DEMO_LEAGUE, w);
    } catch (e) {
      console.log(`  (chat posts for week ${w} skipped: ${e instanceof Error ? e.message : e})`);
      continue;
    }
    const at = weekFinaliseAtMs(s, w);
    // posts just written are dated "now" (after the demo moment); earlier rounds' are already re-dated
    if (at) await q(dst.from("chat_messages").update({ created_at: new Date(at).toISOString() }).eq("league_id", DEMO_LEAGUE).gt("created_at", DEMO_SETTINGS.now), "chat dates");
  }

  console.log(`Demo league copied to ${LOCAL ? "the local database" : remoteHost}: "${demoLeague.name}" (${DEMO_LEAGUE})`);
  console.log(`  ${demoTeams.length} teams (yours: ${me.username}), ${matchups.length} games (weeks up to ${LAST_WEEK_PLAYED} played), ${selections.length} lineups`);
  console.log(`  ${faBefore.length} free agent moves, ${claimsBefore.length} waiver claims, ${tradesBefore.length} trade offers before the demo moment; ${undone} later moves undone on the rosters`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
