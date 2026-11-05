// app/api/admin/player-status/route.ts — admin only. Set (or clear) a player's status for a
// week by hand, e.g. a late injury after the Wednesday team lists.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { currentSeasonYear, getSeason, SEASONS, totalFantasyWeeks } from "@/lib/season";

/** Body: { season, week, playerId, status } — an empty status clears it (= not named). */
export async function POST(req: Request) {
  try {
    const admin = await requireSiteAdmin();
    const body = await req.json().catch(() => null);
    const season = SEASONS[Number(body?.season)] ? Number(body.season) : currentSeasonYear();
    const week = Number(body?.week);
    const playerId = String(body?.playerId ?? "").trim();
    const status = String(body?.status ?? "").trim();
    if (!playerId || !Number.isInteger(week) || week < 1 || week > totalFantasyWeeks(getSeason(season))) {
      return NextResponse.json({ ok: false, error: "Missing player or week" }, { status: 400 });
    }
    if (!status) {
      const { error } = await supabaseAdmin.from("player_week_status").delete().eq("season", season).eq("week", week).eq("player_id", playerId);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin.from("player_week_status").upsert(
        { season, week, player_id: playerId, status, source: "manual", updated_at: new Date().toISOString(), updated_by: admin },
        { onConflict: "season,week,player_id" }
      );
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
