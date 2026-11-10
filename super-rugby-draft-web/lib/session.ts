// lib/session.ts
// The signed-in player's profile, for use in the browser.
//
// The server is the only source of truth: app/layout.tsx reads the login cookie and
// hands the profile to <SessionProvider>, which stores it here before any page renders.
// (Previously this lived in sessionStorage, which the browser wipes when it closes. That
// is why "Remember me" seemed broken: the server remembered you but the pages didn't.)

export type UserProfile = {
  username: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
  /** Shows the Admin menu item; the server still checks on every admin request. */
  isSiteAdmin?: boolean;
};

/** @deprecated Kept for older code; profiles are always objects now. */
export type SessionUser = string | UserProfile;

let current: UserProfile | null = null;

/** Called by SessionProvider. Not for general use. */
export function setSessionProfile(profile: UserProfile | null) {
  current = profile;
}

export function getActiveUserProfile(): UserProfile | null {
  return current;
}

export function getActiveUser(): UserProfile | null {
  return current;
}

export function getActiveUsername(): string | null {
  return current?.username ?? null;
}

/** Times show in the device's own timezone (phone/computer settings), so nobody has to choose one. */
export function getActiveTimezone(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
