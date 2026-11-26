// app/api/draft/strategy/route.ts
// Your draft strategy for a league (lib/draft/strategy.ts). Members only.
// GET ?leagueId=               -> { strategy, source: "league" | "none" }
// POST { leagueId, strategy }  saves it
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { loadStrategy, saveStrategy } from "@/lib/draft/strategyServer";
import { EMPTY_STRATEGY } from "@/lib/draft/strategy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    // no league (e.g. a mock draft on its own): no strategy
    if (!leagueId) return NextResponse.json({ ok: true, strategy: EMPTY_STRATEGY, source: "none" });
    const { username } = await requireLeagueTeam(leagueId);
    return NextResponse.json({ ok: true, ...(await loadStrategy(supabaseAdmin, username, leagueId)) });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    if (!body?.strategy || typeof body.strategy !== "object") return NextResponse.json({ ok: false, error: "Missing strategy" }, { status: 400 });
    const { username } = await requireLeagueTeam(leagueId);
    const strategy = await saveStrategy(supabaseAdmin, username, leagueId, body.strategy);
    return NextResponse.json({ ok: true, strategy, source: "league" });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
