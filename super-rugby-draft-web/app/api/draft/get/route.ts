// app/api/draft/get/route.ts
// The league's draft as it stands (members only). Looking at the draft also moves it along:
// it starts at its time and any overdue auto-picks are made (see lib/draft/engine).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { advanceDraft, DraftError, getDraftState } from "@/lib/draft/engine";
import { ROSTER_SIZE, teamForPick } from "@/lib/draft/rules";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);

    const now = Date.now();
    await advanceDraft(supabaseAdmin, leagueId, now);
    const state = await getDraftState(supabaseAdmin, leagueId);

    const [{ data: picks, error: pErr }, { data: queue, error: qErr }] = await Promise.all([
      supabaseAdmin.from("draft_picks").select("*").eq("league_id", leagueId).order("pick_number", { ascending: true }),
      supabaseAdmin.from("draft_queue").select("player_id").eq("league_id", leagueId).eq("team_id", teamId).order("position"),
    ]);
    if (pErr) throw pErr;
    if (qErr) throw qErr;

    const order = state.draft_order_team_ids ?? [];
    return NextResponse.json({
      ok: true,
      serverNow: now,
      myTeamId: teamId,
      state: {
        ...state,
        total_picks: order.length * ROSTER_SIZE,
        on_the_clock_team_id: state.phase === "live" ? teamForPick(order, state.pick_index) : null,
      },
      picks: picks ?? [],
      queue: (queue ?? []).map((q) => q.player_id),
    });
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
