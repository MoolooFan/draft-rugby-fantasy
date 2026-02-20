import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase/server";

const COOKIE = "sr_user";
const SIG = "sr_sig";

function sign(value: string) {
  const secret = process.env.SESSION_SECRET!;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim();

  if (!username || username.length < 2) {
    return NextResponse.json({ ok: false, error: "Username required" }, { status: 400 });
  }

  // ✅ claim global-unique username
  const { error } = await supabaseServer
    .from("users")
    .insert({ username });

  if (error) {
    // supabase returns conflict-ish error if username exists
    return NextResponse.json({ ok: false, error: "Username already taken" }, { status: 409 });
  }

  const sig = sign(username);

  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(COOKIE, username, { httpOnly: true, sameSite: "lax", path: "/" });
  res.cookies.set(SIG, sig, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}