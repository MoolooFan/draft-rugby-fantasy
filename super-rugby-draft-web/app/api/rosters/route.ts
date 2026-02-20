import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = searchParams.get("leagueId");

  if (!leagueId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("rosters")
    .select("league_id, team_id, data, updated_at")
    .eq("league_id", leagueId);

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { leagueId, teamId, data } = body ?? {};

  if (!leagueId || !teamId || !data) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/teamId/data" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("rosters")
    .upsert(
      { league_id: leagueId, team_id: teamId, data, updated_at: new Date().toISOString() },
      { onConflict: "league_id,team_id" }
    );

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
  return NextResponse.json({ ok: true });
}