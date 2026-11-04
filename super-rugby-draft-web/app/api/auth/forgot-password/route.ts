import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { validateEmail } from "@/lib/auth/validate";

// Sends a password-reset email. Always answers "ok" so nobody can use this
// to find out which emails have accounts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = validateEmail(body?.email);
  if (!email.ok) return NextResponse.json({ ok: false, error: email.message }, { status: 400 });

  const supabase = await createSupabaseAuthClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.value);

  if (error?.status === 429) {
    return NextResponse.json(
      { ok: false, error: "Too many reset emails sent recently. Please wait a while and try again." },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true });
}
