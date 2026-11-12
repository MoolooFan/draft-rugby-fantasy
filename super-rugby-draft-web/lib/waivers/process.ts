// lib/waivers/process.ts (server only)
// Runs one league's waiver claims for a week, once (guarded by waiver_runs). Moved out of
// app/api/waivers/process so the 5-minute job can run waivers at the deadline even when nobody
// opens the Transactions page (13 Nov 2026); the logic is unchanged.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelPendingTradesTouchingPlayers, cancelInvalidPendingTradesForTeams } from "@/lib/trades/cancelPendingTrades";
import { loadRosterPlayers, rosterProblem, updateLineupsAfterRosterChange } from "@/lib/league/rosterChange";
import { healthyIrBlock, irIdsOf } from "@/lib/league/ir";
import { waiverProcessFromMs } from "@/lib/league/deadlines";
import { getSeason, totalFantasyWeeks } from "@/lib/season";

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractIds(data: any): string[] {
  if (Array.isArray(data?.playerIds)) return data.playerIds.map(String);
  const ids: string[] = [];
  for (const arr of Object.values(data?.slots ?? {})) {
    for (const p of (arr as any[]) ?? []) if (p?.id) ids.push(String(p.id));
  }
  for (const p of (data?.wildcards ?? []) as any[]) if (p?.id) ids.push(String(p.id));
  return ids;
}

