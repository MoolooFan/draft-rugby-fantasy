import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/session/server";

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

  if (error) return NextResponse.json({ ok: false, error: String(error.message ?? error) }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { leagueId, teamId, data } = (body ?? {}) as {
    leagueId?: string;
    teamId?: string;
    data?: unknown;
  };

  if (!leagueId || !teamId || !data) {
    return NextResponse.json(
      { ok: false, error: "Missing leagueId/teamId/data" },
      { status: 400 }
    );
  }

  // must be signed in
  const username = await getServerUsername();
  if (!username) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  // check ownership (ONLY allow saving your own team roster)
  const { data: team, error: teamErr } = await supabaseServer
    .from("teams")
    .select("id, owner_username")
    .eq("id", teamId)
    .single();

  if (teamErr || !team) {
    return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
  }

  if (team.owner_username !== username) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabaseServer
    .from("rosters")
    .upsert(
      {
        league_id: leagueId,
        team_id: teamId,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id,team_id" }
    );

  if (error) return NextResponse.json({ ok: false, error: String(error.message ?? error) }, { status: 500 });
  return NextResponse.json({ ok: true });
}