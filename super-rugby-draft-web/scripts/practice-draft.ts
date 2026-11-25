// scripts/practice-draft.ts
// A practice draft on the TEST site (Ethan, 25 Nov 2026): Ethan makes a throwaway league on the
// test site and joins it; this fills the other spots with computer ("bot") teams that pick through
// the real draft engine (lib/draft/engine.ts), like a person would. Ethan keeps the real 90 s clock.
// Bots pick after a random wait (--speed). "Sleepy" bots never pick, so the site's own clock has to
// auto-pick for them (after 3 misses in a row they get the 10 s clock). Bot teams need no login.
//
// Run from super-rugby-draft-web (online 2027 test database, from .env.local):
//   npx tsx scripts/practice-draft.ts --create --owner=stoutman --in=10 --bots=5 --speed=5-15 --sleepy=1 --confirm=dbmzgofmjbeeskhwohuv   make the league too
//   npx tsx scripts/practice-draft.ts --code=ABC123 --bots=5 --speed=4-12 --sleepy=1 --confirm=dbmzgofmjbeeskhwohuv   add bots, then run them
//   npx tsx scripts/practice-draft.ts --code=ABC123 --run --speed=4-12 --confirm=dbmzgofmjbeeskhwohuv                  just run the bots already added
//   npx tsx scripts/practice-draft.ts --code=ABC123 --remove --confirm=dbmzgofmjbeeskhwohuv                            delete the whole league afterwards
// Add --local to use the local test database; --all-after=N makes the bots pick for every team
// (people too) from pick N, to get to the end quickly.
import crypto from "node:crypto";
import fs from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { advanceDraft, DraftError, getDraftState, loadDraftContext, makePick, refreshDraftOrder } from "../lib/draft/engine";
import { teamForPick } from "../lib/draft/rules";
import { CPU_TEAM_NAMES, cpuPick, draftValues, makePersonality, type Personality } from "../lib/draft/cpu";
import { randomTeamIcon } from "../lib/teams/icons";
import { anyBonus, cleanBonusRules } from "../lib/league/bonus";
import { cleanShieldName, cleanShieldRewards } from "../lib/league/shield";
import { currentSeasonYear, getSeason, totalFantasyWeeks } from "../lib/season";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

