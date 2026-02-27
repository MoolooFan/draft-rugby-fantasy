import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function requireUsername() {
  const u = await getServerUsername();
  if (!u) throw new Error("UNAUTHENTICATED");
  return norm(u);
}

/** Verify user is in league (owns a team in that league). Returns that teamId. */
export async function requireLeagueTeam(leagueId: string) {
  const username = await requireUsername();

  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_username", username)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("FORBIDDEN");

  return { username, teamId: String(data.id) };
}

/** Verify user owns the specific teamId */
export async function requireTeamOwner(teamId: string) {
  const username = await requireUsername();

  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("id, league_id, owner_username")
    .eq("id", teamId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("TEAM_NOT_FOUND");

  const owner = norm(String(data.owner_username ?? ""));
  if (!owner || owner !== username) throw new Error("FORBIDDEN");

  return { username, leagueId: String(data.league_id), teamId: String(data.id) };
}

export function toHttpError(e: any) {
  const msg = String(e?.message ?? e);
  const status =
    msg === "UNAUTHENTICATED" ? 401 :
    msg === "FORBIDDEN" ? 403 :
    msg === "TEAM_NOT_FOUND" ? 404 :
    500;

  return { msg, status };
}