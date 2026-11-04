import { NextResponse } from "next/server";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { validateNewPassword } from "@/lib/auth/validate";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Sets a new password for the signed-in player (used after clicking a reset email link).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = validateNewPassword(body?.password);
  if (!password.ok) {
    return NextResponse.json({ ok: false, error: password.message }, { status: 400, headers: NO_STORE });
  }

  const supabase = await createSupabaseAuthClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return NextResponse.json(
      { ok: false, error: "Your reset link has expired. Please ask for a new one." },
      { status: 401, headers: NO_STORE },
    );
  }

  const { error } = await supabase.auth.updateUser({ password: password.value });
  if (error) {
    const message =
      error.code === "same_password"
        ? "That's your current password. Please choose a different one."
        : "Couldn't update your password. Please try again.";
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: NO_STORE });
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