function env(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
// --local: the local test database instead (Docker)
const LOCAL = flag("local");
const vars = env(LOCAL ? ".env.development.local" : ".env.local");
const host = new URL(vars.NEXT_PUBLIC_SUPABASE_URL).host;
const confirm = arg("confirm") ?? "";
if (LOCAL && !/127\.0\.0\.1|localhost/.test(host)) throw new Error("--local but the local env file isn't the local database");
if (!LOCAL && (!confirm || !host.startsWith(confirm))) throw new Error(`This changes the online project ${host}. Run again with --confirm=${host.split(".")[0]}`);
if (host.startsWith("lwgoikbsonppjafkbscz")) throw new Error("That's the OLD live database: never touch it");
const db: SupabaseClient = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BOT_PREFIX = "practicebot";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("en-NZ", { hour12: false });

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${(error as { message?: string }).message ?? JSON.stringify(error)}`);
  return data as T;
}

type Team = { id: string; name: string; owner_username: string };

async function findLeague(code: string) {
  const league = await q<{ id: string; name: string; season: number; draft_at: string | null } | null>(
    db.from("leagues").select("id, name, season, draft_at").eq("code", code.toUpperCase()).maybeSingle(),
    "league"
  );
  if (!league) throw new Error(`No league with code ${code}`);
  return league;
}

const teamsOf = (leagueId: string) =>
  q<Team[]>(db.from("teams").select("id, name, owner_username").eq("league_id", leagueId).order("created_at"), "teams");

async function addBots(leagueId: string, count: number) {
  const state = await getDraftState(db, leagueId);
  if (state.phase === "live" || state.phase === "complete") throw new Error("The draft has already started");
  const existing = await teamsOf(leagueId);
  const used = new Set(existing.map((t) => t.name));
  const names = CPU_TEAM_NAMES.filter((n) => !used.has(n));
  const already = existing.filter((t) => t.owner_username.startsWith(BOT_PREFIX)).length;
  for (let i = 0; i < count; i++) {
    const n = already + i + 1;
    const id = `team_${crypto.randomUUID()}`;
    const name = names[i] ?? `Practice Bot ${n}`;
    await q(db.from("teams").insert({ id, league_id: leagueId, name, owner_username: `${BOT_PREFIX}${n}`, user_id: `${BOT_PREFIX}${n}`, picture_url: randomTeamIcon() }), "add bot team");
    await q(db.from("rosters").upsert({ league_id: leagueId, team_id: id, data: { playerIds: [] }, updated_at: new Date().toISOString() }, { onConflict: "league_id,team_id" }), "bot roster");
    console.log(`Added ${name} (${BOT_PREFIX}${n})`);
  }
  await refreshDraftOrder(db, leagueId, { reshuffle: true });
}

async function runBots(leagueId: string, speed: [number, number], sleepyCount: number, allAfter = 0) {
  const teams = await teamsOf(leagueId);
  const bots = teams.filter((t) => t.owner_username.startsWith(BOT_PREFIX));
  if (!bots.length) throw new Error("No bot teams in this league (add some first)");
  // the last N bots are sleepy (they never pick, the site's clock auto-picks for them)
  const sleepy = new Set(bots.slice(bots.length - sleepyCount).map((t) => t.id));
  const name = new Map(teams.map((t) => [t.id, t.name]));
  const personality = new Map<string, Personality>(bots.map((t) => [t.id, makePersonality()]));
  console.log(`Bots: ${bots.map((t) => `${t.name}${sleepy.has(t.id) ? " (sleepy)" : ""}`).join(", ")}`);
  console.log(`Bots pick after ${speed[0]}-${speed[1]} s. Waiting for the draft...`);

  const pool = (await loadDraftContext(db, leagueId)).players;
  const who = (id: string) => { const p = pool.get(id); return p ? `${p.firstName} ${p.lastName} (${p.posAbbrev}, ${p.teamCode})` : id; };
  let lastPick = 0;
  let plannedFor = 0;
  let planAt = 0;
  let lastPhase = "";
  for (;;) {
    const state = await getDraftState(db, leagueId);
    if (state.phase !== lastPhase) {
      console.log(`[${stamp()}] draft is ${state.phase}`);
      lastPhase = state.phase;
    }
    if (state.phase === "complete") {
      console.log(`[${stamp()}] Draft finished.`);
      return;
    }
    if (state.phase === "live") {
      const order = state.draft_order_team_ids ?? [];
      if (state.pick_index !== lastPick) {
        // report the picks made since we last looked (by Ethan, the bots or auto-pick)
        const made = await q<Array<{ pick_number: number; team_id: string; player_id: string; auto: boolean }>>(
          db.from("draft_picks").select("pick_number, team_id, player_id, auto").eq("league_id", leagueId).gt("pick_number", lastPick).order("pick_number"),
          "picks"
        );
        for (const p of made) console.log(`  #${p.pick_number} ${name.get(p.team_id)}: ${who(p.player_id)}${p.auto ? " (auto-pick)" : ""}`);
        lastPick = state.pick_index;
        const next = teamForPick(order, state.pick_index);
        const secs = state.pick_deadline_at ? Math.round((Date.parse(state.pick_deadline_at) - Date.now()) / 1000) : null;
        console.log(`[${stamp()}] pick ${state.pick_index}: ${name.get(next ?? "") ?? "?"} on the clock (${secs ?? "?"} s)`);
      }
      const onClock = teamForPick(order, state.pick_index);
      if (onClock && allAfter && state.pick_index >= allAfter && !personality.has(onClock)) personality.set(onClock, makePersonality());
      if (onClock && personality.has(onClock) && (!sleepy.has(onClock) || (allAfter && state.pick_index >= allAfter))) {
        if (plannedFor !== state.pick_index) {
          plannedFor = state.pick_index;
          planAt = Date.now() + 1000 * (speed[0] + Math.random() * (speed[1] - speed[0]));
        }
        if (Date.now() >= planAt) {
          try {
            const ctx = await loadDraftContext(db, leagueId);
            const all = [...ctx.players.values()];
            const values = draftValues(all, ctx.format, ctx.order.length);
            const roster = (ctx.rosters.get(onClock) ?? []).map((id) => ctx.players.get(id)!).filter(Boolean);
            const choice = cpuPick({ available: all.filter((p) => !ctx.drafted.has(p.id)), roster, format: ctx.format, values, personality: personality.get(onClock)! });
            if (choice) await makePick(db, leagueId, onClock, choice.id, Date.now());
          } catch (e) {
            if (!(e instanceof DraftError && e.status === 409)) console.log(`  ${name.get(onClock)} couldn't pick: ${(e as Error).message}`);
          }
        }
      }
    } else {
      // before the draft: nudge it so it starts on time even if nobody has the page open
      await advanceDraft(db, leagueId, Date.now()).catch(() => undefined);
    }
    await sleep(1500);
  }
}

