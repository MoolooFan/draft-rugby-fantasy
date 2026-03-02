import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

const COOKIE = "sr_user";
const SIG = "sr_sig";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

const COOKIE_DAYS = 30;

function cookieOptions(rememberMe: boolean) {
  const base: any = { httpOnly: true, sameSite: "lax", path: "/" };

  if (rememberMe) base.maxAge = COOKIE_DAYS * 24 * 60 * 60;

  // Optional (recommended in prod):
  // base.secure = process.env.NODE_ENV === "production";

  return base;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const rememberMe = !!body?.rememberMe;
const opts = cookieOptions(rememberMe);

  const action = String(body?.action ?? "signin").trim(); // "signin" | "create"
  const usernameRaw = String(body?.username ?? "").trim();

  if (!usernameRaw || usernameRaw.length < 2) {
    return NextResponse.json({ ok: false, error: "Username required" }, { status: 400 });
  }

  const username_norm = usernameRaw.trim().toLowerCase();

  // 1) If action === "signin", user MUST already exist
  if (action === "signin") {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, username, username_norm")
      .eq("username_norm", username_norm)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: "Failed to sign in" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Account not found. Please create an account first." }, { status: 404 });
    }

    const sig = sign(username_norm);
    const res = NextResponse.json({ ok: true, username: username_norm });

    res.cookies.set(COOKIE, username_norm, opts);
res.cookies.set(SIG, sig, opts);

    return res;
  }

  // 2) action === "create" => create if doesn't exist, error if taken
  if (action === "create") {
    const { data: existing, error: checkErr } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("username_norm", username_norm)
      .maybeSingle();

    if (checkErr) {
      return NextResponse.json({ ok: false, error: "Failed to create account" }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
    }

    const { error: insertErr } = await supabaseAdmin
      .from("users")
      .insert({ username: usernameRaw, username_norm });

    if (insertErr) {
      return NextResponse.json({ ok: false, error: "Failed to create account" }, { status: 500 });
    }

    const sig = sign(username_norm);
    const res = NextResponse.json({ ok: true, username: username_norm });

    res.cookies.set(COOKIE, username_norm, opts);
res.cookies.set(SIG, sig, opts);

    return res;
  }

  // unknown action
  return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
}