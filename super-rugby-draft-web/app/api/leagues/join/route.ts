import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/session/server";

export async function POST(req: Request) {
  const username = await getServerUsername();
  if (!username) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  const teamName = String(body?.teamName ?? "").trim();

  if (!code || !teamName) {
    return NextResponse.json({ ok: false, error: "Missing code/teamName" }, { status: 400 });
  }

  // find league by code
  const { data: league, error: leagueErr } = await supabaseServer
    .from("leagues")
    .select("id, code, name")
    .eq("code", code)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
  }

  // if this username already has a team in this league, return it
  const { data: existing } = await supabaseServer
    .from("teams")
    .select("*")
    .eq("league_id", league.id)
    .eq("owner_username", username)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, leagueId: league.id, team: existing });
  }

  // create a team for this user in that league
  const teamId = `team_${crypto.randomUUID()}`;

  const { data: team, error: teamErr } = await supabaseServer
    .from("teams")
    .insert({
      id: teamId,
      league_id: league.id,
      name: teamName,
      owner_username: username,
    })
    .select("*")
    .single();

  if (teamErr || !team) {
    return NextResponse.json({ ok: false, error: "Failed to join league" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, leagueId: league.id, team });
}