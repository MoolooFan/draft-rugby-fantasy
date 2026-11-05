// lib/players/syncStats.ts
// Pulls player stats from playfantasyrugby.com into player_round_stats.
// Fetches several players at once (it used to do ~450 one after another) and can be told to
// save only the rounds currently in play.
// Which players to fetch: the season's players in the database that have a playfantasyrugby id.
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExternalPlayerStatsByExternalId } from "@/lib/players/externalStats";

export type SyncResult = { ok: true; insertedOrUpdated: number; failedPlayers: number; failures: Array<{ internalId: string; externalId: number; error: string }> };

export async function syncExternalStats(
  db: SupabaseClient,
  season: number,
  opts: { onlyRounds?: number[]; concurrency?: number } = {}
): Promise<SyncResult> {
  const { data: players, error: pErr } = await db.from("players").select("id, external_id").eq("season", season).not("external_id", "is", null);
  if (pErr) throw pErr;
  // stats are stored under lower-case ids (e.g. "d.mckenzie"), as they always have been
  const entries = (players ?? []).map((p) => [String(p.id).toLowerCase(), Number(p.external_id)] as [string, number]);
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
