// app/auth/confirm/route.ts
// Where links in Supabase emails land (password reset, email confirmation).
// Works on any device because it uses the one-time token in the link itself.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";

const ALLOWED_TYPES: EmailOtpType[] = ["recovery", "signup", "email", "invite", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only ever redirect within this site.
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const target = request.nextUrl.clone();
  target.search = "";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createSupabaseAuthClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      target.pathname = next;
      return NextResponse.redirect(target);
    }
  }

  target.pathname = "/";
  target.searchParams.set("link", "expired");
  return NextResponse.redirect(target);
}
