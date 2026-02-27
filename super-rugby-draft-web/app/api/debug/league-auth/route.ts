import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/session/server";

export async function POST(req: Request) {
  const body = await req.json();
  const leagueId = String(body.leagueId ?? "").trim();

  const username = await getServerUsername();

  // 1) Do we even have a valid signed cookie?
  if (!username) {
    return NextResponse.json({
      ok: false,
      step: "NO_SESSION",
      detail: "getServerUsername() returned null (bad/missing sr_user or sr_sig)",
    }, { status: 200 });
  }

  // 2) Do we have a users row for that username?
  const { data: userRow, error: uErr } = await supabaseAdmin
    .from("users")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (uErr) {
    return NextResponse.json({ ok: false, step: "USERS_QUERY_ERROR", error: uErr }, { status: 200 });
  }

  if (!userRow) {
    return NextResponse.json({
      ok: false,
      step: "USER_NOT_FOUND",
      username,
      detail: "No row in public.users for this username",
    }, { status: 200 });
  }

  // 3) Do we have a league_members row for (league_id, user_id)?
  const { data: memRow, error: mErr } = await supabaseAdmin
    .from("league_members")
    .select("*")
    .eq("league_id", leagueId)
    .eq("user_id", userRow.id)
    .maybeSingle();

  if (mErr) {
    return NextResponse.json({ ok: false, step: "LEAGUE_MEMBERS_QUERY_ERROR", error: mErr }, { status: 200 });
  }

  if (!memRow) {
    return NextResponse.json({
      ok: false,
      step: "NOT_A_MEMBER",
      username,
      userId: userRow.id,
      leagueId,
      detail: "No matching league_members row for this league + user_id",
    }, { status: 200 });
  }

  // 4) Optional: verify the team exists for that league
  if (memRow.team_id) {
    const { data: teamRow } = await supabaseAdmin
      .from("teams")
      .select("id, league_id")
      .eq("id", memRow.team_id)
      .maybeSingle();

    if (!teamRow) {
      return NextResponse.json({
        ok: false,
        step: "TEAM_NOT_FOUND",
        memRow,
        detail: "league_members.team_id does not exist in teams",
      }, { status: 200 });
    }

    if (String(teamRow.league_id) !== String(leagueId)) {
      return NextResponse.json({
        ok: false,
        step: "TEAM_LEAGUE_MISMATCH",
        memRow,
        teamRow,
        detail: "team exists but belongs to a different league",
      }, { status: 200 });
    }
  }

  return NextResponse.json({
    ok: true,
    step: "PASS",
    username,
    userRow,
    memRow,
  }, { status: 200 });
}