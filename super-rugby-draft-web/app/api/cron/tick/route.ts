// app/api/cron/tick/route.ts
// Called every 5 minutes by Supabase's scheduler (pg_cron), with the CRON_SECRET password.
// - Player stats game by game (lib/stats/gameRuns.ts): every call (5 min) while a game is on,
//   hourly after, and a last run about 13.5h after kickoff, recorded as that game's final stats.
// - Reads each round's official team-list and injury articles once, from Wednesday 4:30pm NZT
//   (retrying every call until they're out); then, until each game kicks off, late changes from the
//   official fantasy game (lib/status/fantasyFeed.ts); clears Starting/Benched once a game has
//   finished (saving who started in player_round_roles first).
// - Final scores of finished games from the official fantasy game (lib/results/matchScores.ts).
// - Locks lineups at each deadline and finalises each round when it's due (lib/results/engine).
// - Keeps live drafts moving (auto-picks) even with nobody in the draft room.
// - Nightly backup of the database at about 3am NZ time (lib/backup/run.ts).
// Outside game weekends it does almost nothing, so it's cheap to call often.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { finishGames, runGameStats, type GameRunReport } from "@/lib/stats/gameRuns";
import { runResultsTick } from "@/lib/results/engine";
import { importMatchScores } from "@/lib/results/matchScores";
import { currentSeasonYear, getSeason, realRoundsAwaitingTeamLists } from "@/lib/season";
import { applyFantasyFeed, applyQuestionable, clearFinishedGameStatuses, importRoundStatus, type ImportReport } from "@/lib/status/import";
import { runDueWaivers } from "@/lib/waivers/process";
import { advanceDraft } from "@/lib/draft/engine";
import { coachTick } from "@/lib/coach/run";
import { backupIfDue } from "@/lib/backup/run";

export const maxDuration = 60; // seconds (Vercel)

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function tick() {
  const seasonYear = currentSeasonYear();
  const season = getSeason(seasonYear);
  const now = Date.now();

  // Player stats: live games every call; finished ones hourly; each game's last run once due.
  const firstCallOfHour = new Date(now).getUTCMinutes() < 5;
  const synced = await runGameStats(supabaseAdmin, seasonYear, now, { firstCallOfHour });
  let finishedBeforeFinalise: GameRunReport | null = null;

  // Final scores of finished games (official fantasy game), before any week is finalised so the
  // team-win / draw points are in (lib/results/matchScores.ts). Only reads the feed while a recent
  // game is missing its score.
  const matchScores = await importMatchScores(supabaseAdmin, seasonYear, now)
    .then((r) => ({ ...r, unmatched: r.unmatched.slice(0, 20) }))
    .catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

  // Team lists / injury lists: each article is read once, from Wednesday 4:30pm NZT until kickoff.
  const statusImports: Array<ImportReport | { realRound: number; error: string }> = [];
  for (const r of realRoundsAwaitingTeamLists(season, now)) {
    try {
      const { data: done, error } = await supabaseAdmin.from("status_imports").select("kind").eq("season", seasonYear).eq("real_round", r);
      if (error) throw error;
      const have = new Set((done ?? []).map((d) => d.kind));
      const kinds = (["team-list", "injury-list"] as const).filter((k) => !have.has(k));
      if (kinds.length) statusImports.push(await importRoundStatus(supabaseAdmin, seasonYear, r, {}, { kinds: [...kinds] }));
    } catch (e) {
      statusImports.push({ realRound: r, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Late changes (after the team lists, until kickoff) from the official fantasy game.
  const lateChanges = await applyFantasyFeed(supabaseAdmin, seasonYear, now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
  // Once a game has finished, its players' Starting / Benched statuses are saved, then cleared.
  const statusesCleared = await clearFinishedGameStatuses(supabaseAdmin, seasonYear, now).catch(() => -1);
  // Waivers run at their deadline (24 hours before the lineup deadline) even if nobody opens
  // the Transactions page.
  const waivers = await runDueWaivers(supabaseAdmin, seasonYear, now).catch((e) => [`failed: ${e instanceof Error ? e.message : String(e)}`]);

  // Injured players due back next round turn Questionable once this round has finished.
  const questionable = await applyQuestionable(supabaseAdmin, seasonYear, now).catch(() => -1);

  // AI coach: collect finished batches; send after-game and team-list notes that are due (lib/coach)
  const coach = await coachTick(supabaseAdmin, seasonYear, now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

  // Drafts: start any that are due and make overdue auto-picks (so a draft keeps going even
  // if nobody has the draft room open).
  const drafts: Array<{ leagueId: string; autoPicks?: number; error?: string }> = [];
  const { data: dueDrafts } = await supabaseAdmin
    .from("leagues")
    .select("id")
    .in("draft_status", ["scheduled", "live"])
    .lte("draft_at", new Date(now).toISOString());
  for (const l of dueDrafts ?? []) {
    try {
      const r = await advanceDraft(supabaseAdmin, l.id, now);
      if (r.autoPicks) drafts.push({ leagueId: l.id, autoPicks: r.autoPicks });
    } catch (e) {
      drafts.push({ leagueId: l.id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Before finalising a week, pull its final stats (all of its real rounds).
  const results = await runResultsTick(supabaseAdmin, seasonYear, now, {
    // any of the week's games still waiting get their last stats run first
    beforeFinalise: async (realRounds) => {
      finishedBeforeFinalise = await finishGames(supabaseAdmin, seasonYear, realRounds, now);
    },
  });

  // Nightly backup (3am NZ time, once a day)
  const backup = await backupIfDue(supabaseAdmin, now).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));

  return { ok: true, season: seasonYear, at: new Date(now).toISOString(), statsSync: synced, matchScores, finishedBeforeFinalise, statusImports, lateChanges, statusesCleared, questionable, waivers, drafts, coach, backup, ...results };
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
