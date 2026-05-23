import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import fixturesData from "@/data/fixtures-2026.json";

type AnyFixture = {
  id: string;
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
};

function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

function getWeekFirstKickoffMs(fixtures: AnyFixture[], week: number) {
  const wk = fixtures.filter((f) => f.week === week);
  if (!wk.length) return 0;
  return Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
}

function getWeekDeadlineMs(fixtures: AnyFixture[], week: number) {
  const first = getWeekFirstKickoffMs(fixtures, week);
  return first ? first - -25.5 * 60 * 60 * 1000 : 0;
}

async function cancelExpiredPendingTrades(leagueId: string, nowMs: number) {
  const fixtures: AnyFixture[] = (fixturesData as AnyFixture[]).map((f) => ({
    ...f,
    kickoffMs: toMs((f as any).kickoffAt),
  }));

  const weeks = Array.from(new Set(fixtures.map((f) => f.week)));

  const expiredWeeks = weeks.filter((w) => {
    const dl = getWeekDeadlineMs(fixtures, w);
    return dl > 0 && nowMs >= dl;
  });

  if (!expiredWeeks.length) return;

    const { error } = await supabaseAdmin
    .from("trade_offers")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .in("week", expiredWeeks);

  if (error) throw error;
}

const norm = (s: string) => s.trim().toLowerCase();

export async function GET(req: Request) {
  try {
    const usernameRaw = await getServerUsername();
    if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    const username = norm(usernameRaw);

    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    const status = String(searchParams.get("status") ?? "").trim(); // optional

    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });

    // must be league member (owner of a team in this league)
    const { data: member, error: memberErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("league_id", leagueId)
      .eq("owner_username", username)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
    if (!member) return NextResponse.json({ ok: false, error: "Not a league member" }, { status: 403 });

    // Auto-cancel expired trades before returning list
    await cancelExpiredPendingTrades(leagueId, Date.now());

    let q = supabaseAdmin
      .from("trade_offers")
      .select("*")
      .eq("league_id", leagueId)
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);

    const { data: offers, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, offers: offers ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to list trades" }, { status: 500 });
  }
}