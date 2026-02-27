import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);
    const toTeamId = String(body.toTeamId ?? "").trim();
    const offerPlayerIds = Array.isArray(body.offerPlayerIds) ? body.offerPlayerIds.map(String) : [];
    const requestPlayerIds = Array.isArray(body.requestPlayerIds) ? body.requestPlayerIds.map(String) : [];
    const note = String(body.note ?? "");

    if (!leagueId || !Number.isFinite(week) || !toTeamId || offerPlayerIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const { teamId: fromTeamId } = await requireLeagueTeam(leagueId);

    const now = Date.now();

    // (Optional but recommended) lock check: any player in offer/request currently locked?
    const { data: locks, error: lockErr } = await supabaseAdmin
      .from("drop_locks")
      .select("player_id, locked_until_ms")
      .eq("league_id", leagueId)
      .gt("locked_until_ms", now);

    if (lockErr) throw lockErr;

    const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));
    for (const pid of [...offerPlayerIds, ...requestPlayerIds]) {
      if (lockedSet.has(pid)) {
        return NextResponse.json({ ok: false, error: "Player is locked" }, { status: 400 });
      }
    }

    // insert
    const { data, error } = await supabaseAdmin
      .from("trade_offers")
      .insert({
        league_id: leagueId,
        week,
        from_team_id: fromTeamId,
        to_team_id: toTeamId,
        offer_player_ids: offerPlayerIds,
        request_player_ids: requestPlayerIds,
        status: "PENDING",
        created_at_ms: now,
        updated_at_ms: now,
        note,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, trade: data });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}