// proxy.ts (Next.js 16's name for middleware)
// Runs before every page and API request:
//  1. keeps the Supabase login fresh (refreshes the token and re-writes the cookies)
//  2. sends signed-out visitors to the sign-in page, and signed-in visitors past it
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  REMEMBER_COOKIE,
  authCookieOptions,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/authCookies";

// Pages anyone can open without signing in.
const PUBLIC_PAGES = new Set(["/", "/reset-password"]);

export async function proxy(request: NextRequest) {
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  let response = NextResponse.next({ request });
  // No-cache headers Supabase asks for whenever it writes login cookies.
  const authHeaders: Record<string, string> = {};

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        Object.assign(authHeaders, headers ?? {});
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, authCookieOptions(options, remember));
        }
        for (const [key, value] of Object.entries(authHeaders)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Must run before anything else: verifies the login and refreshes it if needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/") || path.startsWith("/auth/");

  if (!isApi) {
    if (!signedIn && !PUBLIC_PAGES.has(path)) return redirectTo(request, response, authHeaders, "/");
    if (signedIn && path === "/") return redirectTo(request, response, authHeaders, "/dashboard");
  }

  return response;
}

/** Redirect, carrying over any refreshed login cookies so they aren't lost. */
function redirectTo(
  request: NextRequest,
  from: NextResponse,
  headers: Record<string, string>,
  to: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const [key, value] of Object.entries(headers)) redirect.headers.set(key, value);
  return redirect;
}

export const config = {
  matcher: [
    // Everything except Next's own files and static images/icons.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|images/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
