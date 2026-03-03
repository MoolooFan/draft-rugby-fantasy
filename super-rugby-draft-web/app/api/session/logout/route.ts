import { NextResponse } from "next/server";

const COOKIE = "sr_user";
const SIG = "sr_sig";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // Clear BOTH cookies robustly
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  res.cookies.set(SIG, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return res;
}