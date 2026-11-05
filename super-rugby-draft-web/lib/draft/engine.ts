// lib/draft/engine.ts
// The draft, run on the server (it used to run in each person's browser, so a pick could be
// missed if nobody had the page open, and browsers could disagree).
// - Order: snake. Shuffled each time a team joins; the commissioner can rearrange it until
//   the draft starts.
// - The draft starts at the league's draft time. 90 seconds a pick; when time runs out the
//   server picks from the team's draft watchlist (in order), then the best draft rank in the
//   pool — never breaking the roster's position rules. After 3 missed picks in a row, that team
//   is auto-picked after 10 seconds, until it picks for itself again.
// - The last pick finishes the draft and builds the season schedule.
// Everything is checked here; pages only show the draft and send picks. The database client is
// passed in so pages, the scheduled job and tests share this code.
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSeasonPlayers, type SitePlayer } from "@/lib/players/db";
import { buildScheduleForLeague } from "@/lib/results/engine";
import { ROSTER_SIZE, rosterFits, roundForPick, secondsForTeam, shuffled, teamForPick } from "@/lib/draft/rules";

type Db = SupabaseClient;

export type DraftState = {
  league_id: string;
  phase: string; // preDraft | live | complete
  pick_index: number; // next pick number (1-based)
  draft_order_team_ids: string[] | null;
  pick_deadline_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  missed_in_row: Record<string, number>;
  order_edited: boolean;
};

/** Before the draft: any phase that isn't live or complete (older rows say "scheduled"). */
export function isPreDraft(state: Pick<DraftState, "phase">): boolean {
  return state.phase !== "live" && state.phase !== "complete";
}

export class DraftError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

async function teamIds(db: Db, leagueId: string): Promise<string[]> {
  const rows = await q<Array<{ id: string }>>(db.from("teams").select("id").eq("league_id", leagueId).order("created_at"));
  return rows.map((r) => r.id);
}

/** The league's draft state (created if missing). */
export async function getDraftState(db: Db, leagueId: string): Promise<DraftState> {
  const row = await q<DraftState | null>(db.from("draft_state").select("*").eq("league_id", leagueId).maybeSingle());
  if (row) return { ...row, missed_in_row: row.missed_in_row ?? {} };
  const fresh = { league_id: leagueId, phase: "preDraft", pick_index: 1, draft_order_team_ids: shuffled(await teamIds(db, leagueId)), missed_in_row: {}, order_edited: false };
  await q(db.from("draft_state").upsert(fresh, { onConflict: "league_id" }));
  return { ...fresh, pick_deadline_at: null, started_at: null, completed_at: null };
}

/**
 * Keep the order in step with the league's teams. A team joining reshuffles the whole order,
 * unless the commissioner has arranged it, in which case newcomers go on the end.
 */
export async function refreshDraftOrder(db: Db, leagueId: string, opts: { reshuffle?: boolean } = {}) {
  const state = await getDraftState(db, leagueId);
  if (!isPreDraft(state)) return state.draft_order_team_ids ?? [];
  const teams = await teamIds(db, leagueId);
  const current = (state.draft_order_team_ids ?? []).filter((t) => teams.includes(t));
  const missing = teams.filter((t) => !current.includes(t));
  const order = opts.reshuffle && !state.order_edited ? shuffled(teams) : [...current, ...missing];
  await q(db.from("draft_state").update({ draft_order_team_ids: order, updated_at: new Date().toISOString() }).eq("league_id", leagueId));
  return order;
}

/** Commissioner sets the order (before the draft starts). */
export async function setDraftOrder(db: Db, leagueId: string, order: string[]) {
  const state = await getDraftState(db, leagueId);
  if (!isPreDraft(state)) throw new DraftError("The draft has started, so the order can't change", 409);
  const teams = await teamIds(db, leagueId);
  if (order.length !== teams.length || !teams.every((t) => order.includes(t))) throw new DraftError("The order must include every team once");
  await q(db.from("draft_state").update({ draft_order_team_ids: order, order_edited: true, updated_at: new Date().toISOString() }).eq("league_id", leagueId));
}

