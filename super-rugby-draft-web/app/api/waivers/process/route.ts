import { NextResponse } from "next/server";
import { processWaivers } from "@/lib/waivers/process";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { waiverProcessFromMs } from "@/lib/league/deadlines";
import { currentSeasonYear } from "@/lib/season";


export async function POST(req: Request) {
  let leagueId = "";
  let week = 0;

  try {
    const body = await req.json();
    leagueId = String(body.leagueId ?? "").trim();
    week = Number(body.week);

    if (!leagueId || !Number.isFinite(week)) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }

    // Any league member can trigger processing (or restrict to commissioner later)
    await requireLeagueTeam(leagueId);

    // Only once that week's waiver deadline has passed (the page asks then; this stops early runs).
    const processFrom = waiverProcessFromMs(currentSeasonYear(), week);
    if (processFrom == null || Date.now() < processFrom) {
      return NextResponse.json({ ok: false, error: "Waivers for this week can not be processed yet" }, { status: 409 });
    }

    return NextResponse.json(await processWaivers(supabaseAdmin, leagueId, week));
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
