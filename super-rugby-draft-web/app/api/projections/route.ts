// app/api/projections/route.ts
// Expected points for every player for one fantasy week (plan item F2; lib/projections).
//   ?week=N         the fantasy week (default: this week)
//   ?leagueId=...   use that league's scoring (members only); without it, Standard scoring
//   ?season=YYYY    default: the current season (or the league's)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { getLeagueScoringRules, getSystemRules } from "@/lib/scoring/leagueRules";
import { currentSeasonYear, getSeason, SEASONS, totalFantasyWeeks } from "@/lib/season";
import { currentStatusWeek } from "@/lib/status/kind";
import { weekProjections } from "@/lib/projections/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const leagueId = String(q.get("leagueId") ?? "").trim();
    let season = SEASONS[Number(q.get("season"))] ? Number(q.get("season")) : currentSeasonYear();
    let rules;
    if (leagueId) {
      await requireLeagueTeam(leagueId);
      const { data } = await supabaseAdmin.from("leagues").select("season").eq("id", leagueId).maybeSingle();
      if (data?.season && SEASONS[Number(data.season)]) season = Number(data.season);
      rules = await getLeagueScoringRules(supabaseAdmin, leagueId);
    } else {
      rules = await getSystemRules(supabaseAdmin, "standard");
    }
    const weeks = totalFantasyWeeks(getSeason(season));
    const askedWeek = Number(q.get("week"));
    const week = Number.isInteger(askedWeek) && askedWeek >= 1 && askedWeek <= weeks ? askedWeek : currentStatusWeek(season);
    const data = await weekProjections(supabaseAdmin, season, week, rules);
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