async function getWaiverTeamOrder(db: SupabaseClient, leagueId: string, week: number): Promise<string[]> {
  // waiver_order is one row per team (league_id, week, team_id, rank)
  const { data, error } = await db
    .from("waiver_order")
    .select("team_id, rank")
    .eq("league_id", leagueId)
    .eq("week", week)
    .order("rank", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .map((r: any) => String(r.team_id))
    .filter(Boolean);
}

export type WaiverRunResult =
  | { ok: true; processedAtMs: number; processedCount: number }
  | { ok: true; alreadyProcessed: true; processedAtMs: number }
  | { ok: true; alreadyRunning: true; startedAtMs: number };

/** Process a league's waivers for a week (safe to call again: it only runs once). */
export async function processWaivers(db: SupabaseClient, leagueId: string, week: number, nowMs: number = Date.now()): Promise<WaiverRunResult> {
  try {
    const processedAtMs = nowMs;

    const touchedTeamIds = new Set<string>();
const touchedPlayerIds = new Set<string>();

    // ---------------------------------------------
// GLOBAL WAIVER RUN GUARD (idempotent processing)
// ---------------------------------------------

// Ensure a run row exists (idempotent)
// IMPORTANT: use upsert (onConflict belongs here), not insert
// Try to create the run row. If it already exists, do NOT overwrite it.
const { error: runInsertErr } = await db
  .from("waiver_runs")
  .insert({
    league_id: leagueId,
    week,
    status: "RUNNING",
    started_at_ms: processedAtMs,
  });

/**
 * If this fails because the row already exists (unique constraint),
 * that's fine — we'll just fetch the existing row below.
 * Any other error should abort.
 */
if (runInsertErr && !String(runInsertErr.message ?? "").toLowerCase().includes("duplicate")) {
  throw runInsertErr;
}

// Fetch run row
const { data: runRow, error: runErr } = await db
  .from("waiver_runs")
  .select("*")
  .eq("league_id", leagueId)
  .eq("week", week)
  .single();

if (runErr) throw runErr;

// If already processed, exit safely
if (String(runRow.status).toUpperCase() === "PROCESSED") {
  return {
    ok: true,
    alreadyProcessed: true,
    processedAtMs: runRow.processed_at_ms,
  };
}

// If another request already started this run, don’t double-process
if (String(runRow.status).toUpperCase() === "RUNNING" && runRow.started_at_ms !== processedAtMs) {
  return {
    ok: true,
    alreadyRunning: true,
    startedAtMs: runRow.started_at_ms,
  };
}

    // load pending claims sorted by priority then created
    const { data: claims, error: cErr } = await db
      .from("waiver_claims")
      .select("*")
      .eq("league_id", leagueId)
      .eq("week", week)
      .eq("status", "PENDING")
      .order("priority", { ascending: true })
      .order("created_at_ms", { ascending: true });

    if (cErr) throw cErr;

    // load rosters for ownership check + updates
    const { data: rosterRows, error: rErr } = await db
      .from("rosters")
      .select("team_id, data")
      .eq("league_id", leagueId);

    if (rErr) throw rErr;

    const rosterByTeam = new Map<string, any>();
    const owned = new Set<string>();

    for (const row of rosterRows ?? []) {
      const teamId = String((row as any).team_id);
      const data = (row as any).data ?? {};
      rosterByTeam.set(teamId, data);
      for (const pid of extractIds(data)) owned.add(pid);
      for (const pid of irIdsOf(data)) owned.add(pid); // IR players are still owned
    }

    // current locks
    const { data: locks, error: lErr } = await db
      .from("drop_locks")
      .select("player_id, locked_until_ms")
      .eq("league_id", leagueId)
      .gt("locked_until_ms", processedAtMs);

    if (lErr) throw lErr;
    const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));

    // positions of every rostered and claimed player (for the position rules)
    const { data: lgRow, error: lgErr } = await db.from("leagues").select("season").eq("id", leagueId).maybeSingle();
    if (lgErr) throw lgErr;
    const rosterPlayers = await loadRosterPlayers(db, Number(lgRow?.season), [
      ...owned,
      ...(claims ?? []).map((c: any) => String(c.add_player_id)),
    ]);

    // Teams whose IR player is fit again can't claim until he's activated.
    const irBlockByTeam = new Map<string, string | null>();
    for (const teamId of new Set((claims ?? []).map((c: any) => String(c.team_id)))) {
      irBlockByTeam.set(
        teamId,
        await healthyIrBlock(db, Number(lgRow?.season), rosterByTeam.get(teamId) ?? {}, { nowMs: processedAtMs })
      );
    }

    // group pending claims per team by (priority asc, created asc)
const pendingByTeam = new Map<string, any[]>();
for (const c of claims ?? []) {
  const teamId = String((c as any).team_id);
  if (!pendingByTeam.has(teamId)) pendingByTeam.set(teamId, []);
  pendingByTeam.get(teamId)!.push(c);
}
for (const [teamId, arr] of pendingByTeam.entries()) {
  arr.sort((a, b) => {
    const ap = Number((a as any).priority) || 9999;
    const bp = Number((b as any).priority) || 9999;
    if (ap !== bp) return ap - bp;
    return (Number((a as any).created_at_ms) || 0) - (Number((b as any).created_at_ms) || 0);
  });
}

// waiver team order
let teamOrder = await getWaiverTeamOrder(db, leagueId, week);

// fallback if table not present/empty: use all teams seen in claims
if (!teamOrder.length) teamOrder = Array.from(pendingByTeam.keys());

// process in passes: each team can get at most 1 SUCCESS per pass
const processedClaimIds: string[] = [];
const newLocks: any[] = [];

let madeProgress = true;
while (madeProgress) {
  madeProgress = false;

  for (const teamId of teamOrder) {
    const queue = pendingByTeam.get(teamId) ?? [];
    if (!queue.length) continue;

    // Try claims until either one succeeds, or none left
    while (queue.length) {
      const c = queue[0];
      const id = String((c as any).id);
      const addId = String((c as any).add_player_id);
      const dropId = (c as any).drop_player_id ? String((c as any).drop_player_id) : null;

      // remove from queue now (we will mark it PROCESSED or FAILED)
      queue.shift();

      // already owned or locked => fail this claim and continue to next claim for this team
      if (owned.has(addId)) {
        const { error: claimFailErr } = await db
          .from("waiver_claims")
          .update({
            status: "FAILED",
            decided_reason: "Player already owned",
            decided_at_ms: processedAtMs,
            processed_at_ms: processedAtMs,
            updated_at_ms: processedAtMs,
          })
          .eq("id", id);

        if (claimFailErr) throw claimFailErr;
        continue;
      }

      if (lockedSet.has(addId)) {
        const { error: claimFailErr } = await db
          .from("waiver_claims")
          .update({
            status: "FAILED",
            decided_reason: "Player is locked",
            decided_at_ms: processedAtMs,
            processed_at_ms: processedAtMs,
            updated_at_ms: processedAtMs,
          })
          .eq("id", id);

        if (claimFailErr) throw claimFailErr;
        continue;
      }

      const irBlock = irBlockByTeam.get(teamId);
      if (irBlock) {
        const { error: claimFailErr } = await db
          .from("waiver_claims")
          .update({
            status: "FAILED",
            decided_reason: irBlock.slice(0, 200),
            decided_at_ms: processedAtMs,
            processed_at_ms: processedAtMs,
            updated_at_ms: processedAtMs,
          })
          .eq("id", id);
        if (claimFailErr) throw claimFailErr;
        continue;
      }

      // IMPORTANT: validate against the team's CURRENT live roster state
      const currentRoster = rosterByTeam.get(teamId) ?? { playerIds: [] };
      const currentIds = new Set(
        Array.isArray(currentRoster?.playerIds)
          ? currentRoster.playerIds.map((x: any) => String(x)).filter(Boolean)
          : extractIds(currentRoster)
      );

      if (dropId && !currentIds.has(dropId)) {
        const { error: claimFailErr } = await db
          .from("waiver_claims")
          .update({
            status: "FAILED",
            decided_reason: "Drop player is no longer on roster",
            decided_at_ms: processedAtMs,
            processed_at_ms: processedAtMs,
            updated_at_ms: processedAtMs,
          })
          .eq("id", id);

        if (claimFailErr) throw claimFailErr;
        continue;
      }

      // apply add/drop to roster (playerIds truth)
// IMPORTANT: do NOT preserve slots/wildcards in DB (they go stale)
const roster = structuredClone(rosterByTeam.get(teamId) ?? { playerIds: [] });

// Only use playerIds array as the source of truth here.
// If old data might not have playerIds, fall back to extractIds.
const teamIr = irIdsOf(roster);
const baseIds: string[] = (Array.isArray((roster as any)?.playerIds)
  ? (roster as any).playerIds.map((x: any) => String(x)).filter(Boolean)
  : extractIds(roster)
).filter((x: string) => !teamIr.includes(x));

const ids = new Set(baseIds);

if (dropId) ids.delete(dropId);
ids.add(addId);

const nextRoster = { playerIds: Array.from(ids) as string[], irIds: teamIr };

      // Size and position rules (so the team can always field a full XV; no drop needed if
      // the team has a free place because a player is in IR)
      const problem = rosterProblem(nextRoster.playerIds, rosterPlayers, baseIds);
      if (problem) {
        const { error: claimFailErr } = await db
          .from("waiver_claims")
          .update({
            status: "FAILED",
            decided_reason: problem,
            decided_at_ms: processedAtMs,
            processed_at_ms: processedAtMs,
            updated_at_ms: processedAtMs,
          })
          .eq("id", id);
        if (claimFailErr) throw claimFailErr;
        continue;
      }

      const { error: rosterUpsertErr } = await db
  .from("rosters")
  .upsert(
    { league_id: leagueId, team_id: teamId, data: nextRoster, updated_at: new Date().toISOString() },
    { onConflict: "league_id,team_id" }
  );

if (rosterUpsertErr) throw rosterUpsertErr;

      const { error: claimOkErr } = await db
  .from("waiver_claims")
  .update({
    status: "PROCESSED",
    decided_at_ms: processedAtMs,
    processed_at_ms: processedAtMs,
    updated_at_ms: processedAtMs,
  })
  .eq("id", id);

if (claimOkErr) throw claimOkErr;

            rosterByTeam.set(teamId, nextRoster);

      if (dropId) owned.delete(dropId);
      owned.add(addId);

      processedClaimIds.push(id);
      madeProgress = true;

      touchedTeamIds.add(teamId);
touchedPlayerIds.add(addId);
if (dropId) touchedPlayerIds.add(dropId);

      // lock dropped player
      if (dropId) {
        newLocks.push({
          league_id: leagueId,
          week,
          player_id: dropId,
          locked_until_ms: processedAtMs + 24 * 60 * 60 * 1000,
          dropped_by_team_id: teamId,
          dropped_at_ms: processedAtMs,
          reason: "WAIVER_PROCESSING",
        });
      }

      // IMPORTANT: only 1 success per team per pass
      break;
    }
  }
}

        if (newLocks.length) {
      const dropPlayerIds = Array.from(
        new Set(
          newLocks
            .map((x: any) => String(x.player_id ?? "").trim())
            .filter(Boolean)
        )
      );

      if (dropPlayerIds.length) {
        const { error: delErr } = await db
          .from("drop_locks")
          .delete()
          .eq("league_id", leagueId)
          .in("player_id", dropPlayerIds);

        if (delErr) throw delErr;
      }

      const { error: insErr } = await db
        .from("drop_locks")
        .insert(newLocks);

      if (insErr) throw insErr;
    }

    // Fix the lineups (and captains) of every team that got players
    if (touchedTeamIds.size) {
      const changed = new Map<string, string[]>();
      for (const t of touchedTeamIds) changed.set(t, (rosterByTeam.get(t)?.playerIds ?? []).map(String));
      try {
        await updateLineupsAfterRosterChange(db, leagueId, changed, processedAtMs);
      } catch (e) {
        console.error("[waivers/process] lineup update failed:", e);
      }
    }

    // Mark run as processed
const { error: runDoneErr } = await db
  .from("waiver_runs")
  .update({
    status: "PROCESSED",
    processed_at_ms: processedAtMs,
  })
  .eq("league_id", leagueId)
  .eq("week", week);

if (runDoneErr) throw runDoneErr;

// Cancel trades affected by waiver roster changes
const touchedTeamsArr = Array.from(touchedTeamIds);
const touchedPlayersArr = Array.from(touchedPlayerIds);

if (touchedPlayersArr.length) {
  await cancelPendingTradesTouchingPlayers({
    leagueId,
    playerIds: touchedPlayersArr,
    reason: "PLAYER_MOVED_BY_WAIVER",
  });
}

if (touchedTeamsArr.length) {
  await cancelInvalidPendingTradesForTeams({
    leagueId,
    teamIds: touchedTeamsArr,
    reason: "ROSTER_CHANGED_BY_WAIVER",
  });
}

    return { ok: true, processedAtMs, processedCount: processedClaimIds.length };
  } catch (e: any) {
    // best effort: mark the run FAILED so it can be tried again
    const { error: runFailErr } = await db
      .from("waiver_runs")
      .update({ status: "FAILED", error: String(e?.message ?? e), processed_at_ms: Date.now() })
      .eq("league_id", leagueId)
      .eq("week", week);
    if (runFailErr) console.error("Failed to mark waiver_run FAILED:", runFailErr);
    throw e;
  }
}

