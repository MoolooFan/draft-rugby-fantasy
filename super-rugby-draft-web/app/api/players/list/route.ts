// app/api/players/list/route.ts
// The season's player pool (from the database; it used to be a Google Sheet), with each
// player's weekly status. Same shape the pages already use.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadSeasonPlayers } from "@/lib/players/db";
import { currentSeasonYear, SEASONS } from "@/lib/season";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const asked = Number(new URL(req.url).searchParams.get("season"));
    const season = SEASONS[asked] ? asked : currentSeasonYear();
    const players = await loadSeasonPlayers(supabaseAdmin, season);
    return NextResponse.json({ ok: true, season, players });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
