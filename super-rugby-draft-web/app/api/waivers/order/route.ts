// app/api/waivers/order/route.ts
// GET /api/waivers/order?leagueId&week -> the waiver order for that week (lib/waivers/order.ts):
// { data: [{ teamId, rank }] (the usual order), firstRound: [teamId...] (round 1, which starts
// with the Shield holder when the league has that reward), shieldTeamId, flipped (a finals week
// with the order flipped: 1st seed first) }.
// Worked out fresh from the league's results every time (it used to be saved the first time
// anyone looked, which could be before the last round was finalised). League members only.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { buildWaiverOrder, saveWaiverOrder } from "@/lib/waivers/order";

export const dynamic = "force-dynamic";

async function answer(leagueId: string, week: number) {
  await requireLeagueTeam(leagueId);
  const o = await buildWaiverOrder(supabaseAdmin, leagueId, week);
  await saveWaiverOrder(supabaseAdmin, leagueId, week, o.order);
  return NextResponse.json({
    ok: true,
    data: o.order.map((teamId, i) => ({ teamId, rank: i + 1 })),
    firstRound: o.firstRound,
    shieldTeamId: o.shieldTeamId,
    flipped: !!o.flipped,
  });
}

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const leagueId = String(q.get("leagueId") ?? "").trim();
    const week = Number(q.get("week"));
    if (!leagueId || !Number.isInteger(week) || week <= 0) return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    return await answer(leagueId, week);
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/** POST { leagueId, week }: the same (kept for older pages). */
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const leagueId = String(b?.leagueId ?? "").trim();
    const week = Number(b?.week);
    if (!leagueId || !Number.isInteger(week) || week <= 0) return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    return await answer(leagueId, week);
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
