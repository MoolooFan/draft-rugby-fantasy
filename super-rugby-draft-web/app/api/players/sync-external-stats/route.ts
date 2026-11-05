import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { syncExternalStats } from "@/lib/players/syncStats";

async function runSync(season: number) {
  return syncExternalStats(supabaseAdmin, season);
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const season = Number(body?.season ?? 2026);

    const result = await runSync(season);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to sync external player stats" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const season = Number(url.searchParams.get("season") ?? 2026);

    const result = await runSync(season);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to sync external player stats" },
      { status: 500 }
    );
  }
}