// app/api/draft/order/route.ts
// The commissioner (league creator) sets the draft order, until the draft starts.
// Body: { leagueId, teamIds } — every team once, first pick first.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { DraftError, setDraftOrder } from "@/lib/draft/engine";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    const teamIds = Array.isArray(body?.teamIds) ? body.teamIds.map(String) : null;
    if (!leagueId || !teamIds) return NextResponse.json({ ok: false, error: "Missing leagueId/teamIds" }, { status: 400 });
    const { username } = await requireLeagueTeam(leagueId);
    const { data: league, error } = await supabaseAdmin.from("leagues").select("created_by").eq("id", leagueId).single();
    if (error) throw error;
    if (String(league.created_by ?? "").trim().toLowerCase() !== username) {
      return NextResponse.json({ ok: false, error: "Only the league creator can change the draft order" }, { status: 403 });
    }
    await setDraftOrder(supabaseAdmin, leagueId, teamIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
