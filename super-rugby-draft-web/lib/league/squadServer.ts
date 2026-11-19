// lib/league/squadServer.ts
// A league's squad format from the database (lib/league/squad.ts). Server only.
import type { SupabaseClient } from "@supabase/supabase-js";
import { squadFormatOf, type SquadFormat } from "@/lib/league/squad";

export async function loadSquadFormat(db: SupabaseClient, leagueId: string): Promise<SquadFormat> {
  const { data, error } = await db.from("leagues").select("squad_format").eq("id", leagueId).maybeSingle();
  if (error) throw error;
  return squadFormatOf(data?.squad_format);
}
