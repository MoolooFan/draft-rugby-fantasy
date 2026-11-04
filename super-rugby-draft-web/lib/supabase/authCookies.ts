// lib/supabase/authCookies.ts
// Shared cookie rules for Supabase Auth, used by both the proxy and server code.
import type { CookieOptions } from "@supabase/ssr";

/** "1" = keep me signed in after the browser closes; anything else = this browser session only. */
export const REMEMBER_COOKIE = "sr_remember";

/** How long "Remember me" keeps someone signed in without visiting. */
export const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

export function supabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

export function supabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
}

function isDeletion(options: CookieOptions) {
  if (options.maxAge !== undefined && options.maxAge <= 0) return true;
  if (options.expires && new Date(options.expires).getTime() <= Date.now()) return true;
  return false;
}

/**
 * Apply our rules to every auth cookie Supabase wants to write:
 * - httpOnly: page scripts can't read the login tokens (we never use them in the browser)
 * - secure in production
 * - "Remember me" on  -> cookie lasts REMEMBER_MAX_AGE_SECONDS
 * - "Remember me" off -> no expiry, so the browser drops it when it closes
 */
export function authCookieOptions(options: CookieOptions, remember: boolean): CookieOptions {
  const base: CookieOptions = {
    ...options,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  if (isDeletion(options)) return base;

  if (remember) {
    return { ...base, maxAge: REMEMBER_MAX_AGE_SECONDS, expires: undefined };
  }

  const sessionOnly = { ...base };
  delete sessionOnly.maxAge;
  delete sessionOnly.expires;
  return sessionOnly;
}

export function rememberCookieOptions(remember: boolean): CookieOptions {
  return authCookieOptions({}, remember);
}
