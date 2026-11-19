// GET  /api/account/coach-name          -> { ok, name }   (null = the default, "AI Coach")
// POST /api/account/coach-name { name } -> saves it (empty puts the default back)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerProfile } from "@/lib/serverSession";
import { cleanCoachName } from "@/lib/coach/nameRules";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const profile = await getServerProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const { data, error } = await supabaseAdmin.from("users").select("coach_name").eq("auth_user_id", profile.authUserId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, name: data?.coach_name ?? null }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const profile = await getServerProfile();
  if (!profile) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = await req.json().catch(() => ({}));
  const name = cleanCoachName(body?.name);
  const { error } = await supabaseAdmin.from("users").update({ coach_name: name }).eq("auth_user_id", profile.authUserId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, name }, { headers: NO_STORE });
}
