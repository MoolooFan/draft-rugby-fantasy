import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

const COOKIE = "sr_user";
const SIG = "sr_sig";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function normalizeUsername(input: string) {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function displayUsername(input: string) {
  // keep as user typed, but trim/collapse spaces
  return input.trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const usernameRaw = String(body?.username ?? "");

  const username_norm = normalizeUsername(usernameRaw);
  const username = displayUsername(usernameRaw);

  if (!username_norm || username_norm.length < 2) {
    return NextResponse.json({ ok: false, error: "Username required" }, { status: 400 });
  }

  // ✅ Create account (or no-op if it already exists)
  const { error } = await supabaseAdmin
    .from("users")
    .upsert({ username, username_norm }, { onConflict: "username_norm" });

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to create account" }, { status: 500 });
  }

  // Create session cookies immediately after signup
  const sig = sign(username_norm);

  const res = NextResponse.json({ ok: true, username: username_norm });
  res.cookies.set(COOKIE, username_norm, { httpOnly: true, sameSite: "lax", path: "/" });
  res.cookies.set(SIG, sig, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}