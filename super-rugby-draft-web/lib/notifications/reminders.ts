// lib/notifications/reminders.ts (server only)
// The timed push notifications, checked by the 5-minute job (app/api/cron/tick):
//   - Draft starting: 30 minutes before a league's draft (Ethan, 26 Nov 2026), to everyone in it.
//   - Lineup reminder: 2 hours before each week's team selection deadline, to every team playing
//     that week, with any problem in the lineup ("1 starter isn't playing"; Ethan, 26 Nov 2026).
// Each is sent once (push_sent), however often the job runs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSeason, totalFantasyWeeks, weekDeadlineMs, weekLabel } from "@/lib/season";
import { leagueUsers, sendOnce, sendPush, usersForTeams } from "@/lib/notifications/push";
import { lineupWarnings, warningSummary } from "@/lib/league/lineupWarnings";
import { weekProjections } from "@/lib/projections/server";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { squadFormatOf } from "@/lib/league/squad";

const MIN = 60_000;
export const DRAFT_REMINDER_MS = 30 * MIN;
export const LINEUP_REMINDER_MS = 120 * MIN;

/** Drafts starting within 30 minutes. */
async function draftReminders(db: SupabaseClient, nowMs: number): Promise<number> {
  const { data, error } = await db
    .from("leagues")
    .select("id, name, draft_at")
    .eq("draft_status", "scheduled")
    .gt("draft_at", new Date(nowMs).toISOString())
    .lte("draft_at", new Date(nowMs + DRAFT_REMINDER_MS).toISOString());
  if (error) throw error;
  let sent = 0;
  for (const l of data ?? []) {
    const at = Date.parse(String(l.draft_at));
    const mins = Math.max(1, Math.round((at - nowMs) / MIN));
    // keyed on the time too, so a draft moved to another day reminds again
    const did = await sendOnce(db, `draft-soon:${l.id}:${at}`, async () =>
      sendPush(db, await leagueUsers(db, l.id), "draft_soon", {
        title: `${l.name}: draft starts soon`,
        body: `The draft starts in ${mins} minutes. Get your watchlist and strategy ready.`,
        url: "/draft-room",
        tag: `draft:${l.id}`,
      })
    );
    if (did) sent++;
  }
  return sent;
}

/** "Round 9: check your lineup" / "1 starter isn't playing. Team selection closes in 2 hours (League)." */
export function lineupReminderText(label: string, leagueName: string, hoursLeft: number, problem: string | null): { title: string; body: string } {
  return {
    title: problem ? `${label}: check your lineup` : `${label}: team selection closes soon`,
    body: `${problem ? `${problem}. ` : ""}Team selection closes in ${hoursLeft === 1 ? "an hour" : `${hoursLeft} hours`} (${leagueName}).`,
  };
}

type Selection = { team_id: string; week: number; lineup: Record<string, { id?: string | null } | null> | null };

/** The lineup reminder for one league's week, to each team playing. */
async function lineupRemindersForLeague(db: SupabaseClient, league: { id: string; name: string; season: number; squad_format: unknown }, week: number, label: string, hoursLeft: number) {
  const { data: games } = await db.from("league_matchups").select("home_team_id, away_team_id").eq("league_id", league.id).contains("weeks", [week]);
  let teamIds = [...new Set((games ?? []).flatMap((g) => [g.home_team_id, g.away_team_id]).filter(Boolean) as string[])];
  // no schedule rows for the week found: everyone in the league
  if (!teamIds.length) {
    const { data: teams } = await db.from("teams").select("id").eq("league_id", league.id);
    teamIds = (teams ?? []).map((t) => t.id);
  }
  if (!teamIds.length) return 0;

  // each team's lineup for the week (or the one carried over from an earlier week) and the week's
  // expected lineups, for "1 starter isn't playing"
  const [{ data: sels }, projections] = await Promise.all([
    db.from("team_selections").select("team_id, week, lineup").eq("league_id", league.id).lte("week", week),
    getLeagueScoringRules(db, league.id)
      .then((rules) => weekProjections(db, league.season, week, rules))
      .catch(() => null),
  ]);
  const format = squadFormatOf(league.squad_format);
  let sent = 0;
  for (const teamId of teamIds) {
    const mine = ((sels ?? []) as Selection[]).filter((s) => s.team_id === teamId).sort((a, b) => b.week - a.week)[0];
    const problem =
      mine?.lineup && projections
        ? warningSummary(lineupWarnings(mine.lineup, (id) => projections.players[id] ?? projections.players[id.toLowerCase()] ?? null, format))
        : null;
    const did = await sendOnce(db, `lineup:${league.id}:${week}:${teamId}`, async () =>
      sendPush(db, await usersForTeams(db, [teamId]), "lineup_reminder", { ...lineupReminderText(label, league.name, hoursLeft, problem), url: "/team-selection", tag: `lineup:${league.id}:${week}` })
    );
    if (did) sent++;
  }
  return sent;
}

/** Weeks whose team selection closes within 2 hours: every league of the season with a draft done. */
async function lineupReminders(db: SupabaseClient, seasonYear: number, nowMs: number): Promise<number> {
  const season = getSeason(seasonYear);
  const due: Array<{ week: number; deadline: number }> = [];
  for (let w = 1; w <= totalFantasyWeeks(season); w++) {
    const d = weekDeadlineMs(season, w);
    if (d != null && nowMs < d && nowMs >= d - LINEUP_REMINDER_MS) due.push({ week: w, deadline: d });
  }
  if (!due.length) return 0;
  const { data: leagues, error } = await db.from("leagues").select("id, name, season, squad_format").eq("season", seasonYear).eq("draft_status", "complete");
  if (error) throw error;
  let sent = 0;
  for (const { week, deadline } of due) {
    const hoursLeft = Math.max(1, Math.round((deadline - nowMs) / (60 * MIN)));
    for (const l of leagues ?? []) {
      try {
        sent += await lineupRemindersForLeague(db, { id: l.id, name: l.name, season: Number(l.season), squad_format: l.squad_format }, week, weekLabel(season, week), hoursLeft);
      } catch (e) {
        console.error("[push] lineup reminders failed for", l.id, e);
      }
    }
  }
  return sent;
}

/** Everything due now; never throws. */
export async function sendDueReminders(db: SupabaseClient, seasonYear: number, nowMs: number) {
  const out: { draft: number | string; lineup: number | string } = { draft: 0, lineup: 0 };
  out.draft = await draftReminders(db, nowMs).catch((e) => `failed: ${e instanceof Error ? e.message : String(e)}`);
  out.lineup = await lineupReminders(db, seasonYear, nowMs).catch((e) => `failed: ${e instanceof Error ? e.message : String(e)}`);
  return out;
}
