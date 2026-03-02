import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { normalizeLeagueId } from "@/lib/ids";
import { cancelPendingTradesTouchingPlayers, cancelInvalidPendingTradesForTeams } from "@/lib/trades/cancelPendingTrades";

function extractIds(data: any): string[] {
  if (Array.isArray(data?.playerIds)) return data.playerIds.map(String);
  const ids: string[] = [];
  for (const arr of Object.values(data?.slots ?? {})) {
    for (const p of (arr as any[]) ?? []) if (p?.id) ids.push(String(p.id));
  }
  for (const p of (data?.wildcards ?? []) as any[]) if (p?.id) ids.push(String(p.id));
  return ids;
}

async function getWaiverTeamOrder(leagueId: string, week: number): Promise<string[]> {
  // Try to read from waiver_order table (you said you ran SQL for it)
  const { data, error } = await supabaseAdmin
    .from("waiver_order")
    .select("*")
    .eq("league_id", leagueId)
    .eq("week", week)
    .maybeSingle();

  if (error) throw error;
  if (!data) return [];

  // Be flexible about column names (since we haven’t seen the SQL)
  const maybe =
    (data as any).team_ids ??
    (data as any).teamIds ??
    (data as any).order ??
    (data as any).order_team_ids ??
    (data as any).data?.teamIds ??
    (data as any).data?.team_ids;

  if (Array.isArray(maybe)) return maybe.map(String).filter(Boolean);

  return [];
}

export async function POST(req: Request) {
  let leagueId = "";
  let week = 0;

  try {
    const body = await req.json();
    leagueId = String(body.leagueId ?? "").trim();
    week = Number(body.week);

    if (!leagueId || !Number.isFinite(week)) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }

    // Any league member can trigger processing (or restrict to commissioner later)
    await requireLeagueTeam(leagueId);

    const processedAtMs = Date.now();

    const touchedTeamIds = new Set<string>();
const touchedPlayerIds = new Set<string>();

    // ---------------------------------------------
// GLOBAL WAIVER RUN GUARD (idempotent processing)
// ---------------------------------------------

// Ensure a run row exists (idempotent)
// IMPORTANT: use upsert (onConflict belongs here), not insert
// Try to create the run row. If it already exists, do NOT overwrite it.
const { error: runInsertErr } = await supabaseAdmin
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
const { data: runRow, error: runErr } = await supabaseAdmin
  .from("waiver_runs")
  .select("*")
  .eq("league_id", leagueId)
  .eq("week", week)
  .single();

if (runErr) throw runErr;

// If already processed, exit safely
if (String(runRow.status).toUpperCase() === "PROCESSED") {
  return NextResponse.json({
    ok: true,
    alreadyProcessed: true,
    processedAtMs: runRow.processed_at_ms,
  });
}

// If another request already started this run, don’t double-process
if (String(runRow.status).toUpperCase() === "RUNNING" && runRow.started_at_ms !== processedAtMs) {
  return NextResponse.json({
    ok: true,
    alreadyRunning: true,
    startedAtMs: runRow.started_at_ms,
  });
}

    // load pending claims sorted by priority then created
    const { data: claims, error: cErr } = await supabaseAdmin
      .from("waiver_claims")
      .select("*")
      .eq("league_id", leagueId)
      .eq("week", week)
      .eq("status", "PENDING")
      .order("priority", { ascending: true })
      .order("created_at_ms", { ascending: true });

    if (cErr) throw cErr;

    // load rosters for ownership check + updates
    const { data: rosterRows, error: rErr } = await supabaseAdmin
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
    }

    // current locks
    const { data: locks, error: lErr } = await supabaseAdmin
      .from("drop_locks")
      .select("player_id, locked_until_ms")
      .eq("league_id", leagueId)
      .gt("locked_until_ms", processedAtMs);

    if (lErr) throw lErr;
    const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));



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
let teamOrder = await getWaiverTeamOrder(leagueId, week);

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
  const { error: claimFailErr } = await supabaseAdmin
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
  const { error: claimFailErr } = await supabaseAdmin
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

      // apply add/drop to roster (playerIds truth)
      const roster = structuredClone(rosterByTeam.get(teamId) ?? { playerIds: [] });
      const ids = new Set(extractIds(roster));

      if (dropId) ids.delete(dropId);
      ids.add(addId);

      const nextRoster = { ...roster, playerIds: Array.from(ids) };

      const { error: rosterUpsertErr } = await supabaseAdmin
  .from("rosters")
  .upsert(
    { league_id: leagueId, team_id: teamId, data: nextRoster, updated_at: new Date().toISOString() },
    { onConflict: "league_id,team_id" }
  );

if (rosterUpsertErr) throw rosterUpsertErr;

      const { error: claimOkErr } = await supabaseAdmin
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
      // upsert locks by (league_id, player_id) if you set that unique index; otherwise just insert
      const { error: insErr } = await supabaseAdmin.from("drop_locks").insert(newLocks);
      if (insErr) throw insErr;
    }

    // Mark run as processed
const { error: runDoneErr } = await supabaseAdmin
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

    return NextResponse.json({ ok: true, processedAtMs, processedCount: processedClaimIds.length });
  } catch (e: any) {
  const { msg, status } = toHttpError(e);

  // Only attempt to mark FAILED if we have a valid leagueId/week
  if (leagueId && Number.isFinite(week)) {
    const { error: runFailErr } = await supabaseAdmin
  .from("waiver_runs")
  .update({
    status: "FAILED",
    error: String(e?.message ?? e),
    processed_at_ms: Date.now(),
  })
  .eq("league_id", leagueId)
  .eq("week", week);

// Don't throw inside catch; just best-effort log
if (runFailErr) console.error("Failed to mark waiver_run FAILED:", runFailErr);
  }

  return NextResponse.json({ ok: false, error: msg }, { status });
}
}