type Ctx = {
  state: DraftState;
  order: string[];
  totalPicks: number;
  season: number;
  players: Map<string, SitePlayer>;
  drafted: Set<string>;
  rosters: Map<string, string[]>; // team -> player ids
};

async function loadContext(db: Db, leagueId: string): Promise<Ctx> {
  const state = await getDraftState(db, leagueId);
  const league = await q<{ season: number }>(db.from("leagues").select("season").eq("id", leagueId).single());
  const order = state.draft_order_team_ids ?? [];
  const pool = await loadSeasonPlayers(db, Number(league.season));
  const picks = await q<Array<{ team_id: string; player_id: string }>>(
    db.from("draft_picks").select("team_id, player_id").eq("league_id", leagueId).order("pick_number")
  );
  const rosters = new Map<string, string[]>(order.map((t) => [t, []]));
  for (const p of picks) rosters.set(p.team_id, [...(rosters.get(p.team_id) ?? []), p.player_id]);
  return {
    state,
    order,
    totalPicks: order.length * ROSTER_SIZE,
    season: Number(league.season),
    players: new Map(pool.map((p) => [p.id, p])),
    drafted: new Set(picks.map((p) => p.player_id)),
    rosters,
  };
}

/** Can this team take this player (available, and the roster still fits the position rules)? */
function pickProblem(ctx: Ctx, teamId: string, playerId: string): string | null {
  const player = ctx.players.get(playerId);
  if (!player) return "That player isn't in this season's pool";
  if (ctx.drafted.has(playerId)) return "That player has already been picked";
  const roster = (ctx.rosters.get(teamId) ?? []).map((id) => ctx.players.get(id)).filter((p): p is SitePlayer => !!p);
  if (!rosterFits([...roster, player])) return "That player doesn't fit your roster's positions";
  return null;
}

async function recordPick(db: Db, leagueId: string, ctx: Ctx, teamId: string, playerId: string, nowMs: number, auto: boolean) {
  const pick = ctx.state.pick_index;
  const { error } = await db.from("draft_picks").insert({
    id: `pick_${leagueId}_${pick}`,
    league_id: leagueId,
    team_id: teamId,
    player_id: playerId,
    pick_number: pick,
    round: roundForPick(ctx.order.length, pick),
    auto,
  });
  if (error) {
    // someone else made this pick first (two requests at once)
    if (String((error as { code?: string }).code) === "23505") throw new DraftError("That pick has just been made", 409);
    throw error;
  }

  // roster
  const roster = [...(ctx.rosters.get(teamId) ?? []), playerId];
  ctx.rosters.set(teamId, roster);
  ctx.drafted.add(playerId);
  await q(db.from("rosters").upsert({ league_id: leagueId, team_id: teamId, data: { playerIds: roster }, updated_at: new Date(nowMs).toISOString() }, { onConflict: "league_id,team_id" }));

  // next pick
  const missed = { ...ctx.state.missed_in_row, [teamId]: auto ? (ctx.state.missed_in_row[teamId] ?? 0) + 1 : 0 };
  const next = pick + 1;
  const done = next > ctx.totalPicks;
  // the next clock starts now for a real pick, or when the missed pick was due for an auto-pick
  const startMs = auto && ctx.state.pick_deadline_at ? new Date(ctx.state.pick_deadline_at).getTime() : nowMs;
  const nextTeam = done ? null : teamForPick(ctx.order, next);
  const deadline = nextTeam ? new Date(startMs + secondsForTeam(missed[nextTeam] ?? 0) * 1000).toISOString() : null;
  const patch = {
    pick_index: next,
    missed_in_row: missed,
    pick_deadline_at: deadline,
    phase: done ? "complete" : "live",
    completed_at: done ? new Date(nowMs).toISOString() : null,
    updated_at: new Date(nowMs).toISOString(),
  };
  await q(db.from("draft_state").update(patch).eq("league_id", leagueId));
  ctx.state = { ...ctx.state, ...patch };

  if (done) {
    // A schedule problem (e.g. too few weeks left in the season) must not break the draft.
    try {
      await buildScheduleForLeague(db, leagueId, nowMs);
    } catch (e) {
      console.error("Draft finished but the schedule couldn't be built", leagueId, e);
    }
  }
}

