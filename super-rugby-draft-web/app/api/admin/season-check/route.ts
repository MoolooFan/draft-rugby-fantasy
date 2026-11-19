// app/api/admin/season-check/route.ts — admin only. The season setup checklist (lib/admin/seasonCheck.ts):
// GET ?season=2027 -> each check (ok / warn / fail) with what's wrong
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { seasonChecks } from "@/lib/admin/seasonCheck";
import { loadSeasonPlayers } from "@/lib/players/db";
import { currentSeasonYear, SEASONS } from "@/lib/season";
import { JERSEYS, TEAM_LOGOS } from "@/lib/teams/images";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireSiteAdmin();
    const season = Number(new URL(req.url).searchParams.get("season")) || currentSeasonYear();
    const photoIds = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from("player_images").select("internal_player_id, image_profile").range(from, from + 999);
      if (error) throw error;
      for (const r of data ?? []) if (/^https?:\/\//i.test(String(r.image_profile ?? ""))) photoIds.add(String(r.internal_player_id).toLowerCase());
      if ((data ?? []).length < 1000) break;
    }
    const [players, diff] = await Promise.all([
      loadSeasonPlayers(supabaseAdmin, season),
      supabaseAdmin.from("team_difficulty").select("team").eq("season", season),
    ]);
    if (diff.error) throw diff.error;
    const checks = seasonChecks({
      season,
      cfg: SEASONS[season] ?? null,
      players: players.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, teamCode: p.teamCode, posAbbrev: p.posAbbrev, draftRank: p.draftRank, externalId: p.externalId })),
      photoIds,
      difficultyTeams: (diff.data ?? []).map((d) => String(d.team)),
      jerseys: JERSEYS,
      logos: TEAM_LOGOS,
    });
    return NextResponse.json({ ok: true, season, checks });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
