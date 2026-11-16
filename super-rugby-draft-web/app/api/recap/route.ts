// GET  /api/recap?leagueId=...   -> { ok, recap, seen } the recap of the most recent finalised
//                                   week for your team (recap null if no week is finalised yet);
//                                   seen = you've already closed this week's recap
// POST /api/recap { leagueId, week } -> marks that week's recap as seen (it won't pop up again)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { buildRecap, type RecapMatchup, type RecapWeekResult } from "@/lib/league/recap";
import { getSeason, SEASONS, weekLabel } from "@/lib/season";
import { loadShield } from "@/lib/league/shieldServer";
import { shieldRecap, type ShieldRecap } from "@/lib/league/shield";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);

    const [lg, done, me] = await Promise.all([
      supabaseAdmin.from("leagues").select("season").eq("id", leagueId).maybeSingle(),
      supabaseAdmin.from("league_week_finalisations").select("week").eq("league_id", leagueId).order("week", { ascending: false }),
      supabaseAdmin.from("teams").select("recap_seen_week").eq("id", teamId).maybeSingle(),
    ]);
    if (lg.error) throw lg.error;
    if (done.error) throw done.error;
    if (me.error) throw me.error;
    const latest = done.data?.[0]?.week;
    if (!latest) return NextResponse.json({ ok: true, recap: null, seen: true });
    // ?week=N: view an earlier round's recap again (any finalised round this season)
    const asked = Number(new URL(req.url).searchParams.get("week"));
    const week = Number.isInteger(asked) && asked >= 1 && asked <= latest ? asked : latest;

    const [teams, matchups, results] = await Promise.all([
      supabaseAdmin.from("teams").select("id, name, initials, picture_url").eq("league_id", leagueId),
      supabaseAdmin
        .from("league_matchups")
        .select("kind, status, label, weeks, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, home_shield_pts, away_shield_pts, shield_holder_after")
        .eq("league_id", leagueId),
      supabaseAdmin
        .from("team_week_results")
        .select("week, team_id, score, final_lineup, player_points, captain_used_id")
        .eq("league_id", leagueId)
        .lte("week", week),
    ]);
    if (teams.error) throw teams.error;
    if (matchups.error) throw matchups.error;
    if (results.error) throw results.error;

    // names of the players who counted for your team this week
    const season = Number(lg.data?.season);
    const myResult = (results.data ?? []).find((r) => r.week === week && r.team_id === teamId);
    const ids = Object.keys((myResult?.player_points as Record<string, number>) ?? {});
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: players, error } = await supabaseAdmin
        .from("players")
        .select("id, first_name, last_name")
        .eq("season", season)
        .in("id", ids);
      if (error) throw error;
      for (const p of players ?? []) names.set(p.id, `${p.first_name} ${p.last_name}`);
    }

    const recap = buildRecap({
      week,
      myTeamId: teamId,
      teamIds: (teams.data ?? []).map((t) => t.id),
      matchups: (matchups.data ?? []) as RecapMatchup[],
      results: (results.data ?? []) as RecapWeekResult[],
      playerName: (id) => names.get(id) ?? id,
    });

    const teamInfo = Object.fromEntries(
      (teams.data ?? []).map((t) => [t.id, { name: t.name, initials: t.initials, pictureUrl: t.picture_url ?? null }])
    );
    // The Shield: won / defended / lost this round, and whether your next game is a shield game
    let shield: ShieldRecap | null = null;
    try {
      const s = await loadShield(supabaseAdmin, leagueId);
      shield = shieldRecap({ name: s.name, enabled: s.enabled, events: s.events, week, myTeamId: teamId, next: s.next, myNextWeek: recap.next?.week ?? null, secured: s.secured });
    } catch {
      shield = null;
    }

    const label = SEASONS[season] ? weekLabel(getSeason(season), week) : `Round ${week}`;
    const nextLabel = recap.next && SEASONS[season] ? weekLabel(getSeason(season), recap.next.week) : null;

    return NextResponse.json({
      ok: true,
      recap: { ...recap, shield, weekLabel: label, nextWeekLabel: nextLabel, myTeamId: teamId, teams: teamInfo },
      seen: (me.data?.recap_seen_week ?? 0) >= week,
      latestWeek: latest,
      firstWeek: done.data?.[done.data.length - 1]?.week ?? latest,
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const leagueId = String(body?.leagueId ?? "").trim();
    const week = Number(body?.week);
    if (!leagueId || !Number.isInteger(week) || week < 1) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }
    const { teamId } = await requireLeagueTeam(leagueId);
    const { error } = await supabaseAdmin.from("teams").update({ recap_seen_week: week }).eq("id", teamId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
