// app/api/fixtures/season/route.ts
// The current season's Super Rugby fixtures for the pages (replaces the Google Sheet).
// `week` is the FANTASY week (2027: rounds 10 and 11 are both week 10), `realRound` the Super
// Rugby round, `weekLabel` the name to show ("Round 10/11").
// fdrHome / fdrAway = how hard the game is for the home / away team (1 easy ... 5 hard), from
// the difficulty ratings in the database (Ethan edits them on the admin page).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentSeasonYear, fixturesByFantasyWeek, kickoffMs, roundLabel } from "@/lib/season";

export const dynamic = "force-dynamic";

type Rating = { team: string; home_rating: number; away_rating: number };
const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4 | 5;

export async function GET() {
  try {
    const season = currentSeasonYear();
    const { data, error } = await supabaseAdmin.from("team_difficulty").select("team, home_rating, away_rating").eq("season", season);
    if (error) throw error;
    const rating = new Map((data as Rating[]).map((r) => [r.team, r]));

    const fixtures = fixturesByFantasyWeek(season).map((f) => {
      const home = rating.get(f.homeTeam);
      const away = rating.get(f.awayTeam);
      const file = f as typeof f & { fdrHome?: number; fdrAway?: number };
      // The home team faces the away team at home (the away team's "at your ground" rating),
      // the away team faces the home team at their ground. Neutral venue: the average.
      const fdrHome = away ? clamp(f.neutralVenue ? (away.home_rating + away.away_rating) / 2 : away.away_rating) : file.fdrHome;
      const fdrAway = home ? clamp(f.neutralVenue ? (home.home_rating + home.away_rating) / 2 : home.home_rating) : file.fdrAway;
      return {
        id: f.id,
        week: f.week,
        realRound: f.realRound,
        weekLabel: roundLabel(f.week, season),
        kickoffAt: f.kickoffAt,
        kickoffMs: kickoffMs(f),
        homeTeam: f.homeTeam,
        awayTeam: f.awayTeam,
        status: f.status === "final" ? "final" : f.status === "live" ? "live" : "scheduled",
        homeScore: f.homeScore ?? null,
        awayScore: f.awayScore ?? null,
        neutralVenue: !!f.neutralVenue,
        fdrHome,
        fdrAway,
      };
    });
    return NextResponse.json({ ok: true, season, fixtures });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
