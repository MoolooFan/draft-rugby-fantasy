// lib/chat/tauntArtServer.ts — server only. Loads what the try taunt graphics need
// (lib/chat/tauntArt.ts): the pictures, team colours and players' skin tones.
import type { SupabaseClient } from "@supabase/supabase-js";
import { isHexColour, type TauntArt, type TeamColours } from "@/lib/chat/tauntArt";

export const TAUNT_ART_BUCKET = "taunt-art";

/** Colours Ethan saved on the admin page (teams not saved use the defaults). */
export async function loadTeamColours(db: SupabaseClient): Promise<Record<string, TeamColours>> {
  const { data } = await db.from("team_colours").select("team_code, jersey, trim_colour");
  const out: Record<string, TeamColours> = {};
  for (const r of data ?? []) {
    if (isHexColour(r.jersey) && isHexColour(r.trim_colour)) out[String(r.team_code).toUpperCase()] = { jersey: r.jersey, trim: r.trim_colour };
  }
  return out;
}

export async function loadTauntArt(db: SupabaseClient, opts: { activeOnly?: boolean } = {}): Promise<TauntArt[]> {
  let q = db.from("taunt_art").select("id, player_id, url, active").order("created_at");
  if (opts.activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as TauntArt[];
}

export async function loadSkinTones(db: SupabaseClient, playerIds: string[]): Promise<Map<string, number>> {
  if (!playerIds.length) return new Map();
  const { data } = await db.from("player_looks").select("player_id, skin_tone").in("player_id", playerIds);
  return new Map((data ?? []).filter((r) => r.skin_tone != null).map((r) => [String(r.player_id), Number(r.skin_tone)]));
}
