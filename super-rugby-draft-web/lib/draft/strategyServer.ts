// lib/draft/strategyServer.ts (server only)
// Loading and saving draft strategies (lib/draft/strategy.ts; table draft_strategies). One per
// person per league. (Until 25 Nov 2026 there was also a "default" for leagues without their own,
// saved as league_id ''; those rows are no longer used.)
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanStrategy, EMPTY_STRATEGY, type DraftStrategy } from "@/lib/draft/strategy";

const norm = (s: string) => String(s ?? "").trim().toLowerCase();

export type LoadedStrategy = {
  strategy: DraftStrategy;
  /** "league" = saved for this league, "none" = nothing saved yet */
  source: "league" | "none";
  updatedAt: string | null;
};

/** Their strategy for this league. */
export async function loadStrategy(db: SupabaseClient, username: string, leagueId: string): Promise<LoadedStrategy> {
  if (!leagueId) return { strategy: EMPTY_STRATEGY, source: "none", updatedAt: null };
  const { data, error } = await db.from("draft_strategies").select("data, updated_at").eq("username", norm(username)).eq("league_id", leagueId).maybeSingle();
  if (error) throw error;
  return { strategy: cleanStrategy(data?.data), source: data ? "league" : "none", updatedAt: data?.updated_at ?? null };
}

export async function saveStrategy(db: SupabaseClient, username: string, leagueId: string, strategy: unknown): Promise<DraftStrategy> {
  const clean = cleanStrategy(strategy);
  const { error } = await db
    .from("draft_strategies")
    .upsert({ username: norm(username), league_id: leagueId, data: clean, updated_at: new Date().toISOString() }, { onConflict: "username,league_id" });
  if (error) throw error;
  return clean;
}

/** The strategy auto-pick uses for a team: its owner's one for the league. */
export async function strategyForTeam(db: SupabaseClient, leagueId: string, teamId: string): Promise<DraftStrategy | null> {
  const { data } = await db.from("teams").select("owner_username").eq("id", teamId).maybeSingle();
  const owner = data?.owner_username ? String(data.owner_username) : "";
  if (!owner) return null;
  return (await loadStrategy(db, owner, leagueId)).strategy;
}
