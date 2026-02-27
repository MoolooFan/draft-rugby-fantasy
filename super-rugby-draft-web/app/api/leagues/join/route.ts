import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim().toUpperCase();
  const teamName = String(body?.teamName ?? "").trim();

  if (!code || !teamName) {
    return NextResponse.json({ ok: false, error: "Missing code/teamName" }, { status: 400 });
  }

  // 1) find league by code
  const { data: league, error: leagueErr } = await supabaseAdmin
    .from("leagues")
    .select("*")
    .eq("code", code)
    .single();

  if (leagueErr || !league) {
    return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
  }

  // 2) if already has a team, reuse it
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("league_id", league.id)
    .eq("owner_username", username)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
  }

  let team = existing;

  // 3) otherwise create team
  if (!team) {
    const teamId = `team_${crypto.randomUUID()}`;

    const { data: created, error: teamErr } = await supabaseAdmin
      .from("teams")
      .insert({
        id: teamId,
        league_id: league.id,
        name: teamName,
        owner_username: username,
        user_id: username,
      })
      .select("*")
      .single();

    if (teamErr || !created) {
      // If your unique constraint (league_id, owner_username) triggers, treat as "already joined"
      return NextResponse.json({ ok: false, error: teamErr?.message ?? "Failed to join league" }, { status: 500 });
    }

    team = created;
  }

  // 4) Ensure draft_state exists (for older leagues)
  const { error: stateErr } = await supabaseAdmin.from("draft_state").upsert(
    {
      league_id: league.id,
      phase: league.draft_status === "live" ? "live" : "scheduled",
      pick_index: 1,
      is_draft_order_set: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id" }
  );

  if (stateErr) {
    return NextResponse.json({ ok: false, error: stateErr.message }, { status: 500 });
  }

  // 5) Ensure roster row exists for this team
  const { error: rosterErr } = await supabaseAdmin.from("rosters").upsert(
    {
      league_id: league.id,
      team_id: team.id,
      data: { playerIds: [] },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id,team_id" }
  );

  if (rosterErr) {
    return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
  }

  // 6) load all teams for hydration
  const { data: teams, error: teamsErr } = await supabaseAdmin
    .from("teams")
    .select("id, name, initials, owner_username")
    .eq("league_id", league.id)
    .order("created_at", { ascending: true });

  if (teamsErr) {
    return NextResponse.json({ ok: false, error: teamsErr.message }, { status: 500 });
  }

  const leagueObj = {
    id: league.id,
    name: league.name,
    code: league.code,
    createdByUserId: norm(String(league.created_by ?? "")),
    teams: (teams ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      initials: t.initials ?? "",
      userId: norm(String(t.owner_username ?? "")),
      userInitials: t.initials ?? "",
    })),
    draftDateTimeText: league.draft_date_time_text ?? "",
    draftAt: league.draft_at ?? null,
    draftStatus: league.draft_status ?? "scheduled",
    playoffFormat: league.playoff_format ?? "final4",
    realRegularSeasonRounds: league.real_regular_season_rounds ?? 15,
    startRound: league.start_round ?? 1,
    totalWeeks: league.total_weeks ?? 15,
    currentWeek: league.current_week ?? 1,
  };

  return NextResponse.json({ ok: true, league: leagueObj });
}