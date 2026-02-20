// lib/session.ts
const ACTIVE_KEY = "df_active_user"; // sessionStorage
const REMEMBER_KEY = "df_remembered_user"; // localStorage

export type SessionUser =
  | string
  | {
      username: string;
      firstName?: string;
      lastName?: string;
      timezone?: string;
    };

function safeParseUser(raw: string | null): SessionUser | null {
  if (!raw) return null;

  // Back-compat: old format was just the username string
  // New format: JSON string with { username, firstName, lastName, timezone }
  if (raw.trim().startsWith("{")) {
    try {
      return JSON.parse(raw) as SessionUser;
    } catch {
      return raw; // fallback to string if parse fails
    }
  }

  return raw;
}

function normalizeUser(u: SessionUser): { username: string; firstName?: string; lastName?: string; timezone?: string } {
  if (typeof u === "string") return { username: u };
  return { username: u.username, firstName: u.firstName, lastName: u.lastName, timezone: u.timezone };
}

export function setActiveUser(user: SessionUser) {
  if (typeof window === "undefined") return;
  const payload = typeof user === "string" ? user : JSON.stringify(user);
  sessionStorage.setItem(ACTIVE_KEY, payload);
}

export function rememberUser(user: SessionUser) {
  if (typeof window === "undefined") return;
  const payload = typeof user === "string" ? user : JSON.stringify(user);
  localStorage.setItem(REMEMBER_KEY, payload);
}

export function getActiveUser(): SessionUser | null {
  if (typeof window === "undefined") return null;

  const activeRaw = sessionStorage.getItem(ACTIVE_KEY);

  // 🔒 SESSION ONLY (remembered user ignored for now)
  return safeParseUser(activeRaw);
}

export function clearUser() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACTIVE_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

/** Convenience helpers */
export function getActiveUsername(): string | null {
  const u = getActiveUser();
  if (!u) return null;
  return typeof u === "string" ? u : u.username;
}

export function getActiveTimezone(): string | undefined {
  const u = getActiveUser();
  if (!u || typeof u === "string") return undefined;
  return u.timezone || undefined;
}

/** Compatibility helpers (keep while we iterate) */
export function getRememberedUsername(): string | null {
  if (typeof window === "undefined") return null;

  const remembered = safeParseUser(localStorage.getItem(REMEMBER_KEY));
  if (!remembered) return null;

  const n = normalizeUser(remembered);
  return n.username ?? null;
}

export function setRememberedUsername(username: string) {
  rememberUser(username);
}



export function clearRememberedUsername() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REMEMBER_KEY);
}

export type UserProfile = {
  username: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
};

export function getActiveUserProfile(): UserProfile | null {
  const u = getActiveUser();
  if (!u) return null;
  if (typeof u === "string") return { username: u };
  return { username: u.username, firstName: u.firstName, lastName: u.lastName, timezone: u.timezone };
}

export function getUserInitialsFromProfile(profile: UserProfile | null): string {
  if (!profile) return "U";

  const fn = (profile.firstName ?? "").trim();
  const ln = (profile.lastName ?? "").trim();

  if (fn || ln) {
    return `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase();
  }

  const u = (profile.username ?? "").trim();
  return (u.slice(0, 2) || "U").toUpperCase();
}
