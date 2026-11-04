import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAuthClient } from "@/lib/supabase/authServer";
import { REMEMBER_COOKIE } from "@/lib/supabase/authCookies";

export async function POST() {
  const supabase = await createSupabaseAuthClient();
  // "local" = sign out this browser only, not the player's other devices.
  await supabase.auth.signOut({ scope: "local" });

  const jar = await cookies();
  jar.delete(REMEMBER_COOKIE);
  // Old pre-2027 login cookies, in case a browser still has them.
  jar.delete("sr_user");
  jar.delete("sr_sig");

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
