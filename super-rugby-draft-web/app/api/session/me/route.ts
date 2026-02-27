import { NextResponse } from "next/server";
import { getServerUsername } from "@/lib/serverSession";

export async function GET() {
  const username = await getServerUsername();
  if (!username) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, username });
}