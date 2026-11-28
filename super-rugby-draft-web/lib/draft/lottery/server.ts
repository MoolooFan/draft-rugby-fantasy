// lib/draft/lottery/server.ts
// The draft lottery on the server (Ethan, 28 Nov 2026).
// - The commissioner sets a time (before the draft). One run waits at a time; changing the time
//   moves it, cancelling deletes it. Nothing about the result exists until it runs.
// - At that time (whoever looks first: the Draft Room, the 5-minute job, or the draft starting)
//   the server picks a random seed, runs the race and saves the draft order. Every phone then
//   replays the same race from the seed, timed from ran_at, so everyone watching sees it together.
// - Reruns: the commissioner sets another time, like the first; every run stays listed, so the
//   league sees "Run 2 (rerun)" and can't be quietly rerolled.
// - The commissioner can still arrange the order by hand afterwards (marked as such).
import { randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOTTERY_BEFORE_DRAFT_MS, LOTTERY_MIN_NOTICE_MS, lotteryOrder, MAX_LOTTERY_TEAMS } from "./sim";
export { LOTTERY_BEFORE_DRAFT_MS, LOTTERY_MIN_NOTICE_MS };

type Db = SupabaseClient;

export type LotteryRow = {
  id: string;
  league_id: string;
  run_number: number;
  scheduled_at: string;
  created_by: string;
  created_at: string;
  ran_at: string | null;
  seed: number | null;
  team_ids: string[] | null;
  result_team_ids: string[] | null;
};


export class LotteryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

/** Every run for the league, first first. */
export async function getLotteries(db: Db, leagueId: string): Promise<LotteryRow[]> {
  const rows = await q<LotteryRow[]>(db.from("draft_lotteries").select("*").eq("league_id", leagueId).order("run_number"));
  return rows.map((r) => ({ ...r, seed: r.seed == null ? null : Number(r.seed) }));
}

async function preDraft(db: Db, leagueId: string) {
  const s = await q<{ phase: string } | null>(db.from("draft_state").select("phase").eq("league_id", leagueId).maybeSingle());
  return !s || (s.phase !== "live" && s.phase !== "complete");
}

/**
 * Runs the waiting lottery if its time has come (or straight away with `now: true`, when the
 * draft is starting first). Returns the run if this call ran it. Safe to call from several
 * places at once: only one of them gets to run it.
 */
export async function runDueLottery(db: Db, leagueId: string, nowMs: number, opts: { now?: boolean } = {}): Promise<LotteryRow | null> {
  const waiting = await q<LotteryRow | null>(db.from("draft_lotteries").select("*").eq("league_id", leagueId).is("ran_at", null).maybeSingle());
  if (!waiting) return null;
  const dueMs = new Date(waiting.scheduled_at).getTime();
  if (!opts.now && dueMs > nowMs) return null;
  if (!(await preDraft(db, leagueId))) return null;

  // the teams as they are now, in the order they joined (lane 1 = first to join)
  const teams = (await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", leagueId).order("created_at"))).map((t) => t.id);
  if (teams.length < 2 || teams.length > MAX_LOTTERY_TEAMS) return null;

  const seed = randomInt(0, 4294967296);
  const order = lotteryOrder(teams, seed);
  // the race is timed from when it was due (or now, if it's run early for the draft)
  const ranAt = new Date(Math.min(dueMs, nowMs)).toISOString();
  const ran = await q<LotteryRow[]>(
    db.from("draft_lotteries").update({ ran_at: ranAt, seed, team_ids: teams, result_team_ids: order }).eq("id", waiting.id).is("ran_at", null).select()
  );
  if (!ran.length) return null; // someone else ran it a moment ago

  const { data: state } = await db.from("draft_state").select("league_id").eq("league_id", leagueId).maybeSingle();
  const fields = { draft_order_team_ids: order, order_edited: true, order_source: "lottery", updated_at: new Date(nowMs).toISOString() };
  if (state) await q(db.from("draft_state").update(fields).eq("league_id", leagueId));
  else await q(db.from("draft_state").insert({ league_id: leagueId, phase: "preDraft", pick_index: 1, missed_in_row: {}, ...fields }));
  return { ...ran[0], seed: Number(ran[0].seed) };
}

/** Leagues with a lottery waiting that's due (for the 5-minute job). */
export async function dueLotteryLeagues(db: Db, nowMs: number): Promise<string[]> {
  const rows = await q<Array<{ league_id: string }>>(
    db.from("draft_lotteries").select("league_id").is("ran_at", null).lte("scheduled_at", new Date(nowMs).toISOString())
  );
  return [...new Set(rows.map((r) => r.league_id))];
}

/** Commissioner: set (or move) the waiting run's time. */
export async function scheduleLottery(db: Db, leagueId: string, username: string, atMs: number, nowMs: number): Promise<LotteryRow> {
  if (!Number.isFinite(atMs)) throw new LotteryError("Pick a time for the lottery");
  await runDueLottery(db, leagueId, nowMs); // one that's already due runs first (this becomes a rerun)
  if (!(await preDraft(db, leagueId))) throw new LotteryError("The draft has started, so the lottery can't run now", 409);
  if (atMs < nowMs + LOTTERY_MIN_NOTICE_MS) throw new LotteryError("Pick a time at least a minute from now, so people can come and watch");
  const league = await q<{ draft_at: string | null }>(db.from("leagues").select("draft_at").eq("id", leagueId).single());
  if (league.draft_at && atMs > new Date(league.draft_at).getTime() - LOTTERY_BEFORE_DRAFT_MS) {
    throw new LotteryError("The lottery has to be at least 5 minutes before the draft starts");
  }
  const teams = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", leagueId));
  if (teams.length > MAX_LOTTERY_TEAMS) throw new LotteryError(`The lottery takes up to ${MAX_LOTTERY_TEAMS} teams`);

  const at = new Date(atMs).toISOString();
  const runs = await getLotteries(db, leagueId);
  const waiting = runs.find((r) => !r.ran_at);
  if (waiting) {
    const rows = await q<LotteryRow[]>(db.from("draft_lotteries").update({ scheduled_at: at, created_by: username }).eq("id", waiting.id).is("ran_at", null).select());
    if (!rows.length) throw new LotteryError("That lottery has just run", 409);
    return rows[0];
  }
  const runNumber = runs.reduce((m, r) => Math.max(m, r.run_number), 0) + 1;
  return q<LotteryRow>(db.from("draft_lotteries").insert({ league_id: leagueId, run_number: runNumber, scheduled_at: at, created_by: username }).select().single());
}

/** Commissioner: cancel the waiting run (it never ran, so nothing about it is kept). */
export async function cancelLottery(db: Db, leagueId: string, nowMs: number) {
  await runDueLottery(db, leagueId, nowMs); // too late once it's due: it runs
  await q(db.from("draft_lotteries").delete().eq("league_id", leagueId).is("ran_at", null));
}
