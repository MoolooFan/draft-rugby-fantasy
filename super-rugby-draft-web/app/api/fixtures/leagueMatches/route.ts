// app/api/fixtures/leagueMatches/route.ts
// A league's matchups and results, from the database (this used to read a Google Sheet that
// was typed by hand). Same row shape as before, so the pages didn't need rebuilding.
//
// One row per matchup per week. A game played over several weeks (scores added together)
// has a row for each week, with the week's scores, and `aggregate` totals on its last week.
// scoreStatus: "final" once the week is finalised, otherwise "live" (pages show live scores).
// Finals/consolation games come as two rows, like the old sheet: a heading row (label set,
// no teams, e.g. "Semi Final 1") followed by the game row (label null, gameLabel set).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { getSeason, realRoundsForWeek, weekLabel, SEASONS } from "@/lib/season";

export const dynamic = "force-dynamic";

const KIND_FOR_PAGES: Record<string, string> = {
  regular: "regular",
  finals: "playoff",
  consolation: "consolation",
  "fill-in": "consolation",
};

type MatchupRow = {
  id: string;
  kind: string;
  label: string | null;
  weeks: number[];
  home_team_id: string | null;
  away_team_id: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home_tries: number | null;
  away_tries: number | null;
  home_bonus: number;
  away_bonus: number;
  winner_team_id: string | null;
  decides: string | null;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });

    await requireLeagueTeam(leagueId); // members only

    const { data: league, error: lErr } = await supabaseAdmin.from("leagues").select("season").eq("id", leagueId).single();
    if (lErr) throw lErr;
    const seasonYear = Number(league.season);
    const season = SEASONS[seasonYear] ? getSeason(seasonYear) : null;

    const [{ data: matchups, error: mErr }, { data: weekResults, error: rErr }, { data: done, error: fErr }] = await Promise.all([
      supabaseAdmin.from("league_matchups").select("*").eq("league_id", leagueId),
      supabaseAdmin.from("team_week_results").select("week, team_id, score, tries").eq("league_id", leagueId),
      supabaseAdmin.from("league_week_finalisations").select("week").eq("league_id", leagueId),
    ]);
    if (mErr) throw mErr;
    if (rErr) throw rErr;
    if (fErr) throw fErr;

    const finalisedWeeks = new Set((done ?? []).map((d) => d.week));
    const scoreFor = (teamId: string | null, week: number) =>
      teamId ? (weekResults ?? []).find((r) => r.team_id === teamId && r.week === week)?.score ?? null : null;

    const rows: Array<Record<string, unknown> & { weekFantasy: number; kind: string }> = [];
    // Finals in a sensible order within a week: the Grand Final first, then by name.
    const ordered = ((matchups ?? []) as MatchupRow[]).slice().sort((x, y) =>
      (x.decides === "champion" ? 0 : 1) - (y.decides === "champion" ? 0 : 1) || String(x.label ?? "").localeCompare(String(y.label ?? ""))
    );
    for (const m of ordered) {
      const weeks = [...m.weeks].sort((a, b) => a - b);
      weeks.forEach((week, i) => {
        const last = i === weeks.length - 1;
        // Weeks finalised by the results job have per-week team scores; imported history
        // (e.g. 2026) only has the matchup's own scores.
        const final = finalisedWeeks.has(week) || (m.status === "final" && weeks.length === 1);
        let homeScore = scoreFor(m.home_team_id, week);
        let awayScore = scoreFor(m.away_team_id, week);
        if (homeScore == null && final && weeks.length === 1) {
          homeScore = m.home_score;
          awayScore = m.away_score;
        }
        const name = weeks.length > 1 && m.label ? `${m.label} (week ${i + 1} of ${weeks.length})` : m.label;
        const kind = KIND_FOR_PAGES[m.kind] ?? m.kind;
        if (m.kind !== "regular" && name) {
          rows.push({
            id: `${m.id}_${week}_label`,
            season: seasonYear,
            weekFantasy: week,
            weekReal: season ? realRoundsForWeek(season, week)[0] ?? null : week,
            weekLabel: season ? weekLabel(season, week) : `Round ${week}`,
            label: name,
            kind,
            homeTeamId: null,
            awayTeamId: null,
            status: final ? "complete" : "upcoming",
            homeScore: null,
            awayScore: null,
          });
        }
        rows.push({
          id: weeks.length > 1 ? `${m.id}_${week}` : m.id,
          season: seasonYear,
          weekFantasy: week,
          weekReal: season ? realRoundsForWeek(season, week)[0] ?? null : week,
          weekLabel: season ? weekLabel(season, week) : `Round ${week}`,
          label: null,
          gameLabel: name,
          kind,
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          status: final ? "complete" : "upcoming",
          scoreStatus: final ? "final" : "live",
          homeScore: final ? homeScore : null,
          awayScore: final ? awayScore : null,
          homeBonus: last && m.status === "final" ? m.home_bonus ?? 0 : 0,
          awayBonus: last && m.status === "final" ? m.away_bonus ?? 0 : 0,
          winnerTeamId: last && m.status === "final" ? m.winner_team_id : null,
          decides: m.decides,
          aggregate:
            weeks.length > 1 && last && m.status === "final"
              ? { homeScore: m.home_score, awayScore: m.away_score }
              : null,
        });
      });
    }
    // keep each heading directly above its game: regular games first, then finals/consolation in order
    const order = (r: { kind: string }) => (r.kind === "regular" ? 0 : r.kind === "playoff" ? 1 : 2);
    rows.sort((a, b) => a.weekFantasy - b.weekFantasy || order(a) - order(b));

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
