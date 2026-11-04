import { NextResponse } from "next/server";
import { getServerProfile } from "@/lib/serverSession";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const profile = await getServerProfile();
  if (!profile) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE });

  return NextResponse.json(
    {
      ok: true,
      username: profile.username,
      displayName: profile.displayName,
      firstName: profile.firstName,
      lastName: profile.lastName,
      timezone: profile.timezone,
    },
    { headers: NO_STORE },
  );
}
