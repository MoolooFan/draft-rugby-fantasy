// app/api/draft/queue/route.ts
// Your draft watchlist, in order (auto-pick takes from it first).
// POST { leagueId, playerIds } replaces it with this list, in this order.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { setDraftQueue } from "@/lib/draft/engine";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    const playerIds = Array.isArray(body?.playerIds) ? body.playerIds.map(String) : null;
    if (!leagueId || !playerIds) return NextResponse.json({ ok: false, error: "Missing leagueId/playerIds" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    await setDraftQueue(supabaseAdmin, leagueId, teamId, playerIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
