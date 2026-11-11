// POST /api/ir  { leagueId, action: "move" | "activate" | "swap", playerId, dropPlayerId?, swapPlayerId? }
// Moves a player into or out of the team's IR spot (rules in lib/league/ir.ts). Afterwards the
// team's lineups for the weeks that aren't locked yet are fixed up; locked weeks don't change.
// IR moves aren't recorded as transactions. A player dropped to activate someone is locked
// until the next lineup deadline, the same as a free-agency drop.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { activeIdsOf, applyIrAction, irIdsOf, loadCurrentStatuses, type IrAction } from "@/lib/league/ir";
import { firstOpenWeek, loadRosterPlayers, updateLineupsAfterRosterChange } from "@/lib/league/rosterChange";
import { selectionDeadlineMs } from "@/lib/league/deadlines";
import { cancelInvalidPendingTradesForTeams, cancelPendingTradesTouchingPlayers } from "@/lib/trades/cancelPendingTrades";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const leagueId = String(body.leagueId ?? "").trim();
    const kind = String(body.action ?? "");
    const playerId = String(body.playerId ?? "").trim();
    if (!leagueId || !playerId || !["move", "activate", "swap"].includes(kind)) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }
    const action: IrAction =
      kind === "move"
        ? { action: "move", playerId }
        : kind === "activate"
          ? { action: "activate", playerId, dropPlayerId: body.dropPlayerId ? String(body.dropPlayerId).trim() : null }
          : { action: "swap", playerId, swapPlayerId: String(body.swapPlayerId ?? "").trim() };

    const { teamId } = await requireLeagueTeam(leagueId);
    const now = Date.now();

    const { data: league, error: lgErr } = await supabaseAdmin
      .from("leagues")
      .select("season, first_week")
      .eq("id", leagueId)
      .maybeSingle();
    if (lgErr) throw lgErr;
    if (!league) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
    const season = Number(league.season);

    const { data: row, error: rErr } = await supabaseAdmin
      .from("rosters")
      .select("data")
      .eq("league_id", leagueId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (rErr) throw rErr;
    const data = (row?.data ?? {}) as Record<string, unknown>;
    const active = activeIdsOf(data);
    const ir = irIdsOf(data);

    const involved = [...active, ...ir];
    const [players, statuses] = await Promise.all([
      loadRosterPlayers(supabaseAdmin, season, involved),
      loadCurrentStatuses(supabaseAdmin, season, involved, now),
    ]);

    const res = applyIrAction({ active, ir }, action, players, (id) => statuses.get(id) ?? null);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 400 });

    const { error: upErr } = await supabaseAdmin.from("rosters").upsert(
      {
        league_id: leagueId,
        team_id: teamId,
        data: { ...data, playerIds: res.active, irIds: res.ir },
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "league_id,team_id" }
    );
    if (upErr) throw upErr;

    try {
      await updateLineupsAfterRosterChange(supabaseAdmin, leagueId, new Map([[teamId, res.active]]), now);
    } catch (e) {
      console.error("[ir] lineup update failed:", e);
    }

    // IR players can't be traded, and a dropped player is gone: cancel trades that involve them.
    const gone = [res.toIr, res.dropped].filter((x): x is string => !!x);
    if (gone.length) {
      await cancelPendingTradesTouchingPlayers({ leagueId, playerIds: gone, reason: "PLAYER_MOVED_TO_IR_OR_DROPPED" });
    }
    await cancelInvalidPendingTradesForTeams({ leagueId, teamIds: [teamId], reason: "ROSTER_CHANGED_BY_IR" });

    if (res.dropped) {
      const week = firstOpenWeek(season, league.first_week, now);
      const deadline = week != null ? selectionDeadlineMs(season, week) : null;
      const { error: delErr } = await supabaseAdmin
        .from("drop_locks")
        .delete()
        .eq("league_id", leagueId)
        .eq("player_id", res.dropped);
      if (delErr) throw delErr;
      const { error: insErr } = await supabaseAdmin.from("drop_locks").insert({
        league_id: leagueId,
        week: week ?? 0,
        player_id: res.dropped,
        locked_until_ms: deadline ?? now + 24 * 60 * 60 * 1000,
        dropped_by_team_id: teamId,
        dropped_at_ms: now,
        reason: "IR_ACTIVATION_DROP",
      });
      if (insErr) throw insErr;
    }

    return NextResponse.json({ ok: true, playerIds: res.active, irIds: res.ir, dropped: res.dropped });
  } catch (e: unknown) {
    console.error("[ir][POST] ERROR:", e);
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
