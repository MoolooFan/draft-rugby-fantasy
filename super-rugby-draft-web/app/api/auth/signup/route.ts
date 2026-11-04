import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  TIMEZONE_VALUES,
  validateEmail,
  validateNewPassword,
  validateUsername,
} from "@/lib/auth/validate";

const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const username = validateUsername(body?.username);
  if (!username.ok) return fail(username.message);

  const email = validateEmail(body?.email);
  if (!email.ok) return fail(email.message);

  const password = validateNewPassword(body?.password);
  if (!password.ok) return fail(password.message);

  const timezone = String(body?.timezone ?? "");
  if (!(TIMEZONE_VALUES as readonly string[]).includes(timezone)) return fail("Please select a timezone.");

  const firstName = String(body?.firstName ?? "").trim().slice(0, 40);
  const lastName = String(body?.lastName ?? "").trim().slice(0, 40);
  const rememberMe = body?.rememberMe === true;

  // Friendly check first; the database's unique rule is the real guard.
  const { data: taken, error: takenError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("username_norm", username.value.key)
    .maybeSingle();
  if (takenError) return fail("Couldn't create your account. Please try again.", 500);
  if (taken) return fail("That username is already taken. Try a different one.", 409);

  const supabase = await createSupabaseAuthClient(rememberMe);
  const { data, error } = await supabase.auth.signUp({
    email: email.value,
    password: password.value,
    options: {
      // Read by the database trigger that creates the player's profile row.
      data: {
        username: username.value.clean,
        first_name: firstName,
        last_name: lastName,
        timezone,
      },
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return fail("There's already an account with that email. Try signing in.", 409);
    }
    if (error.code === "weak_password") return fail(error.message);
    // The profile trigger failing (e.g. username grabbed a moment ago) shows up as a database error.
    return fail("Couldn't create your account. That username may have just been taken.", 500);
  }

  // If email confirmation is switched on in Supabase, there is no session yet.
  const needsEmailConfirmation = !data.session;

  return NextResponse.json({ ok: true, needsEmailConfirmation }, { headers: NO_STORE });
}
