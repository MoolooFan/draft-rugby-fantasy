"use client";

import { setSessionProfile, type UserProfile } from "@/lib/session";

/**
 * Stores the signed-in player's profile (read on the server in app/layout.tsx)
 * so every page can call getActiveUsername() etc. straight away, on any device,
 * whether or not the browser was closed since they signed in.
 */
export default function SessionProvider({
  profile,
  children,
}: {
  profile: UserProfile | null;
  children: React.ReactNode;
}) {
  // Set during render (not in an effect) so it is ready before any page renders.
  // Browser only: on the server one module is shared by every visitor's request.
  if (typeof window !== "undefined") setSessionProfile(profile);
  return <>{children}</>;
}
