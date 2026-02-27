import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const teamName = String(body?.teamName ?? "").trim();
  const playoffFormat = body?.playoffFormat ?? "final4";
  const draftDateTimeText = String(body?.draftDateTimeText ?? "");
  const draftAtRaw = body?.draftAt ?? null;

// Accept either:
// - null
// - number milliseconds (e.g. 1771920300000)
// - ISO string
let draftAtIso: string | null = null;

if (draftAtRaw !== null && draftAtRaw !== undefined && draftAtRaw !== "") {
  if (typeof draftAtRaw === "number") {
    // milliseconds -> ISO
    draftAtIso = new Date(draftAtRaw).toISOString();
  } else if (typeof draftAtRaw === "string") {
    // if it's numeric string, treat as ms
    if (/^\d+$/.test(draftAtRaw)) {
      draftAtIso = new Date(Number(draftAtRaw)).toISOString();
    } else {
      // assume it's already ISO-ish
      draftAtIso = new Date(draftAtRaw).toISOString();
    }
  } else {
    // fallback
    draftAtIso = new Date(draftAtRaw as any).toISOString();
  }
}

  if (!name || !teamName) {
    return NextResponse.json({ ok: false, error: "Missing league/team name" }, { status: 400 });
  }

  const leagueId = `league_${crypto.randomUUID()}`;

  // Generate join code (retry a few times for collisions)
  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    const { data: existing, error: codeErr } = await supabaseAdmin
      .from("leagues")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (codeErr) {
      return NextResponse.json({ ok: false, error: codeErr.message }, { status: 500 });
    }
    if (!existing) break;
    code = makeCode();
  }

  // 1) Create league
  const { error: leagueErr } = await supabaseAdmin.from("leagues").insert({
    id: leagueId,
    name,
    code,
    created_by: username,
    playoff_format: playoffFormat,
    draft_date_time_text: draftDateTimeText || null,
    draft_at: draftAtIso,
    draft_status: "scheduled",
    real_regular_season_rounds: 15,
    start_round: 1,
    total_weeks: 15,
    current_week: 1,
  });

  if (leagueErr) {
    return NextResponse.json({ ok: false, error: leagueErr.message }, { status: 500 });
  }

  // 2) Create creator team
  const teamId = `team_${crypto.randomUUID()}`;
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .insert({
      id: teamId,
      league_id: leagueId,
      name: teamName,
      owner_username: username,
      user_id: username,
    })
    .select("*")
    .single();

  if (teamErr || !team) {
    return NextResponse.json({ ok: false, error: teamErr?.message ?? "Failed to create team" }, { status: 500 });
  }

  // 3) Ensure draft_state exists (pick_index starts at 1)
  const { error: stateErr } = await supabaseAdmin.from("draft_state").upsert(
    {
      league_id: leagueId,
      phase: "scheduled",
      pick_index: 1,
      is_draft_order_set: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id" }
  );

  if (stateErr) {
    return NextResponse.json({ ok: false, error: stateErr.message }, { status: 500 });
  }

  // 4) Create empty roster row for creator (optional but recommended)
  const { error: rosterErr } = await supabaseAdmin.from("rosters").upsert(
    {
      league_id: leagueId,
      team_id: teamId,
      data: { playerIds: [] },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "league_id,team_id" }
  );

  if (rosterErr) {
    return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
  }

  // 5) Return league object with teams for Zustand hydration
  const { data: teams, error: teamsErr } = await supabaseAdmin
    .from("teams")
    .select("id, name, initials, owner_username")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: true });

  if (teamsErr) {
    return NextResponse.json({ ok: false, error: teamsErr.message }, { status: 500 });
  }

  const leagueObj = {
    id: leagueId,
    name,
    code,
    createdByUserId: username,
    teams: (teams ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      initials: t.initials ?? "",
      userId: norm(String(t.owner_username ?? "")),
      userInitials: t.initials ?? "",
    })),
    draftDateTimeText,
draftAt: draftAtIso, // ISO string or null
draftStatus: "scheduled",
    playoffFormat,
    realRegularSeasonRounds: 15,
    startRound: 1,
    totalWeeks: 15,
    currentWeek: 1,
  };

  return NextResponse.json({ ok: true, league: leagueObj });
}