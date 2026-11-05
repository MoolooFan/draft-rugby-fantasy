// app/api/matchups/week-results/route.ts
// Finalised results for one week of a league (members only): each team's final lineup after
// auto-subs, who got the captain's x2, score and tries. finalised=false while the week is live.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    const week = Number(searchParams.get("week") ?? 0);
    if (!leagueId || !Number.isFinite(week) || week <= 0) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }
    await requireLeagueTeam(leagueId);

    const [{ data: done, error: fErr }, { data: rows, error: rErr }] = await Promise.all([
      supabaseAdmin.from("league_week_finalisations").select("finalised_at").eq("league_id", leagueId).eq("week", week).maybeSingle(),
      supabaseAdmin
        .from("team_week_results")
        .select("team_id, final_lineup, picked_captain_id, picked_vice_id, captain_used_id, score, tries")
        .eq("league_id", leagueId)
        .eq("week", week),
    ]);
    if (fErr) throw fErr;
    if (rErr) throw rErr;

    return NextResponse.json({ ok: true, finalised: !!done, finalisedAt: done?.finalised_at ?? null, rows: done ? rows ?? [] : [] });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
