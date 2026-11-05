import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { currentSeasonYear, getSeason, totalFantasyWeeks } from "@/lib/season";
import { getDraftState } from "@/lib/draft/engine";
import { cleanScoringRules } from "@/lib/scoring/validate";
import { getSystemRules } from "@/lib/scoring/leagueRules";

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
  const allowedFormats = ["none", "final2", "final3", "final4", "final6"];
  const playoffFormat = allowedFormats.includes(body?.playoffFormat) ? body.playoffFormat : "final4";
  const season = currentSeasonYear();
  // scoring (Standard / Alternate / Custom) and bonus points
  const scoringSystem = ["standard", "alternate", "custom"].includes(body?.scoringSystem) ? body.scoringSystem : "standard";
  let scoringCustom = null;
  if (scoringSystem === "custom") {
    const { rules, error } = cleanScoringRules(body?.scoringCustom, { allowStructure: false, base: await getSystemRules(supabaseAdmin, "standard") });
    if (!rules) return NextResponse.json({ ok: false, error }, { status: 400 });
    scoringCustom = rules;
  }
  const bonusPoints = body?.bonusPoints !== false;
  const seasonWeeks = totalFantasyWeeks(getSeason(season));
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
    season,
    scoring_system: scoringSystem,
    scoring_custom: scoringCustom,
    bonus_points: bonusPoints,
    real_regular_season_rounds: seasonWeeks,
    start_round: 1,
    total_weeks: seasonWeeks,
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

  // 3) Draft state (pick 1, the order starts with this team; reshuffled as teams join)
  try {
    await getDraftState(supabaseAdmin, leagueId);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't set up the draft" }, { status: 500 });
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
    realRegularSeasonRounds: seasonWeeks,
    startRound: 1,
    totalWeeks: seasonWeeks,
    currentWeek: 1,
  };

  return NextResponse.json({ ok: true, league: leagueObj });
}