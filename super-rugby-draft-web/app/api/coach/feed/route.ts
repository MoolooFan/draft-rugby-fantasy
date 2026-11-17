// app/api/coach/feed/route.ts
// GET ?leagueId -> the AI coach's latest notes (last 10 days) about the players on your team in
// that league, newest first, for the dashboard. League members only. (lib/coach)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export const dynamic = "force-dynamic";

function rosterIds(data: unknown): string[] {
  const d = (data ?? {}) as { playerIds?: unknown[]; irIds?: unknown[] };
  return [...(Array.isArray(d.playerIds) ? d.playerIds : []), ...(Array.isArray(d.irIds) ? d.irIds : [])].map(String).filter(Boolean);
}

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const { data: roster } = await supabaseAdmin.from("rosters").select("data").eq("league_id", leagueId).eq("team_id", teamId).maybeSingle();
    const ids = rosterIds(roster?.data);
    if (!ids.length) return NextResponse.json({ ok: true, notes: [] });
    const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("coach_notes")
      .select("id, player_id, kind, week, headline, body, next_week, verdict, trend, created_at")
      .in("player_id", ids)
      .eq("hidden", false)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ ok: true, notes: data ?? [] });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