/** A team makes its pick. */
export async function makePick(db: Db, leagueId: string, teamId: string, playerId: string, nowMs: number) {
  await advanceDraft(db, leagueId, nowMs); // any overdue auto-picks first
  const ctx = await loadContext(db, leagueId);
  if (ctx.state.phase !== "live") throw new DraftError(ctx.state.phase === "complete" ? "The draft is finished" : "The draft hasn't started", 409);
  if (teamForPick(ctx.order, ctx.state.pick_index) !== teamId) throw new DraftError("It isn't your pick", 409);
  const problem = pickProblem(ctx, teamId, playerId);
  if (problem) throw new DraftError(problem);
  await recordPick(db, leagueId, ctx, teamId, playerId, nowMs, false);
}

/** The player auto-pick would take: the team's watchlist first, then the best draft rank. */
export async function autoPickChoice(db: Db, leagueId: string, ctx: Ctx, teamId: string): Promise<string | null> {
  const queue = await q<Array<{ player_id: string }>>(
    db.from("draft_queue").select("player_id").eq("league_id", leagueId).eq("team_id", teamId).order("position")
  );
  for (const { player_id } of queue) if (!pickProblem(ctx, teamId, player_id)) return player_id;
  const pool = [...ctx.players.values()].filter((p) => !ctx.drafted.has(p.id)).sort((a, b) => a.draftRank - b.draftRank || a.id.localeCompare(b.id));
  for (const p of pool) if (!pickProblem(ctx, teamId, p.id)) return p.id;
  return null;
}

/**
 * Starts the draft at its time and makes any overdue auto-picks. Called whenever anyone looks
 * at the draft (and by the scheduled job), so it keeps going with nobody watching.
 */
export async function advanceDraft(db: Db, leagueId: string, nowMs: number): Promise<{ autoPicks: number }> {
  let ctx = await loadContext(db, leagueId);
  if (ctx.state.phase === "complete") return { autoPicks: 0 };

  if (ctx.state.phase !== "live") {
    const league = await q<{ draft_at: string | null }>(db.from("leagues").select("draft_at").eq("id", leagueId).single());
    if (!league.draft_at || new Date(league.draft_at).getTime() > nowMs || ctx.order.length < 2) return { autoPicks: 0 };
    const startMs = new Date(league.draft_at).getTime();
    await q(
      db.from("draft_state").update({
        phase: "live",
        pick_index: 1,
        started_at: new Date(startMs).toISOString(),
        pick_deadline_at: new Date(startMs + secondsForTeam(0) * 1000).toISOString(),
        missed_in_row: {},
        is_draft_order_set: true,
        updated_at: new Date(nowMs).toISOString(),
      }).eq("league_id", leagueId)
    );
    await q(db.from("leagues").update({ draft_status: "live", settings_locked_at: new Date(nowMs).toISOString() }).eq("id", leagueId));
    ctx = await loadContext(db, leagueId);
  }

  let autoPicks = 0;
  while (ctx.state.phase === "live" && ctx.state.pick_deadline_at && new Date(ctx.state.pick_deadline_at).getTime() <= nowMs) {
    const teamId = teamForPick(ctx.order, ctx.state.pick_index)!;
    const playerId = await autoPickChoice(db, leagueId, ctx, teamId);
    if (!playerId) throw new DraftError("No player left who fits this roster", 500);
    try {
      await recordPick(db, leagueId, ctx, teamId, playerId, nowMs, true);
      autoPicks++;
    } catch (e) {
      if (e instanceof DraftError && e.status === 409) {
        ctx = await loadContext(db, leagueId); // another request made it; carry on from there
        continue;
      }
      throw e;
    }
  }
  return { autoPicks };
}

/** Replace a team's draft watchlist (in order). */
export async function setDraftQueue(db: Db, leagueId: string, teamId: string, playerIds: string[]) {
  const unique = [...new Set(playerIds.map(String))].slice(0, 200);
  await q(db.from("draft_queue").delete().eq("league_id", leagueId).eq("team_id", teamId));
  if (unique.length) {
    await q(db.from("draft_queue").insert(unique.map((player_id, i) => ({ league_id: leagueId, team_id: teamId, player_id, position: i + 1 }))));
  }
}

export { loadContext as loadDraftContext };
