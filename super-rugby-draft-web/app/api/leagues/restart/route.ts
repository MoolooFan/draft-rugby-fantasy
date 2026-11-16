// POST /api/leagues/restart { leagueId }  (plan item E8)
// Only in the month before the new season starts (restartWindow in lib/season).
// The commissioner starts last season's league again for this season: a new league with the
// same name, settings and history (lineage), a new join code and a new draft. Only the
// commissioner joins automatically (with their old team name and picture); everyone else
// rejoins with the new code and gets their old team name and picture back.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { currentSeasonYear, getSeason, restartWindow, totalFantasyWeeks } from "@/lib/season";
import { getDraftState } from "@/lib/draft/engine";
import { previousTeam } from "@/lib/league/honours";

const norm = (s: string) => s.trim().toLowerCase();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const oldId = String(body?.leagueId ?? "").trim();
  if (!oldId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });

  const { data: old, error: oldErr } = await supabaseAdmin.from("leagues").select("*").eq("id", oldId).maybeSingle();
  if (oldErr) return NextResponse.json({ ok: false, error: oldErr.message }, { status: 500 });
  if (!old) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
  if (norm(String(old.created_by ?? "")) !== username) {
    return NextResponse.json({ ok: false, error: "Only the commissioner can restart the league" }, { status: 403 });
  }

  const season = currentSeasonYear();
  if (Number(old.season) >= season) {
    return NextResponse.json({ ok: false, error: "This league is already this season's" }, { status: 400 });
  }
  const win = restartWindow(season);
  const now = Date.now();
  if (!win || now < win.opensMs) {
    const opens = win ? new Date(win.opensMs).toLocaleDateString("en-NZ", { day: "numeric", month: "long" }) : "a month before the season";
    return NextResponse.json({ ok: false, error: `The new season can be started from ${opens}` }, { status: 400 });
  }
  if (now >= win.closesMs) {
    return NextResponse.json({ ok: false, error: `The ${season} season has already started, so this league can't be restarted for it` }, { status: 400 });
  }
  const lineage = old.lineage_id ?? old.id;
  const { data: already, error: aErr } = await supabaseAdmin
    .from("leagues")
    .select("id, code")
    .or(`lineage_id.eq.${lineage},id.eq.${lineage}`)
    .eq("season", season)
    .limit(1);
  if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
  if (already?.length) {
    return NextResponse.json({ ok: false, error: `This league has already been restarted for ${season} (join code ${already[0].code})` }, { status: 409 });
  }

  // the old league becomes part of the lineage too (it was its own lineage until now)
  if (!old.lineage_id) {
    const { error } = await supabaseAdmin.from("leagues").update({ lineage_id: lineage }).eq("id", old.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let code = makeCode();
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabaseAdmin.from("leagues").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
    code = makeCode();
  }

  const leagueId = `league_${crypto.randomUUID()}`;
  const seasonWeeks = totalFantasyWeeks(getSeason(season));
  const { error: leagueErr } = await supabaseAdmin.from("leagues").insert({
    id: leagueId,
    name: old.name,
    code,
    created_by: username,
    draft_at: null,
    draft_date_time_text: "",
    playoff_format: old.playoff_format ?? "final4",
    draft_status: "scheduled",
    season,
    scoring_system: old.scoring_system ?? "standard",
    scoring_custom: old.scoring_custom ?? null,
    bonus_points: old.bonus_points !== false,
    bonus_rules: old.bonus_rules ?? null,
    shield_enabled: old.shield_enabled !== false,
    shield_name: old.shield_name ?? "The Shield",
    shield_rewards: old.shield_rewards ?? {},
    real_regular_season_rounds: seasonWeeks,
    start_round: 1,
    total_weeks: seasonWeeks,
    current_week: 1,
    lineage_id: lineage,
  });
  if (leagueErr) return NextResponse.json({ ok: false, error: leagueErr.message }, { status: 500 });

  // the commissioner's team, with their old name and picture
  const prev = await previousTeam(supabaseAdmin, lineage, username, leagueId).catch(() => null);
  const teamId = `team_${crypto.randomUUID()}`;
  const { error: teamErr } = await supabaseAdmin.from("teams").insert({
    id: teamId,
    league_id: leagueId,
    name: prev?.name ?? "My Team",
    owner_username: username,
    user_id: username,
    picture_url: prev?.picture_url ?? null,
  });
  if (teamErr) return NextResponse.json({ ok: false, error: teamErr.message }, { status: 500 });

  try {
    await getDraftState(supabaseAdmin, leagueId);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Couldn't set up the draft" }, { status: 500 });
  }

  const { error: rosterErr } = await supabaseAdmin
    .from("rosters")
    .upsert({ league_id: leagueId, team_id: teamId, data: { playerIds: [] }, updated_at: new Date().toISOString() }, { onConflict: "league_id,team_id" });
  if (rosterErr) return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, leagueId, code });
}
