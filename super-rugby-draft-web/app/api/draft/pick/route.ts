// app/api/draft/pick/route.ts
// Make your pick. Body: { leagueId, playerId }. The server works out whose pick it is and checks
// it's yours, the player is free, and he fits your roster's positions (lib/draft/engine).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { DraftError, makePick } from "@/lib/draft/engine";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    const playerId = String(body?.playerId ?? "").trim();
    if (!leagueId || !playerId) return NextResponse.json({ ok: false, error: "Missing leagueId/playerId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    await makePick(supabaseAdmin, leagueId, teamId, playerId, Date.now());
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
