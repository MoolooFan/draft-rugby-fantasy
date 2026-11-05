// app/api/cron/tick/route.ts
// Called every 5 minutes by Supabase's scheduler (pg_cron), with the CRON_SECRET password.
// - While a game is on (kickoff to 3h after): pulls fresh player stats every call (5 min).
// - After a game until its stats are final (13.5h after kickoff): pulls them once an hour.
// - Reads the official team-list / injury articles hourly in the days before each round.
// - Locks lineups at each deadline and finalises each round when it's due (lib/results/engine).
// Outside game weekends it does almost nothing, so it's cheap to call often.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncExternalStats } from "@/lib/players/syncStats";
import { runResultsTick } from "@/lib/results/engine";
import { currentSeasonYear, getSeason, liveRealRounds, realRoundsAwaitingFinalStats, realRoundsAwaitingTeamLists } from "@/lib/season";
import { importRoundStatus, type ImportReport } from "@/lib/status/import";

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

  // Live games every call; finished games only on the first call of each hour.
  const firstCallOfHour = new Date(now).getUTCMinutes() < 5;
  const rounds = new Set(liveRealRounds(season, now));
  if (firstCallOfHour) for (const r of realRoundsAwaitingFinalStats(season, now)) rounds.add(r);
  if (rounds.size) await sync([...rounds]);

  // Team lists / injury lists: once an hour from 3 days before a round's first kickoff until it.
  const statusImports: Array<ImportReport | { realRound: number; error: string }> = [];
  if (firstCallOfHour) {
    for (const r of realRoundsAwaitingTeamLists(season, now)) {
      try {
        statusImports.push(await importRoundStatus(supabaseAdmin, seasonYear, r));
      } catch (e) {
        statusImports.push({ realRound: r, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // Before finalising a week, pull its final stats (all of its real rounds).
  const results = await runResultsTick(supabaseAdmin, seasonYear, now, {
    beforeFinalise: (realRounds) => sync(realRounds),
  });

  return { ok: true, season: seasonYear, at: new Date(now).toISOString(), statsSync: synced, statusImports, ...results };
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
