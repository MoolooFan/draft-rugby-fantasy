import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

async function upsertRoster(leagueId: string, teamId: string, data: any) {
  const { error } = await supabaseAdmin
    .from("rosters")
    .upsert(
      { league_id: leagueId, team_id: teamId, data, updated_at: new Date().toISOString() },
      { onConflict: "league_id,team_id" }
    );
  if (error) throw error;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tradeId = String(body.tradeId ?? "").trim();
    const action = String(body.action ?? "").trim().toUpperCase(); // ACCEPT | DECLINE | CANCEL

    if (!tradeId || !["ACCEPT", "DECLINE", "CANCEL"].includes(action)) {
      return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }

    // load trade
    const { data: trade, error: tErr } = await supabaseAdmin
      .from("trade_offers")
      .select("*")
      .eq("id", tradeId)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!trade) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (String(trade.status).toUpperCase() !== "PENDING") {
      return NextResponse.json({ ok: false, error: "Trade not pending" }, { status: 400 });
    }

    const leagueId = String(trade.league_id);
    const { teamId: myTeamId } = await requireLeagueTeam(leagueId);

    const fromTeamId = String(trade.from_team_id);
    const toTeamId = String(trade.to_team_id);

    const now = Date.now();

    // auth:
    if (action === "CANCEL" && myTeamId !== fromTeamId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (action === "DECLINE" && myTeamId !== toTeamId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (action === "ACCEPT" && myTeamId !== toTeamId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // For ACCEPT: apply roster swap (read rosters, mutate, write back)
    if (action === "ACCEPT") {
      const offerIds = (trade.offer_player_ids ?? []).map(String);
      const requestIds = (trade.request_player_ids ?? []).map(String);

      // lock check
      const { data: locks, error: lockErr } = await supabaseAdmin
        .from("drop_locks")
        .select("player_id")
        .eq("league_id", leagueId)
        .gt("locked_until_ms", now);

      if (lockErr) throw lockErr;
      const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));
      for (const pid of [...offerIds, ...requestIds]) {
        if (lockedSet.has(pid)) {
          return NextResponse.json({ ok: false, error: "Player is locked" }, { status: 400 });
        }
      }

      // load rosters
      const { data: rosterRows, error: rErr } = await supabaseAdmin
        .from("rosters")
        .select("team_id, data")
        .eq("league_id", leagueId)
        .in("team_id", [fromTeamId, toTeamId]);

      if (rErr) throw rErr;

      const byTeam = new Map<string, any>();
      for (const row of rosterRows ?? []) byTeam.set(String((row as any).team_id), (row as any).data ?? {});

      const fromRoster = structuredClone(byTeam.get(fromTeamId) ?? { playerIds: [] });
      const toRoster = structuredClone(byTeam.get(toTeamId) ?? { playerIds: [] });

      // NOTE: your roster “data” currently seems to contain either
      // { playerIds: [] } or { slots: {...}, wildcards: [...] }
      // We will support BOTH by converting to playerIds set then writing back the same structure.

      const extractIds = (data: any): string[] => {
        if (Array.isArray(data?.playerIds)) return data.playerIds.map(String);
        const ids: string[] = [];
        for (const arr of Object.values(data?.slots ?? {})) {
          for (const p of (arr as any[]) ?? []) if (p?.id) ids.push(String(p.id));
        }
        for (const p of (data?.wildcards ?? []) as any[]) if (p?.id) ids.push(String(p.id));
        return ids;
      };

      const writeIdsBack = (data: any, ids: string[]) => {
        // if original was playerIds-based, keep it that way
        if (Array.isArray(data?.playerIds) || Object.keys(data ?? {}).length === 0) {
          return { ...data, playerIds: ids };
        }
        // otherwise leave complex slots as-is (trade UI already had local balancing)
        // SAFEST: store playerIds alongside slots for server truth
        return { ...data, playerIds: ids };
      };

      const fromIds = new Set(extractIds(fromRoster));
      const toIds = new Set(extractIds(toRoster));

      for (const pid of offerIds) fromIds.delete(pid);
      for (const pid of requestIds) toIds.delete(pid);
      for (const pid of offerIds) toIds.add(pid);
      for (const pid of requestIds) fromIds.add(pid);

      const nextFrom = Array.from(fromIds);
      const nextTo = Array.from(toIds);

      await upsertRoster(leagueId, fromTeamId, writeIdsBack(fromRoster, nextFrom));
      await upsertRoster(leagueId, toTeamId, writeIdsBack(toRoster, nextTo));
    }

    // update trade row
    const patch: any =
      action === "ACCEPT"
        ? { status: "ACCEPTED", accepted_at_ms: now, updated_at_ms: now }
        : action === "DECLINE"
        ? { status: "DECLINED", declined_at_ms: now, decided_at_ms: now, decided_reason: String(body.reason ?? ""), updated_at_ms: now }
        : { status: "CANCELLED", cancelled_at_ms: now, decided_at_ms: now, updated_at_ms: now };

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("trade_offers")
      .update(patch)
      .eq("id", tradeId)
      .select("*")
      .single();

    if (uErr) throw uErr;

    return NextResponse.json({ ok: true, trade: updated });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}