// app/api/fixtures/scores/route.ts
// A season's real Super Rugby final scores (match_results, from the official fantasy game after
// each game; lib/results/matchScores.ts), for pages that use the fixtures file directly
// (lib/fixtures/useScores.ts). GET [?season=2027]
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { currentSeasonYear, SEASONS } from "@/lib/season";
import { savedMatchScores } from "@/lib/results/matchScores";
import { demo } from "@/lib/demo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const asked = Number(new URL(req.url).searchParams.get("season"));
    const season = SEASONS[asked] ? asked : currentSeasonYear();
    let scores = await savedMatchScores(supabaseAdmin, season);
    // demo site (lib/demo.ts): games after its frozen round haven't been played yet
    const d = demo();
    if (d && season === d.season) scores = scores.filter((s) => s.realRound <= d.lastRealRound);
    return NextResponse.json({ ok: true, season, scores });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
