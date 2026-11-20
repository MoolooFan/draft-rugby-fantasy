// lib/draft/strategyServer.ts (server only)
// Loading and saving draft strategies (lib/draft/strategy.ts; table draft_strategies). A person
// has a default (league_id '') and can have one per league; a league without its own uses the
// default.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanStrategy, type DraftStrategy } from "@/lib/draft/strategy";

const norm = (s: string) => String(s ?? "").trim().toLowerCase();

export type LoadedStrategy = {
  strategy: DraftStrategy;
  /** "league" = this league's own, "default" = their default, "none" = nothing saved yet */
  source: "league" | "default" | "none";
  updatedAt: string | null;
};

/** Their strategy for this league (or their default when leagueId is empty / has none). */
export async function loadStrategy(db: SupabaseClient, username: string, leagueId?: string | null): Promise<LoadedStrategy> {
  const ids = leagueId ? [leagueId, ""] : [""];
  const { data, error } = await db.from("draft_strategies").select("league_id, data, updated_at").eq("username", norm(username)).in("league_id", ids);
  if (error) throw error;
  const own = leagueId ? data?.find((r) => r.league_id === leagueId) : undefined;
  const def = data?.find((r) => r.league_id === "");
  const row = own ?? def;
  return {
    strategy: cleanStrategy(row?.data),
    source: own ? "league" : def ? "default" : "none",
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveStrategy(db: SupabaseClient, username: string, leagueId: string | null, strategy: unknown): Promise<DraftStrategy> {
  const clean = cleanStrategy(strategy);
  const { error } = await db
    .from("draft_strategies")
    .upsert({ username: norm(username), league_id: leagueId ?? "", data: clean, updated_at: new Date().toISOString() }, { onConflict: "username,league_id" });
  if (error) throw error;
  return clean;
}

/** Remove a league's own strategy (the league goes back to using their default). */
export async function clearLeagueStrategy(db: SupabaseClient, username: string, leagueId: string) {
  const { error } = await db.from("draft_strategies").delete().eq("username", norm(username)).eq("league_id", leagueId);
  if (error) throw error;
}

/** The strategy auto-pick uses for a team: its owner's one for the league, or their default. */
export async function strategyForTeam(db: SupabaseClient, leagueId: string, teamId: string): Promise<DraftStrategy | null> {
  const { data } = await db.from("teams").select("owner_username").eq("id", teamId).maybeSingle();
  const owner = data?.owner_username ? String(data.owner_username) : "";
  if (!owner) return null;
  return (await loadStrategy(db, owner, leagueId)).strategy;
}
