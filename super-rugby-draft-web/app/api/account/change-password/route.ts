// POST /api/account/change-password { currentPassword, newPassword }
// For a signed-in player on the Account page: checks the current password, then sets the new one.
// (Forgot your password? The login page emails a reset link instead.)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/authCookies";
import { getServerProfile } from "@/lib/serverSession";
import { validateNewPassword } from "@/lib/auth/validate";

const NO_STORE = { "Cache-Control": "private, no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

export async function POST(req: Request) {
  const profile = await getServerProfile();
  if (!profile?.email) return fail("Please log in again.", 401);

  const body = await req.json().catch(() => ({}));
  const current = String(body?.currentPassword ?? "");
  if (!current) return fail("Please enter your current password.");
  const next = validateNewPassword(body?.newPassword);
  if (!next.ok) return fail(next.message);
  if (next.value === current) return fail("That's your current password. Please choose a different one.");

  // Check the current password with a separate client, so the player's own login isn't touched.
  const checker = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: checkErr } = await checker.auth.signInWithPassword({ email: profile.email, password: current });
  if (checkErr) return fail("Your current password isn't right.");

  const supabase = await createSupabaseAuthClient();
  const { error } = await supabase.auth.updateUser({ password: next.value });
  if (error) {
    return fail(
      error.code === "same_password"
        ? "That's your current password. Please choose a different one."
        : "Couldn't change your password. Please try again."
    );
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
