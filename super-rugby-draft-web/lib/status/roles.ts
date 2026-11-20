// lib/status/roles.ts
// Who started and who was on the bench each round (Ethan, 20 Nov 2026), for the player card's
// Starts and for the projections / AI coach's view of each player's past roles.
// Two places it comes from:
//   - player_round_roles: the lasting record, saved as each game finishes (lib/status/import.ts)
//   - player_week_status: this week's "Starting - #12" / "Bench - #22" before the game is over,
//     and past seasons' statuses (imported from Ethan's sheet), which win if both have the week.
import type { SupabaseClient } from "@supabase/supabase-js";
import { statusKind } from "@/lib/status/kind";

export type RoundRole = "starting" | "bench";
export type SavedRole = { week: number; player_id: string; role: RoundRole; jersey: number | null };

async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** The saved record for a season ([] if the table isn't there yet). */
export async function loadSavedRoles(db: SupabaseClient, season: number): Promise<SavedRole[]> {
  try {
    return await all<SavedRole>((from, to) =>
      db.from("player_round_roles").select("week, player_id, role, jersey").eq("season", season).order("week").order("player_id").range(from, to)
    );
  } catch {
    return [];
  }
}

/** The status text a saved role stands for, e.g. "Starting - #12". */
export function savedRoleStatus(r: Pick<SavedRole, "role" | "jersey">): string {
  const base = r.role === "starting" ? "Starting" : "Bench";
  return r.jersey ? `${base} - #${r.jersey}` : base;
}

export const roleKey = (playerId: string, week: number) => `${String(playerId).toLowerCase()}|${week}`;

/** Each player's role by fantasy week: roleKey(player, week) -> starting / bench. */
export async function loadRoundRoles(db: SupabaseClient, season: number): Promise<Map<string, RoundRole>> {
  const [saved, statuses] = await Promise.all([
    loadSavedRoles(db, season),
    all<{ week: number; player_id: string; status: string }>((from, to) =>
      db
        .from("player_week_status")
        .select("week, player_id, status")
        .eq("season", season)
        .or("status.ilike.starting%,status.ilike.bench%,status.ilike.benched%,status.ilike.sub%,status.ilike.replacement%")
        .order("week")
        .order("player_id")
        .range(from, to)
    ),
  ]);
  const out = new Map<string, RoundRole>();
  for (const r of saved) out.set(roleKey(r.player_id, r.week), r.role);
  for (const s of statuses) {
    const k = statusKind(s.status);
    if (k === "starting" || k === "bench") out.set(roleKey(s.player_id, s.week), k);
  }
  return out;
}
