import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

type SheetFixtureRow = {
  season: number;
  weekFantasy: number;
  weekReal: number | null;
  label: string | null;
  kind: string | null; // "regular" | "playoffs" | "label" etc
  homeTeamId: string | null;
  awayTeamId: string | null; // null for bye rows
  status: string; // "upcoming" | "complete"
  homeScore: number | null;
  awayScore: number | null;
};

type StandRow = {
  teamId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pf: number;
  pa: number;
  pd: number;
  pts: number;
};

function isLabelRow(r: SheetFixtureRow) {
  return !!(r.label && String(r.label).trim());
}

function isRegularRow(r: SheetFixtureRow) {
  const k = String(r.kind ?? "").toLowerCase();
  return !k || k === "regular";
}

function isCompleteRow(r: SheetFixtureRow) {
  return String(r.status ?? "").toLowerCase() === "complete";
}

// standings (best->worst) using same rules as your league/page:
// sort by pts, then pd, then pf
function computeStandingsFromSheetRows(
  rows: SheetFixtureRow[],
  teamIds: string[],
  uptoWeekInclusive: number
): StandRow[] {
  const base = new Map<string, StandRow>();
  for (const id of teamIds) {
    base.set(id, {
      teamId: id,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      pd: 0,
      pts: 0,
    });
  }

  const matches = rows.filter((r) => {
    const w = Number(r.weekFantasy);
    if (!w || w > uptoWeekInclusive) return false;
    if (isLabelRow(r)) return false;
    if (!isRegularRow(r)) return false;
    if (!isCompleteRow(r)) return false;
    return true;
  });

  for (const m of matches) {
    const homeId = m.homeTeamId ?? null;
    const awayId = m.awayTeamId ?? null;

    // BYE rows (one side null) are ignored for standings (same as your code)
    if (!homeId || !awayId) continue;

    const hs = m.homeScore;
    const as = m.awayScore;
    if (hs == null || as == null) continue;

    const home = base.get(homeId);
    const away = base.get(awayId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;

    home.pf += hs; home.pa += as;
    away.pf += as; away.pa += hs;

    if (hs > as) {
      home.wins += 1;
      home.pts += 4;
      away.losses += 1;
    } else if (as > hs) {
      away.wins += 1;
      away.pts += 4;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.pts += 2;
      away.pts += 2;
    }

    home.pd = home.pf - home.pa;
    away.pd = away.pf - away.pa;
  }

  const arr = Array.from(base.values());
  arr.sort((a, b) => b.pts - a.pts || b.pd - a.pd || b.pf - a.pf || a.teamId.localeCompare(b.teamId));
  return arr;
}

// Finds the latest fantasy week that is "complete" (all playable rows complete)
// BUT only using regular season rows (like your league/page logic).
function latestCompletedRegularWeek(rows: SheetFixtureRow[]) {
  const weeks = Array.from(
    new Set(
      rows
        .filter((r) => !isLabelRow(r) && isRegularRow(r))
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  const isWeekComplete = (w: number) => {
    const wkRows = rows.filter((r) => Number(r.weekFantasy) === w);
    const playable = wkRows.filter((r) => !isLabelRow(r) && (r.homeTeamId || r.awayTeamId));
    if (!playable.length) return false;
    return playable.every((r) => isCompleteRow(r));
  };

  let latest = 0;
  for (const w of weeks) {
    if (isWeekComplete(w)) latest = w;
  }
  return latest;
}

async function fetchSheetFixtures(req: Request, { season, leagueId }: { season: number; leagueId: string }) {
  const base = new URL(req.url); // gives https://yourdomain.com/api/waivers/order...
  base.pathname = "/api/fixtures/leagueMatches";
  base.search = "";

  base.searchParams.set("season", String(season));
  base.searchParams.set("leagueId", leagueId);

  const res = await fetch(base.toString(), { cache: "no-store" });
  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || "Failed to load leagueMatches");
  }

  return (json.rows ?? []) as SheetFixtureRow[];
}

async function buildAndUpsertWaiverOrder(req: Request, leagueId: string, week: number) {
  // 1) teams in league (Supabase)
  const { data: teams, error: tErr } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId);

  if (tErr) throw tErr;

  const teamIds = (teams ?? []).map((x: any) => String(x.id)).filter(Boolean);
  if (!teamIds.length) return [];

  // 2) sheet fixtures/results (Google Sheet)
  const season = 2026; // set to league.season later if you store it
  const rows = await fetchSheetFixtures(req, { season, leagueId });

  // Standings should reflect results "before the week starts"
  // so we use uptoWeekInclusive = week - 1 (min 0)
  const upto = Math.max(0, week - 1);

  // If there are no completed weeks yet, we still need a stable order.
  const latest = latestCompletedRegularWeek(rows);
  const haveAny = latest > 0;

  let order: Array<{ teamId: string; rank: number }>;

  if (!haveAny) {
    // Stable fallback: just use teamIds order
    order = teamIds.map((teamId, idx) => ({ teamId, rank: idx + 1 }));
  } else {
    const standingsBestToWorst = computeStandingsFromSheetRows(rows, teamIds, upto);
    const worstToBest = standingsBestToWorst.slice().reverse();
    order = worstToBest.map((r, idx) => ({ teamId: r.teamId, rank: idx + 1 }));
  }

  // 3) upsert waiver_order rows (Supabase)
  const upserts = order.map((x) => ({
    league_id: leagueId,
    week,
    team_id: x.teamId,
    rank: x.rank,
    updated_at: new Date().toISOString(),
  }));

  const { error: uErr } = await supabaseAdmin
    .from("waiver_order")
    .upsert(upserts, { onConflict: "league_id,week,team_id" });

  if (uErr) throw uErr;

  return order;
}

/**
 * GET /api/waivers/order?leagueId=...&week=...
 * Returns waiver order for that week.
 * If it doesn't exist yet, it builds it from Google Sheet results and writes to DB.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    const weekRaw = searchParams.get("week");
const week = weekRaw == null ? NaN : Number(weekRaw);

if (!leagueId || !Number.isFinite(week) || week <= 0) {
  return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
}

    await requireLeagueTeam(leagueId);

    const { data, error } = await supabaseAdmin
      .from("waiver_order")
      .select("team_id, rank")
      .eq("league_id", leagueId)
      .eq("week", week)
      .order("rank", { ascending: true });

    if (error) throw error;

    if (data && data.length) {
      return NextResponse.json({
        ok: true,
        data: data.map((r: any) => ({ teamId: r.team_id, rank: r.rank })),
      });
    }

    const built = await buildAndUpsertWaiverOrder(req, leagueId, week);
    return NextResponse.json({ ok: true, data: built });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/**
 * POST /api/waivers/order
 * Body: { leagueId, week }
 * Forces rebuild of waiver order from Google Sheet results.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);

    if (!leagueId || !Number.isFinite(week)) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }

    await requireLeagueTeam(leagueId);

    const built = await buildAndUpsertWaiverOrder(req, leagueId, week);
    return NextResponse.json({ ok: true, data: built });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}