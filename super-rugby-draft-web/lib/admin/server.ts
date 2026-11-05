// lib/admin/server.ts
// Admin-only routes call requireSiteAdmin() first.
import "server-only";
import { getServerProfile } from "@/lib/serverSession";

/** The signed-in site admin's username, or throws UNAUTHENTICATED / FORBIDDEN (see toHttpError). */
export async function requireSiteAdmin(): Promise<string> {
  const profile = await getServerProfile();
  if (!profile) throw new Error("UNAUTHENTICATED");
  if (!profile.isSiteAdmin) throw new Error("FORBIDDEN");
  return profile.username;
}
