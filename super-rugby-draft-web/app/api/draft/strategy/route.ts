// app/api/draft/strategy/route.ts
// Your draft strategy (lib/draft/strategy.ts): your default, or one league's own.
// GET ?leagueId=          -> { strategy, source: "league" | "default" | "none" }
// POST { leagueId?, strategy }     saves it (no leagueId = your default)
// POST { leagueId, useDefault: true } removes the league's own (it goes back to your default)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, requireUsername, toHttpError } from "@/lib/league/serverAuth";
import { clearLeagueStrategy, loadStrategy, saveStrategy } from "@/lib/draft/strategyServer";

export const dynamic = "force-dynamic";

async function who(leagueId: string) {
  return leagueId ? (await requireLeagueTeam(leagueId)).username : await requireUsername();
}

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    const username = await who(leagueId);
    return NextResponse.json({ ok: true, ...(await loadStrategy(supabaseAdmin, username, leagueId || null)) });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    const username = await who(leagueId);
    if (body?.useDefault) {
      if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
      await clearLeagueStrategy(supabaseAdmin, username, leagueId);
      return NextResponse.json({ ok: true, ...(await loadStrategy(supabaseAdmin, username, leagueId)) });
    }
    if (!body?.strategy || typeof body.strategy !== "object") return NextResponse.json({ ok: false, error: "Missing strategy" }, { status: 400 });
    const strategy = await saveStrategy(supabaseAdmin, username, leagueId || null, body.strategy);
    return NextResponse.json({ ok: true, strategy, source: leagueId ? "league" : "default" });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
