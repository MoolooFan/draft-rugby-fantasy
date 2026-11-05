// app/api/admin/difficulty/route.ts — admin only. Fixture difficulty ratings (1 easy ... 5 hard).
// home = playing that team at their ground; away = that team visiting your ground.
// pinned = keep this rating as set (the in-season update leaves it alone).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { currentSeasonYear, SEASONS } from "@/lib/season";

export const dynamic = "force-dynamic";

const seasonFrom = (v: unknown) => (SEASONS[Number(v)] ? Number(v) : currentSeasonYear());

export async function GET(req: Request) {
  try {
    await requireSiteAdmin();
    const season = seasonFrom(new URL(req.url).searchParams.get("season"));
    const { data, error } = await supabaseAdmin.from("team_difficulty").select("*").eq("season", season).order("team");
    if (error) throw error;
    return NextResponse.json({ ok: true, season, ratings: data ?? [] });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/** Body: { season, team, homeRating, awayRating, pinned } */
export async function POST(req: Request) {
  try {
    const admin = await requireSiteAdmin();
    const body = await req.json().catch(() => null);
    const season = seasonFrom(body?.season);
    const team = String(body?.team ?? "").trim();
    const home = Number(body?.homeRating);
    const away = Number(body?.awayRating);
    const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;
    if (!team || !ok(home) || !ok(away)) {
      return NextResponse.json({ ok: false, error: "Ratings must be whole numbers from 1 to 5" }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("team_difficulty").upsert(
      { season, team, home_rating: home, away_rating: away, pinned: !!body?.pinned, updated_at: new Date().toISOString(), updated_by: admin },
      { onConflict: "season,team" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
