// app/api/recap/list/route.ts
// Every recap you can view again (Team Details): this season's weekly recaps (finalised rounds of
// this league) and a season recap for every finished season of this league's history you played.
// Weekly recaps of earlier seasons aren't kept (Ethan: they go when a new season starts).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, requireUsername, toHttpError } from "@/lib/league/serverAuth";
import { leagueLineage } from "@/lib/league/honours";
import { seasonComplete } from "@/lib/league/seasonDone";
import { getSeason, SEASONS, weekLabel } from "@/lib/season";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    await requireLeagueTeam(leagueId);
    const username = await requireUsername();

    const { data: lg } = await supabaseAdmin.from("leagues").select("season").eq("id", leagueId).maybeSingle();
    const season = Number(lg?.season);
    const here = await seasonComplete(supabaseAdmin, leagueId);
    const weeks = here.finalisedWeeks.map((w) => ({ week: w, label: SEASONS[season] ? weekLabel(getSeason(season), w) : `Round ${w}` }));

    // seasons: this league's lineage, the leagues you had a team in, finished ones (newest first)
    const lineage = await leagueLineage(supabaseAdmin, leagueId);
    const { data: leagues, error } = await supabaseAdmin.from("leagues").select("id, season").or(`lineage_id.eq.${lineage},id.eq.${lineage}`);
    if (error) throw error;
    const all = [...(leagues ?? [])];
    if (!all.some((l) => l.id === leagueId)) all.push({ id: leagueId, season });
    const { data: mine, error: tErr } = await supabaseAdmin.from("teams").select("league_id").eq("owner_username", username).in("league_id", all.map((l) => l.id));
    if (tErr) throw tErr;
    const played = new Set((mine ?? []).map((t) => t.league_id));
    const seasons: Array<{ leagueId: string; season: number }> = [];
    for (const l of all.filter((x) => played.has(x.id)).sort((a, b) => Number(b.season) - Number(a.season))) {
      if ((await seasonComplete(supabaseAdmin, l.id)).complete) seasons.push({ leagueId: l.id, season: Number(l.season) });
    }
    return NextResponse.json({ ok: true, weeks, seasons });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
