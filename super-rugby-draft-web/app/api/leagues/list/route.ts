import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

// Returns all leagues the current signed-in user belongs to
export async function GET() {
  const username = await getServerUsername(); // this should return username_norm
  if (!username) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // Find all teams owned by this user, then fetch their leagues
  const { data: teams, error: teamsErr } = await supabaseAdmin
    .from("teams")
    .select("league_id")
    .eq("owner_username", username);

  if (teamsErr) {
    return NextResponse.json({ ok: false, error: "Failed to load teams" }, { status: 500 });
  }

  const leagueIds = Array.from(new Set((teams ?? []).map((t) => t.league_id).filter(Boolean)));

  if (!leagueIds.length) {
    return NextResponse.json({ ok: true, leagues: [] });
  }

  const { data: leagues, error: leaguesErr } = await supabaseAdmin
    .from("leagues")
    .select("*")
    .in("id", leagueIds);

  if (leaguesErr) {
    return NextResponse.json({ ok: false, error: "Failed to load leagues" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, leagues: leagues ?? [] });
}