/** Delete the whole practice league (it's a throwaway). */
async function removeLeague(leagueId: string) {
  const teams = await teamsOf(leagueId);
  const TABLES = [
    "chat_messages", "power_rankings", "team_week_results", "waiver_order", "watchlist", "draft_queue", "draft_strategies", "honours",
    "drop_locks", "trade_offers", "free_agent_transfers", "waiver_claims", "waiver_runs", "league_week_finalisations", "league_matchups",
    "team_selections", "rosters", "draft_picks", "draft_state", "team_difficulty",
  ];
  for (const t of TABLES) {
    const { error } = await db.from(t).delete().eq("league_id", leagueId);
    if (error && !/does not exist|schema cache|column/.test(error.message)) throw new Error(`${t}: ${error.message}`);
  }
  if (teams.length) await db.from("chat_reads").delete().in("team_id", teams.map((t) => t.id));
  await q(db.from("teams").delete().eq("league_id", leagueId), "teams");
  await q(db.from("leagues").delete().eq("id", leagueId), "league");
  console.log(`Removed the league and its ${teams.length} teams.`);
}

/**
 * Make the practice league the way app/api/leagues/create does (standard settings), with --owner as
 * the commissioner and their team, the draft --in minutes from now. Prints the league code.
 */
async function createLeague(owner: string, inMinutes: number) {
  const user = await q<{ username_norm: string } | null>(db.from("users").select("username_norm").eq("username_norm", owner).maybeSingle(), "owner");
  if (!user) throw new Error(`No account called ${owner}`);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = "P" + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const season = currentSeasonYear();
  const weeks = totalFantasyWeeks(getSeason(season));
  const draftAt = new Date(Math.ceil((Date.now() + inMinutes * 60_000) / 60_000) * 60_000);
  // the text the settings pop-up shows ("2026-11-25T20:30", NZ time)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(draftAt).map((p) => [p.type, p.value])
  );
  const leagueId = `league_${crypto.randomUUID()}`;
  const bonusRules = cleanBonusRules(null, true);
  await q(db.from("leagues").insert({
    id: leagueId, name: "Practice Draft", code, created_by: owner, playoff_format: "final4",
    draft_date_time_text: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`, draft_at: draftAt.toISOString(),
    draft_status: "scheduled", season, scoring_system: "standard", scoring_custom: null,
    bonus_points: anyBonus(bonusRules), bonus_rules: bonusRules, squad_format: null,
    shield_enabled: true, shield_name: cleanShieldName(undefined), shield_rewards: cleanShieldRewards(undefined), shield_start: {},
    real_regular_season_rounds: weeks, start_round: 1, total_weeks: weeks, current_week: 1,
  }), "league");
  const teamId = `team_${crypto.randomUUID()}`;
  await q(db.from("teams").insert({ id: teamId, league_id: leagueId, name: arg("team") ?? "Stoutman XV", owner_username: owner, user_id: owner, picture_url: randomTeamIcon() }), "team");
  await getDraftState(db, leagueId);
  await q(db.from("rosters").upsert({ league_id: leagueId, team_id: teamId, data: { playerIds: [] }, updated_at: new Date().toISOString() }, { onConflict: "league_id,team_id" }), "roster");
  console.log(`Made "Practice Draft" (code ${code}), draft at ${parts.hour}:${parts.minute} NZ time`);
  return code;
}

async function main() {
  const code = flag("create") ? await createLeague((arg("owner") ?? "").toLowerCase(), Number(arg("in") ?? 10)) : arg("code");
  if (!code) throw new Error("Give the league code: --code=ABC123");
  const league = await findLeague(code);
  console.log(`League: ${league.name} (${league.id}), season ${league.season}, draft at ${league.draft_at ?? "not set"}`);
  if (flag("remove")) return removeLeague(league.id);
  const [lo, hi] = (arg("speed") ?? "4-12").split("-").map(Number);
  const bots = Number(arg("bots") ?? 0);
  if (bots > 0 && !flag("run")) await addBots(league.id, bots);
  await runBots(league.id, [lo, hi ?? lo], Number(arg("sleepy") ?? 0), Number(arg("all-after") ?? 0));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
