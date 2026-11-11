// GET /api/players/history?leagueId=...&playerId=...
// A player's moves in this league, newest first (player card > Transactions tab, C3), with the
// team and player names the tab needs. League members only.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { playerHistory } from "@/lib/league/playerHistory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();
    const playerId = String(searchParams.get("playerId") ?? "").trim();
    if (!leagueId || !playerId) return NextResponse.json({ ok: false, error: "Missing leagueId/playerId" }, { status: 400 });
    await requireLeagueTeam(leagueId);
    // player ids have dots and apostrophes (e.g. "T.Tele'a"): quote them inside filters
    const q = `"${playerId.replace(/["\\]/g, "")}"`;

    const [lg, teams, picks, transfers, claims, trades] = await Promise.all([
      supabaseAdmin.from("leagues").select("season").eq("id", leagueId).maybeSingle(),
      supabaseAdmin.from("teams").select("id, name").eq("league_id", leagueId),
      supabaseAdmin.from("draft_picks").select("team_id, pick_number, round, created_at").eq("league_id", leagueId).eq("player_id", playerId),
      supabaseAdmin
        .from("free_agent_transfers")
        .select("team_id, add_player_id, drop_player_id, status, created_at_ms")
        .eq("league_id", leagueId)
        .or(`add_player_id.eq.${q},drop_player_id.eq.${q}`),
      supabaseAdmin
        .from("waiver_claims")
        .select("team_id, add_player_id, drop_player_id, status, processed_at_ms, updated_at_ms")
        .eq("league_id", leagueId)
        .or(`add_player_id.eq.${q},drop_player_id.eq.${q}`),
      supabaseAdmin
        .from("trade_offers")
        .select("from_team_id, to_team_id, offer_player_ids, request_player_ids, status, updated_at")
        .eq("league_id", leagueId)
        .eq("status", "accepted")
        .or(`offer_player_ids.cs.{${q}},request_player_ids.cs.{${q}}`),
    ]);
    for (const r of [lg, teams, picks, transfers, claims, trades]) if (r.error) throw r.error;

    const events = playerHistory(playerId, {
      picks: picks.data ?? [],
      transfers: transfers.data ?? [],
      claims: claims.data ?? [],
      trades: trades.data ?? [],
    });

    // names of the other players mentioned ("dropped X")
    const otherIds = [
      ...new Set(
        events
          .flatMap((e) => ("droppedId" in e ? [e.droppedId] : "forId" in e ? [e.forId] : []))
          .filter((x): x is string => !!x)
      ),
    ];
    const playerNames: Record<string, string> = {};
    if (otherIds.length) {
      const { data, error } = await supabaseAdmin
        .from("players")
        .select("id, first_name, last_name")
        .eq("season", Number(lg.data?.season))
        .in("id", otherIds);
      if (error) throw error;
      for (const p of data ?? []) playerNames[p.id] = `${String(p.first_name ?? "").slice(0, 1)}. ${p.last_name}`;
    }
    const teamNames = Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name]));

    return NextResponse.json({ ok: true, events, teamNames, playerNames });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
