// app/api/leagues/shield/route.ts
// A league's Shield for the League page's Shield tab (members only): holder, defences, next
// shield game, this season's shield games and every holder so far.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { loadShield } from "@/lib/league/shieldServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    await requireLeagueTeam(leagueId);
    return NextResponse.json({ ok: true, shield: await loadShield(supabaseAdmin, leagueId) });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
