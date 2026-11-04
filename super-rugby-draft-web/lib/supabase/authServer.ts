// lib/supabase/authServer.ts
// Supabase client that acts AS the signed-in player (reads/writes their login cookies).
// Use in route handlers and server components. For admin database work keep using supabaseAdmin.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  REMEMBER_COOKIE,
  authCookieOptions,
  rememberCookieOptions,
  supabaseAnonKey,
  supabaseUrl,
} from "./authCookies";

/**
 * @param remember Pass true/false when signing in or up (the player just chose).
 *                 Leave undefined to keep whatever they chose last time.
 */
export async function createSupabaseAuthClient(remember?: boolean) {
  const jar = await cookies();

  if (remember !== undefined) {
    try {
      jar.set(REMEMBER_COOKIE, remember ? "1" : "0", rememberCookieOptions(remember));
    } catch {
      // Server components can't set cookies; only route handlers pass `remember`.
    }
  }

  const keep = remember ?? jar.get(REMEMBER_COOKIE)?.value === "1";

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            jar.set(name, value, authCookieOptions(options, keep));
          }
        } catch {
          // Called from a server component: cookies are read-only there.
          // The proxy refreshes tokens on every request, so this is safe to ignore.
        }
      },
    },
  });
}
