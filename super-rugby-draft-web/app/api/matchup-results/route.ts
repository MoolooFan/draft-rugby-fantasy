import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const BYE_SENTINEL = "__BYE__";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();
  const fromWeek = Number(searchParams.get("fromWeek") ?? 0);
  const toWeek = Number(searchParams.get("toWeek") ?? 0);

  if (!leagueId || !Number.isFinite(fromWeek) || !Number.isFinite(toWeek) || fromWeek <= 0 || toWeek <= 0) {
    return NextResponse.json({ ok: false, error: "Missing/invalid leagueId/fromWeek/toWeek" }, { status: 400 });
  }

  await getServerUsername(); // must be logged in

  const sb = supabaseAdmin;
  
  const { data, error } = await sb
    .from("matchup_results")
    .select("league_id, week_no, kind, home_team_id, away_team_id, home_score, away_score, finalized_at_ms, updated_at")
    .eq("league_id", leagueId)
    .gte("week_no", fromWeek)
    .lte("week_no", toWeek);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: Request) {
  await getServerUsername();

  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();
  const weekNo = Number(body?.weekNo ?? 0);
  const rows = Array.isArray(body?.rows) ? body.rows : [];

  if (!leagueId || !Number.isFinite(weekNo) || weekNo <= 0) {
    return NextResponse.json({ ok: false, error: "Missing/invalid leagueId or weekNo" }, { status: 400 });
  }

  const sb = supabaseAdmin;

  const payload = rows
    .map((r: any) => {
      const kind = String(r.kind ?? "match");
      const homeTeamId = String(r.homeTeamId ?? "").trim();
      const awayTeamIdRaw = String(r.awayTeamId ?? "").trim();
      const awayTeamId = awayTeamIdRaw || BYE_SENTINEL;

      return {
        league_id: leagueId,
        week_no: weekNo,
        kind,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_score: Number(r.homeScore ?? 0),
        away_score: Number(r.awayScore ?? 0),
        finalized_at_ms: Number(r.finalizedAtMs ?? Date.now()),
      };
    })
    .filter((r: any) =>
      (r.kind === "match" || r.kind === "bye") &&
      r.home_team_id &&
      r.away_team_id &&
      Number.isFinite(r.home_score) &&
      Number.isFinite(r.away_score)
    );

  if (!payload.length) return NextResponse.json({ ok: true });

  // IMPORTANT: we want "insert if missing" behavior for your auto-finalize
  // so we don’t overwrite previously-finalized scores.
  const { error } = await sb
    .from("matchup_results")
    .upsert(payload, {
      onConflict: "league_id,week_no,kind,home_team_id,away_team_id",
      ignoreDuplicates: true,
    });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}