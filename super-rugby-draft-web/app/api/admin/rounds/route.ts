// app/api/admin/rounds/route.ts — admin only. Regather stats and finalise a round again
// (e.g. after a late stat correction). Preview first: shows each team's score before/after.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { finaliseWeek } from "@/lib/results/engine";
import { syncExternalStats } from "@/lib/players/syncStats";
import { currentSeasonYear, getSeason, realRoundsForWeek, weekLabel } from "@/lib/season";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Leagues this season and the weeks each has finalised. */
export async function GET() {
  try {
    await requireSiteAdmin();
    const seasonYear = currentSeasonYear();
    const season = getSeason(seasonYear);
    const { data: leagues, error } = await supabaseAdmin.from("leagues").select("id, name").eq("season", seasonYear).order("name");
    if (error) throw error;
    const { data: done, error: dErr } = await supabaseAdmin
      .from("league_week_finalisations")
      .select("league_id, week, finalised_at")
      .in("league_id", (leagues ?? []).map((l) => l.id));
    if (dErr) throw dErr;
    const { data: teams, error: tErr } = await supabaseAdmin
      .from("teams")
      .select("id, name, league_id")
      .in("league_id", (leagues ?? []).map((l) => l.id));
    if (tErr) throw tErr;
    return NextResponse.json({
      ok: true,
      season: seasonYear,
      leagues: (leagues ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        teams: (teams ?? []).filter((t) => t.league_id === l.id).map((t) => ({ id: t.id, name: t.name })),
        weeks: (done ?? [])
          .filter((d) => d.league_id === l.id)
          .sort((a, b) => a.week - b.week)
          .map((d) => ({ week: d.week, label: weekLabel(season, d.week), finalisedAt: d.finalised_at })),
      })),
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/** Body: { leagueId, week, regather, confirm }. confirm=false -> preview only (nothing saved). */
export async function POST(req: Request) {
  try {
    await requireSiteAdmin();
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    const week = Number(body?.week);
    if (!leagueId || !Number.isInteger(week) || week < 1) {
      return NextResponse.json({ ok: false, error: "Missing league or week" }, { status: 400 });
    }
    const { data: league, error } = await supabaseAdmin.from("leagues").select("season").eq("id", leagueId).single();
    if (error) throw error;
    const season = getSeason(Number(league.season));

    let regathered: number | null = null;
    if (body?.regather) {
      const r = await syncExternalStats(supabaseAdmin, season.season, { onlyRounds: realRoundsForWeek(season, week) });
      regathered = r.insertedOrUpdated;
    }
    if (body?.confirm) {
      await finaliseWeek(supabaseAdmin, leagueId, week, Date.now(), { force: true });
      return NextResponse.json({ ok: true, finalised: true, regathered });
    }
    const r = await finaliseWeek(supabaseAdmin, leagueId, week, Date.now(), { dryRun: true });
    return NextResponse.json({ ok: true, preview: r.preview, regathered });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
