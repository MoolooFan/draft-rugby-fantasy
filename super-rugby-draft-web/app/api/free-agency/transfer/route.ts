import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { buildAndValidateNextIds } from "@/lib/transactions/rosterValidate";

function extractIds(data: any): string[] {
  const ids: string[] = [];

  const pushItem = (x: any) => {
    if (!x) return;
    if (typeof x === "string" || typeof x === "number") {
      ids.push(String(x));
      return;
    }
    if (typeof x === "object") {
      if (x.id != null) ids.push(String(x.id));
      else if (x.playerId != null) ids.push(String(x.playerId));
    }
  };

  // roster might literally be an array
  if (Array.isArray(data)) {
    data.forEach(pushItem);
    return ids;
  }

  // canonical format
  if (Array.isArray(data?.playerIds)) {
    data.playerIds.forEach(pushItem);
    return ids;
  }

  // slot-based format
  const slots = data?.slots ?? {};
  for (const arr of Object.values(slots)) {
    if (!Array.isArray(arr)) continue;
    arr.forEach(pushItem);
  }

  const wildcards = data?.wildcards ?? [];
  if (Array.isArray(wildcards)) wildcards.forEach(pushItem);

  return ids;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    const weekParam = searchParams.get("week");
    const week = weekParam != null ? Number(weekParam) : null;

    if (!leagueId) {
      return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    }

    await requireLeagueTeam(leagueId);

    let q = supabaseAdmin
      .from("free_agent_transfers")
      .select("*")
      .eq("league_id", leagueId);

    if (week != null && Number.isFinite(week)) q = q.eq("week", week);

    const { data, error } = await q.order("created_at_ms", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    console.error("[free-agency/transfer][GET] ERROR:", e);
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);
    const addPlayerId = String(body.addPlayerId ?? "").trim();
    const dropPlayerId = body.dropPlayerId ? String(body.dropPlayerId).trim() : null;

    if (!leagueId || !Number.isFinite(week) || !addPlayerId) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const { teamId } = await requireLeagueTeam(leagueId);
    const now = Date.now();

    async function recordFailed(reason: string, extra?: any) {
      const decidedReason =
        typeof extra?.validationError === "string" ? extra.validationError.slice(0, 200) : null;

      const { data, error } = await supabaseAdmin
        .from("free_agent_transfers")
        .insert({
          league_id: leagueId,
          week,
          team_id: teamId,
          add_player_id: addPlayerId,
          drop_player_id: dropPlayerId,
          status: "FAILED",
          reason,
          decided_reason: decidedReason,
          created_at_ms: now,
          updated_at_ms: now,
        })
        .select("*")
        .single();

      if (error) throw error;

      return NextResponse.json({ ok: true, transfer: data, failReason: reason, extra });
    }

    // NOTE: your frontend sends `lockedUntilMs`
    const lockUntilMsRaw = Number(body.lockedUntilMs ?? body.lockUntilMs);
    const MAX_LOCK_MS = now + 7 * 24 * 60 * 60 * 1000; // 7 days
    const lockUntilMs =
      Number.isFinite(lockUntilMsRaw) && lockUntilMsRaw > now
        ? Math.min(lockUntilMsRaw, MAX_LOCK_MS)
        : now + 24 * 60 * 60 * 1000; // fallback 24h

    // lock check on add (player currently locked)
    const { data: locks, error: lErr } = await supabaseAdmin
      .from("drop_locks")
      .select("player_id")
      .eq("league_id", leagueId)
      .gt("locked_until_ms", now);

    if (lErr) throw lErr;

    const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));
    if (lockedSet.has(addPlayerId)) {
      return recordFailed("ADD_PLAYER_LOCKED");
    }

    // ownership check via rosters (someone already owns this add player)
    const { data: rosterRows, error: rErr } = await supabaseAdmin
      .from("rosters")
      .select("team_id, data")
      .eq("league_id", leagueId);

    if (rErr) throw rErr;

    const owned = new Set<string>();
    for (const row of rosterRows ?? []) {
      for (const pid of extractIds((row as any).data ?? {})) owned.add(pid);
    }

    if (owned.has(addPlayerId)) {
      return recordFailed("ADD_PLAYER_ALREADY_OWNED");
    }

    // load my roster
    const { data: myRow, error: myErr } = await supabaseAdmin
      .from("rosters")
      .select("data")
      .eq("league_id", leagueId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (myErr) throw myErr;

    const roster = structuredClone((myRow as any)?.data ?? { playerIds: [] });
    const currentIds = extractIds(roster);

    // Server-authoritative roster validation + building
    const built = buildAndValidateNextIds({
      currentIds,
      addPlayerId,
      dropPlayerId,
    });

    if (!built.ok) {
      return recordFailed("ROSTER_VALIDATION_FAILED", { validationError: built.error });
    }

    const nextRoster = { ...roster, playerIds: built.nextIds };

    

    const { error: upErr } = await supabaseAdmin.from("rosters").upsert(
      {
        league_id: leagueId,
        team_id: teamId,
        data: nextRoster,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,team_id" }
    );

    if (upErr) throw upErr;

    // record transfer
    const { data: transfer, error: tErr } = await supabaseAdmin
      .from("free_agent_transfers")
      .insert({
        league_id: leagueId,
        week,
        team_id: teamId,
        add_player_id: addPlayerId,
        drop_player_id: dropPlayerId,
        status: "PROCESSED",
        created_at_ms: now,
        updated_at_ms: now,
      })
      .select("*")
      .single();

    if (tErr) throw tErr;

    // add lock to dropped player
    if (dropPlayerId) {
      const { error: delErr } = await supabaseAdmin
        .from("drop_locks")
        .delete()
        .eq("league_id", leagueId)
        .eq("player_id", dropPlayerId);

      if (delErr) throw delErr;

      const { error: insErr } = await supabaseAdmin.from("drop_locks").insert({
        league_id: leagueId,
        week,
        player_id: dropPlayerId,
        locked_until_ms: lockUntilMs,
        dropped_by_team_id: teamId,
        dropped_at_ms: now,
        reason: "FREE_AGENCY_DROP",
      });

      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true, transfer });
  } catch (e: any) {
    console.error("[free-agency/transfer][POST] ERROR:", e);
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}