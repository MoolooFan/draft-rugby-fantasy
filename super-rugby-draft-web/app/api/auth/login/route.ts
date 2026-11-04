import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { validateEmail } from "@/lib/auth/validate";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = validateEmail(body?.email);
  const password = String(body?.password ?? "");
  const rememberMe = body?.rememberMe === true;

  if (!email.ok) return NextResponse.json({ ok: false, error: email.message }, { status: 400, headers: NO_STORE });
  if (!password) {
    return NextResponse.json({ ok: false, error: "Please enter your password." }, { status: 400, headers: NO_STORE });
  }

  const supabase = await createSupabaseAuthClient(rememberMe);
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password });

  if (error) {
    const unconfirmed = error.code === "email_not_confirmed";
    return NextResponse.json(
      {
        ok: false,
        error: unconfirmed
          ? "Please confirm your email first. Check your inbox for the link."
          : "Wrong email or password.",
      },
      { status: 401, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
