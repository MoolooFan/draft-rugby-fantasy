// lib/authz.ts
import { supabaseAdmin } from "@/lib/supabase/server";

export function normalizeUsername(u: string) {
  return u.trim().toLowerCase();
}

export function requireUser(username: string | null) {
  if (!username) {
    return { ok: false as const, status: 401 as const, error: "Not signed in" };
  }
  return { ok: true as const, username: normalizeUsername(username) };
}

export async function requireLeagueMember(leagueId: string, usernameNorm: string) {
  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("id, league_id, owner_username")
    .eq("league_id", leagueId)
    .eq("owner_username", usernameNorm)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500 as const, error: error.message };
  if (!data) return { ok: false as const, status: 403 as const, error: "Not a league member" };

  return { ok: true as const, team: data };
}

export async function requireTeamOwner(teamId: string, leagueId: string, usernameNorm: string) {
  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("id, league_id, owner_username")
    .eq("id", teamId)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500 as const, error: error.message };
  if (!data) return { ok: false as const, status: 404 as const, error: "Team not found" };
  if (data.owner_username !== usernameNorm) {
    return { ok: false as const, status: 403 as const, error: "Not team owner" };
  }
  return { ok: true as const, team: data };
}