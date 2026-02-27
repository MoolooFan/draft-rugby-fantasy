import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { buildAndValidateNextIds } from "@/lib/transactions/rosterValidate";

function extractIds(data: any): string[] {
  if (Array.isArray(data?.playerIds)) return data.playerIds.map(String);
  const ids: string[] = [];
  for (const arr of Object.values(data?.slots ?? {})) {
    for (const p of (arr as any[]) ?? []) if (p?.id) ids.push(String(p.id));
  }
  for (const p of (data?.wildcards ?? []) as any[]) if (p?.id) ids.push(String(p.id));
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

    // must be a league member
    await requireLeagueTeam(leagueId);

    let q = supabaseAdmin
      .from("waiver_claims")
      .select("*")
      .eq("league_id", leagueId);

    if (week != null && Number.isFinite(week)) q = q.eq("week", week);

    const { data, error } = await q
      .order("week", { ascending: true })
      .order("team_id", { ascending: true })
      .order("priority", { ascending: true })
      .order("created_at_ms", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);
    const orderedIds: string[] = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];

    if (!leagueId || !Number.isFinite(week) || !orderedIds.length) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const { teamId } = await requireLeagueTeam(leagueId);

    // Update priorities 1..N for this team/week only
    // (Do it row-by-row to avoid SQL function requirements)
    const now = Date.now();
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const { error } = await supabaseAdmin
        .from("waiver_claims")
        .update({ priority: i + 1, updated_at_ms: now })
        .eq("id", id)
        .eq("league_id", leagueId)
        .eq("week", week)
        .eq("team_id", teamId)
        .eq("status", "PENDING");
      if (error) throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
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

// 1) lock check on add
const { data: locks, error: lErr } = await supabaseAdmin
  .from("drop_locks")
  .select("player_id")
  .eq("league_id", leagueId)
  .gt("locked_until_ms", now);

if (lErr) throw lErr;
const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));
if (lockedSet.has(addPlayerId)) {
  return NextResponse.json({ ok: false, error: "Player is locked." }, { status: 400 });
}

// 2) global ownership check via rosters
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
  return NextResponse.json({ ok: false, error: "Player already owned." }, { status: 400 });
}

// 3) load my roster and validate add/drop would be legal
const myRow = (rosterRows ?? []).find((r: any) => String(r.team_id) === teamId);
const roster = structuredClone((myRow as any)?.data ?? { playerIds: [] });
const currentIds = extractIds(roster);

const built = buildAndValidateNextIds({
  currentIds,
  addPlayerId,
  dropPlayerId,
});

if (!built.ok) {
  return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
}

    const { data: existing, error: e1 } = await supabaseAdmin
      .from("waiver_claims")
      .select("priority")
      .eq("league_id", leagueId)
      .eq("week", week)
      .eq("team_id", teamId);

    if (e1) throw e1;

    const maxPri = (existing ?? []).reduce((m, x: any) => Math.max(m, Number(x.priority) || 0), 0);
    

    const { data, error } = await supabaseAdmin
      .from("waiver_claims")
      .insert({
        league_id: leagueId,
        week,
        team_id: teamId,
        add_player_id: addPlayerId,
        drop_player_id: dropPlayerId,
        priority: maxPri + 1,
        status: "PENDING",
        created_at_ms: now,
        updated_at_ms: now,
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, claim: data });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  try {
    const { data: row, error: e0 } = await supabaseAdmin
      .from("waiver_claims")
      .select("league_id, team_id, status")
      .eq("id", id)
      .maybeSingle();

    if (e0) throw e0;
    if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const leagueId = String(row.league_id);
    const { teamId } = await requireLeagueTeam(leagueId);

    if (String(row.team_id) !== teamId) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    if (String(row.status).toUpperCase() !== "PENDING") return NextResponse.json({ ok: false, error: "Not pending" }, { status: 400 });

    const { error } = await supabaseAdmin.from("waiver_claims").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}