/**
 * The 5-minute job: run every league's waivers that are due (from 24 hours before the lineup
 * deadline) and haven't run yet. Returns what ran.
 */
export async function runDueWaivers(db: SupabaseClient, seasonYear: number, nowMs: number): Promise<string[]> {
  const out: string[] = [];
  const weeks = totalFantasyWeeks(getSeason(seasonYear));
  const { data: leagues, error } = await db.from("leagues").select("id, schedule_plan").eq("season", seasonYear).not("schedule_built_at", "is", null);
  if (error) throw error;
  for (const l of leagues ?? []) {
    const planWeeks: number[] = Array.isArray(l.schedule_plan?.weeks) ? l.schedule_plan.weeks : [];
    const { data: runs } = await db.from("waiver_runs").select("week, status").eq("league_id", l.id);
    const done = new Set((runs ?? []).filter((r) => String(r.status).toUpperCase() === "PROCESSED").map((r) => Number(r.week)));
    for (const w of planWeeks) {
      if (w > weeks || done.has(w)) continue;
      const from = waiverProcessFromMs(seasonYear, w);
      if (from == null || nowMs < from) continue;
      try {
        const r = await processWaivers(db, l.id, w, nowMs);
        if ("processedCount" in r) out.push(`${l.id} week ${w}: ${r.processedCount} claims`);
      } catch (e) {
        out.push(`${l.id} week ${w}: failed (${e instanceof Error ? e.message : String(e)})`);
      }
    }
  }
  return out;
}
