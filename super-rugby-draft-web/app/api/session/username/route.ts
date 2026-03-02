import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const COOKIE = "sr_user";
const SIG = "sr_sig";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function POST(req: Request) {
  const current = await getServerUsername();
  if (!current) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const usernameRaw = String(body?.username ?? "").trim();

  if (!usernameRaw || usernameRaw.length < 2) {
    return NextResponse.json({ ok: false, error: "Username required" }, { status: 400 });
  }

  const oldNorm = String(current).trim().toLowerCase();
  const newNorm = usernameRaw.trim().toLowerCase();

  // no-op
  if (newNorm === oldNorm) {
    return NextResponse.json({ ok: true, username: newNorm });
  }

  // ensure not taken
  const { data: existing, error: checkErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("username_norm", newNorm)
    .maybeSingle();

  if (checkErr) {
    return NextResponse.json({ ok: false, error: "Failed to check username" }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
  }

  // update the user row matching the OLD username_norm
  const { error: updErr } = await supabaseAdmin
    .from("users")
    .update({ username: usernameRaw, username_norm: newNorm })
    .eq("username_norm", oldNorm);

  if (updErr) {
    return NextResponse.json({ ok: false, error: "Failed to update username" }, { status: 500 });
  }

  // re-issue cookies for the new identity
  const sig = sign(newNorm);
  const res = NextResponse.json({ ok: true, username: newNorm });

  res.cookies.set(COOKIE, newNorm, { httpOnly: true, sameSite: "lax", path: "/" });
  res.cookies.set(SIG, sig, { httpOnly: true, sameSite: "lax", path: "/" });

  return res;
}