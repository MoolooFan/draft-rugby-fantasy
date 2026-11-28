// app/api/draft/lottery/route.ts
// The draft lottery (lib/draft/lottery; Ethan, 28 Nov 2026).
// GET ?leagueId=  (members): every run, the teams, the current order. Runs the waiting one if
//   it's due, so the first phone to ask at the lottery time starts it for everyone. A waiting
//   run has no seed yet, so nothing about its result can be seen before it runs.
// POST { leagueId, action: "schedule", at } | { leagueId, action: "cancel" }  (commissioner only)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { cancelLottery, getLotteries, LotteryError, runDueLottery, scheduleLottery } from "@/lib/draft/lottery/server";

export const dynamic = "force-dynamic";

async function isCommissioner(leagueId: string, username: string) {
  const { data, error } = await supabaseAdmin.from("leagues").select("created_by").eq("id", leagueId).single();
  if (error) throw error;
  return String(data.created_by ?? "").trim().toLowerCase() === username;
}

function fail(e: unknown) {
  if (e instanceof LotteryError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
  const { msg, status } = toHttpError(e);
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { username } = await requireLeagueTeam(leagueId);
    const now = Date.now();
    await runDueLottery(supabaseAdmin, leagueId, now);

    const [runs, teamsRes, stateRes, commissioner] = await Promise.all([
      getLotteries(supabaseAdmin, leagueId),
      supabaseAdmin.from("teams").select("id, name").eq("league_id", leagueId).order("created_at"),
      supabaseAdmin.from("draft_state").select("phase, draft_order_team_ids, order_source").eq("league_id", leagueId).maybeSingle(),
      isCommissioner(leagueId, username),
    ]);
    if (teamsRes.error) throw teamsRes.error;
    if (stateRes.error) throw stateRes.error;
    return NextResponse.json({
      ok: true,
      serverNow: now,
      isCommissioner: commissioner,
      phase: stateRes.data?.phase ?? "preDraft",
      order: stateRes.data?.draft_order_team_ids ?? [],
      orderSource: stateRes.data?.order_source ?? null,
      teams: (teamsRes.data ?? []).map((t) => ({ id: String(t.id), name: String(t.name ?? "") })),
      runs: runs.map((r) => ({
        id: r.id,
        runNumber: r.run_number,
        scheduledAt: new Date(r.scheduled_at).getTime(),
        ranAt: r.ran_at ? new Date(r.ran_at).getTime() : null,
        seed: r.ran_at ? r.seed : null,
        teamIds: r.ran_at ? r.team_ids : null,
        resultTeamIds: r.ran_at ? r.result_team_ids : null,
      })),
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const leagueId = String(body?.leagueId ?? "").trim();
    const action = String(body?.action ?? "");
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { username } = await requireLeagueTeam(leagueId);
    if (!(await isCommissioner(leagueId, username))) {
      return NextResponse.json({ ok: false, error: "Only the commissioner can set the lottery" }, { status: 403 });
    }
    const now = Date.now();
    if (action === "schedule") await scheduleLottery(supabaseAdmin, leagueId, username, Number(body?.at), now);
    else if (action === "cancel") await cancelLottery(supabaseAdmin, leagueId, now);
    else return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
