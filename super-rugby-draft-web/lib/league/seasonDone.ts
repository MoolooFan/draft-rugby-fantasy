// lib/league/seasonDone.ts (server only)
// Is a league's season over (every week of its schedule finalised)? Same test as honours.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function seasonComplete(db: SupabaseClient, leagueId: string): Promise<{ complete: boolean; finalisedWeeks: number[] }> {
  const [{ data: league, error: lErr }, { data: done, error: fErr }] = await Promise.all([
    db.from("leagues").select("schedule_plan").eq("id", leagueId).maybeSingle(),
    db.from("league_week_finalisations").select("week").eq("league_id", leagueId),
  ]);
  if (lErr) throw lErr;
  if (fErr) throw fErr;
  const finalisedWeeks = (done ?? []).map((d) => Number(d.week)).sort((a, b) => a - b);
  const planWeeks: number[] = Array.isArray(league?.schedule_plan?.weeks) ? league.schedule_plan.weeks : [];
  const complete = planWeeks.length > 0 && planWeeks.every((w) => finalisedWeeks.includes(w));
  return { complete, finalisedWeeks };
}
