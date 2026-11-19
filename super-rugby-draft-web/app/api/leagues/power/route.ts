// app/api/leagues/power/route.ts
// A league's weekly power rankings (members only): lib/league/powerServer.ts.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { loadPower } from "@/lib/league/powerServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    return NextResponse.json({ ok: true, myTeamId: teamId, power: await loadPower(supabaseAdmin, leagueId) });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
