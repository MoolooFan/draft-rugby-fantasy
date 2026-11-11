// GET  /api/account/notifications            -> { ok, settings }
// POST /api/account/notifications { settings } -> saves which notification types are on
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerProfile } from "@/lib/serverSession";
import { NOTIFICATION_TYPES, withDefaults } from "@/lib/notifications/types";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const profile = await getServerProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("notification_settings")
    .eq("auth_user_id", profile.authUserId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, settings: withDefaults(data?.notification_settings) }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const profile = await getServerProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = await req.json().catch(() => ({}));
  const incoming = body?.settings && typeof body.settings === "object" ? body.settings : {};
  // only the known types, as true / false
  const settings: Record<string, boolean> = {};
  for (const t of NOTIFICATION_TYPES) settings[t.key] = incoming[t.key] !== false;
  const { error } = await supabaseAdmin
    .from("users")
    .update({ notification_settings: settings })
    .eq("auth_user_id", profile.authUserId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, settings: withDefaults(settings) }, { headers: NO_STORE });
}
