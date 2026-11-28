// GET /api/leagues/round-recap?leagueId=...&week=N -> { ok, recap } a finalised round's league
// recap (lib/league/roundRecap.ts), opened from the "Round N recap" message in the league chat.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam } from "@/lib/league/serverAuth";
import { loadRoundRecap } from "@/lib/league/roundRecap";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const leagueId = String(q.get("leagueId") ?? "").trim();
    const week = Number(q.get("week"));
    if (!leagueId || !Number.isInteger(week) || week < 1) return NextResponse.json({ ok: false, error: "Missing leagueId or week" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const recap = await loadRoundRecap(supabaseAdmin, leagueId, week, teamId);
    if (!recap) return NextResponse.json({ ok: false, error: "That round hasn't been finalised yet" }, { status: 404 });
    return NextResponse.json({ ok: true, recap }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't load the recap";
    const status = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
