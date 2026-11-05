// lib/serverSession.ts
// Who is making this request? Answers from the Supabase Auth login cookies.
import "server-only";
import { cache } from "react";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ServerProfile = {
  authUserId: string;
  email: string | null;
  /** Lower-case username: the id used across the app (teams.owner_username etc.). */
  username: string;
  /** Username as the player typed it. */
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  timezone: string | null;
  /** Site admin (Ethan): can use the admin page. */
  isSiteAdmin: boolean;
};

/** The signed-in player's profile, or null. Cached for the rest of the request. */
export const getServerProfile = cache(async (): Promise<ServerProfile | null> => {
  const supabase = await createSupabaseAuthClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: row, error: rowError } = await supabaseAdmin
    .from("users")
    .select("username, username_norm, first_name, last_name, timezone, is_site_admin")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();

  if (rowError || !row) return null;

  return {
    authUserId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    username: row.username_norm,
    displayName: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    timezone: row.timezone,
    isSiteAdmin: !!row.is_site_admin,
  };
});

/** Lower-case username of the signed-in player, or null. */
export async function getServerUsername(): Promise<string | null> {
  return (await getServerProfile())?.username ?? null;
}
