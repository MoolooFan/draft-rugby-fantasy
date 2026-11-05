// lib/scoring/leagueRules.ts
// Which scoring a league uses:
// - once its draft has started: the copy frozen then (later edits don't change a running season)
// - before that: Custom (the commissioner's values) or the current Standard / Alternate values,
//   which Ethan edits on the admin page (scoring_systems table)
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALTERNATE_SCORING, completeRules, STANDARD_SCORING, type ScoringRules } from "@/lib/scoring";

export type ScoringSystemId = "standard" | "alternate" | "custom";

type LeagueScoringRow = {
  scoring_system: string | null;
  scoring_custom: unknown;
  scoring_rules_locked: unknown;
};

/** The current Standard or Alternate values (from the database; the code's copy if missing). */
export async function getSystemRules(db: SupabaseClient, id: "standard" | "alternate"): Promise<ScoringRules> {
  const { data } = await db.from("scoring_systems").select("rules").eq("id", id).maybeSingle();
  if (data?.rules) return completeRules(data.rules as Partial<ScoringRules>);
  return id === "alternate" ? ALTERNATE_SCORING : STANDARD_SCORING;
}

/** Resolve a league's scoring rules from its row. */
export async function rulesForLeagueRow(db: SupabaseClient, row: LeagueScoringRow): Promise<ScoringRules> {
  if (row.scoring_rules_locked) return completeRules(row.scoring_rules_locked as Partial<ScoringRules>);
  if (row.scoring_system === "custom" && row.scoring_custom) return completeRules(row.scoring_custom as Partial<ScoringRules>);
  return getSystemRules(db, row.scoring_system === "alternate" ? "alternate" : "standard");
}

export async function getLeagueScoringRules(db: SupabaseClient, leagueId: string): Promise<ScoringRules> {
  const { data, error } = await db.from("leagues").select("scoring_system, scoring_custom, scoring_rules_locked").eq("id", leagueId).single();
  if (error) throw error;
  return rulesForLeagueRow(db, data as LeagueScoringRow);
}

/** Freeze a league's scoring (when its draft starts). Does nothing if already frozen. */
export async function lockLeagueScoring(db: SupabaseClient, leagueId: string): Promise<void> {
  const { data, error } = await db.from("leagues").select("scoring_system, scoring_custom, scoring_rules_locked").eq("id", leagueId).single();
  if (error) throw error;
  if ((data as LeagueScoringRow).scoring_rules_locked) return;
  const rules = await rulesForLeagueRow(db, data as LeagueScoringRow);
  const { error: uErr } = await db.from("leagues").update({ scoring_rules_locked: rules }).eq("id", leagueId);
  if (uErr) throw uErr;
}
