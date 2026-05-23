// app/api/trades/propose/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
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

// Team selection deadline = 1 hour before first kickoff
function getWeekDeadlineMs(fixtures: AnyFixture[], week: number) {
  const firstKickoff = getWeekFirstKickoffMs(fixtures, week);
  return firstKickoff ? firstKickoff - -26 * 60 * 60 * 1000 : 0;
}

function getWeeksSorted(fixtures: AnyFixture[]) {
  return Array.from(new Set(fixtures.map((f) => f.week))).sort((a, b) => a - b);
}

/**
 * Cancels any pending trade_offers for weeks where deadline has passed.
 * This is "lazy cleanup": it runs whenever someone proposes a trade.
 */
async function cancelExpiredPendingTrades(leagueId: string, nowMs: number) {
  const fixtures: AnyFixture[] = (fixturesData as AnyFixture[]).map((f) => ({
    ...f,
    kickoffMs: toMs((f as any).kickoffAt),
  }));

  const weeks = getWeeksSorted(fixtures);

  const expiredWeeks = weeks.filter((w) => {
    const dl = getWeekDeadlineMs(fixtures, w);
    return dl > 0 && nowMs >= dl;
  });

  if (!expiredWeeks.length) return;

  const { error } = await supabaseAdmin
    .from("trade_offers")
    .update({ status: "cancelled" })
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .in("week", expiredWeeks);

  if (error) throw error;
}

/**
 * Returns true if the week’s selection deadline is already passed.
 */
function isPastWeekDeadline(week: number, nowMs: number) {
  const fixtures: AnyFixture[] = (fixturesData as AnyFixture[]).map((f) => ({
    ...f,
    kickoffMs: toMs((f as any).kickoffAt),
  }));
  const dl = getWeekDeadlineMs(fixtures, week);
  return dl > 0 && nowMs >= dl;
}

const uniq = (arr: any[]) =>
  Array.from(new Set(arr.map((x) => String(x).trim()).filter(Boolean)));

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);
    const toTeamId = String(body.toTeamId ?? body.to_team_id ?? "").trim();

    const offerPlayerIdsRaw = body.offerPlayerIds ?? body.offer_player_ids ?? [];
    const requestPlayerIdsRaw = body.requestPlayerIds ?? body.request_player_ids ?? [];

    const offerIds = Array.isArray(offerPlayerIdsRaw) ? uniq(offerPlayerIdsRaw) : [];
    const requestIds = Array.isArray(requestPlayerIdsRaw) ? uniq(requestPlayerIdsRaw) : [];

    const note = String(body.note ?? "");

    // Basic validation
    if (
      !leagueId ||
      !Number.isFinite(week) ||
      !Number.isInteger(week) ||
      week <= 0 ||
      !toTeamId ||
      offerIds.length === 0 ||
      requestIds.length === 0
    ) {
      return NextResponse.json({ ok: false, error: "Missing/invalid fields" }, { status: 400 });
    }

    // ✅ THIS was missing: define fromTeamId before you use it
    const { teamId: fromTeamId } = await requireLeagueTeam(leagueId);

    if (fromTeamId === toTeamId) {
      return NextResponse.json(
        { ok: false, error: "Cannot propose a trade to your own team" },
        { status: 400 }
      );
    }

    // Ensure target team exists in same league
    const { data: toTeamRow, error: toTeamErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("id", toTeamId)
      .eq("league_id", leagueId)
      .maybeSingle();

    if (toTeamErr) throw toTeamErr;
    if (!toTeamRow) {
      return NextResponse.json(
        { ok: false, error: "Target team not found in this league" },
        { status: 400 }
      );
    }

    const now = Date.now();

    // 1) Lazy cleanup: auto-cancel expired pending trades
    await cancelExpiredPendingTrades(leagueId, now);

    // 2) Block proposing if deadline already passed
    if (isPastWeekDeadline(week, now)) {
      return NextResponse.json(
        { ok: false, error: "Team selection deadline has passed for this week" },
        { status: 400 }
      );
    }

    // lock check
    const { data: locks, error: lockErr } = await supabaseAdmin
      .from("drop_locks")
      .select("player_id")
      .eq("league_id", leagueId)
      .gt("locked_until_ms", now);

    if (lockErr) throw lockErr;

    const lockedSet = new Set((locks ?? []).map((l: any) => String(l.player_id)));
    for (const pid of [...offerIds, ...requestIds]) {
      if (lockedSet.has(pid)) {
        return NextResponse.json({ ok: false, error: "Player is locked" }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("trade_offers")
      .insert({
        league_id: leagueId,
        week,
        from_team_id: fromTeamId,
        to_team_id: toTeamId,
        offer_player_ids: offerIds,
        request_player_ids: requestIds,
        note,
        status: "pending",
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, trade: data });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}