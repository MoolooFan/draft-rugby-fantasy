// lib/players/syncStats.ts
// Pulls player stats from playfantasyrugby.com into player_round_stats.
// Fetches several players at once (it used to do ~450 one after another) and can be told to
// save only the rounds currently in play.
// TODO(items 9/13): the player id map is still 2026's; 2027 players come from the database.
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXTERNAL_PLAYER_ID_MAP } from "@/lib/players/externalIdMap";
import { fetchExternalPlayerStatsByExternalId } from "@/lib/players/externalStats";

export type SyncResult = { ok: true; insertedOrUpdated: number; failedPlayers: number; failures: Array<{ internalId: string; externalId: number; error: string }> };

export async function syncExternalStats(
  db: SupabaseClient,
  season: number,
  opts: { onlyRounds?: number[]; concurrency?: number } = {}
): Promise<SyncResult> {
  const entries = Object.entries(EXTERNAL_PLAYER_ID_MAP) as Array<[string, number]>;
  const only = opts.onlyRounds ? new Set(opts.onlyRounds) : null;
  const upserts: Record<string, unknown>[] = [];
  const failures: SyncResult["failures"] = [];
  const now = new Date().toISOString();

  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const [internalId, externalId] = entries[next++];
      try {
        const rows = await fetchExternalPlayerStatsByExternalId(externalId);
        for (const row of rows) {
          if (only && !only.has(row.round)) continue;
          upserts.push({
            season,
            internal_player_id: internalId,
            external_player_id: externalId,
            round: row.round,
            points: row.points,
            raw_json: row.raw ?? {},
            updated_at: now,
          });
        }
      } catch (e) {
        failures.push({ internalId, externalId, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 12 }, worker));

  for (let i = 0; i < upserts.length; i += 1000) {
    const { error } = await db.from("player_round_stats").upsert(upserts.slice(i, i + 1000), { onConflict: "season,internal_player_id,round" });
    if (error) throw error;
  }
  return { ok: true, insertedOrUpdated: upserts.length, failedPlayers: failures.length, failures };
}
