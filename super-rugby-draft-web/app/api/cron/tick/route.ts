// app/api/cron/tick/route.ts
// Called every 5 minutes by Supabase's scheduler (pg_cron), with the CRON_SECRET password.
// - While a game is on (kickoff to 13.5h after): pulls fresh player stats.
// - Locks lineups at each deadline and finalises each round when it's due (lib/results/engine).
// Outside game weekends it does almost nothing, so it's cheap to call often.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncExternalStats } from "@/lib/players/syncStats";
import { runResultsTick } from "@/lib/results/engine";
import { currentSeasonYear, getSeason, realRoundsInPlay } from "@/lib/season";

export const maxDuration = 60; // seconds (Vercel)

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function tick() {
  const seasonYear = currentSeasonYear();
  const season = getSeason(seasonYear);
  const now = Date.now();

  let synced: { rounds: number[]; rows: number; failed: number } | null = null;
  const sync = async (rounds: number[]) => {
    const r = await syncExternalStats(supabaseAdmin, seasonYear, { onlyRounds: rounds });
    synced = { rounds, rows: r.insertedOrUpdated, failed: r.failedPlayers };
  };

  const inPlay = realRoundsInPlay(season, now);
  if (inPlay.length) await sync(inPlay);

  // Before finalising, make sure the latest stats are in (if they weren't just pulled).
  const results = await runResultsTick(supabaseAdmin, seasonYear, now, {
    beforeFinalise: async () => {
      if (!synced) await sync(season.fixtures.filter((f) => new Date(f.kickoffAt).getTime() <= now).map((f) => Number(f.week)).filter((r, i, a) => a.indexOf(r) === i).slice(-2));
    },
  });

  return { ok: true, season: seasonYear, at: new Date(now).toISOString(), statsSync: synced, ...results };
}

async function handle(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await tick());
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
