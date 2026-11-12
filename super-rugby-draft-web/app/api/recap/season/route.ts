// app/api/recap/season/route.ts
// The season recap (lib/league/seasonRecap.ts) for a league whose season is over (members only;
// earlier seasons' leagues too, for viewing again). POST { leagueId } marks it seen.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { buildSeasonRecap, type SeasonMatchup, type SeasonWeekResult } from "@/lib/league/seasonRecap";
import { loadShield } from "@/lib/league/shieldServer";
import { seasonComplete } from "@/lib/league/seasonDone";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const { complete } = await seasonComplete(supabaseAdmin, leagueId);
    if (!complete) return NextResponse.json({ ok: true, recap: null, seen: true });

    const [lg, teams, matchups, results, picks, me] = await Promise.all([
      supabaseAdmin.from("leagues").select("season, name").eq("id", leagueId).maybeSingle(),
      supabaseAdmin.from("teams").select("id, name, initials, picture_url").eq("league_id", leagueId),
      supabaseAdmin
        .from("league_matchups")
        .select("kind, status, label, weeks, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, playoff_key, decides, winner_team_id")
        .eq("league_id", leagueId),
      supabaseAdmin.from("team_week_results").select("week, team_id, score, player_points").eq("league_id", leagueId),
      supabaseAdmin.from("draft_picks").select("team_id, player_id, pick_number").eq("league_id", leagueId),
      supabaseAdmin.from("teams").select("season_recap_seen").eq("id", teamId).maybeSingle(),
    ]);
    for (const r of [lg, teams, matchups, results, picks, me]) if (r.error) throw r.error;
    const season = Number(lg.data?.season);

    // player names
    const ids = new Set<string>();
    for (const r of results.data ?? []) for (const id of Object.keys((r.player_points as Record<string, number>) ?? {})) ids.add(id);
    for (const p of picks.data ?? []) ids.add(p.player_id);
    const names = new Map<string, string>();
    const idList = [...ids];
    for (let i = 0; i < idList.length; i += 200) {
      const { data, error } = await supabaseAdmin.from("players").select("id, first_name, last_name").eq("season", season).in("id", idList.slice(i, i + 200));
      if (error) throw error;
      for (const p of data ?? []) names.set(p.id, `${p.first_name} ${p.last_name}`);
    }

    let shield = null;
    try {
      const s = await loadShield(supabaseAdmin, leagueId);
      shield = { name: s.name, events: s.events, reigns: s.reigns, holderTeamId: s.holderTeamId, ownerOf: () => null };
    } catch {
      shield = null;
    }

    const recap = buildSeasonRecap({
      season,
      myTeamId: teamId,
      teams: (teams.data ?? []).map((t) => ({ id: t.id, name: t.name })),
      matchups: (matchups.data ?? []) as SeasonMatchup[],
      results: (results.data ?? []) as SeasonWeekResult[],
      picks: (picks.data ?? []) as Array<{ team_id: string; player_id: string; pick_number: number }>,
      playerName: (id) => names.get(id) ?? id,
      shield,
    });
    const teamInfo = Object.fromEntries((teams.data ?? []).map((t) => [t.id, { name: t.name, initials: t.initials, pictureUrl: t.picture_url ?? null }]));
    return NextResponse.json({
      ok: true,
      recap: { ...recap, leagueName: lg.data?.name ?? "", myTeamId: teamId, teams: teamInfo },
      seen: !!me.data?.season_recap_seen,
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
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const { error } = await supabaseAdmin.from("teams").update({ season_recap_seen: true }).eq("id", teamId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
