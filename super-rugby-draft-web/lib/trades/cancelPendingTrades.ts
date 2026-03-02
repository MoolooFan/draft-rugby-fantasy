// lib/trades/cancelPendingTrades.ts
import { supabaseAdmin } from "@/lib/supabase/server";

function normId(x: any) {
  return String(x ?? "").trim();
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map(normId).filter(Boolean)));
}

function extractIds(data: any): string[] {
  if (Array.isArray(data?.playerIds)) return data.playerIds.map(String);
  const ids: string[] = [];
  for (const arr of Object.values(data?.slots ?? {})) {
    for (const p of (arr as any[]) ?? []) if (p?.id) ids.push(String(p.id));
  }
  for (const p of (data?.wildcards ?? []) as any[]) if (p?.id) ids.push(String(p.id));
  return ids;
}

/**
 * Cancel any PENDING trades in a league that reference any of these players
 * (either in offer_player_ids or request_player_ids).
 *
 * This covers:
 * - "player involved in pending trade gets moved via another accepted trade"
 * - "player dropped/added via waiver or free agency"
 */
export async function cancelPendingTradesTouchingPlayers(args: {
  leagueId: string;
  playerIds: string[];
  reason: string;
}) {
  const leagueId = String(args.leagueId ?? "").trim();
  const playerIds = uniq(args.playerIds ?? []);

  if (!leagueId || playerIds.length === 0) return { cancelled: 0 };

  // PostgREST overlap operator for arrays = ov
  const { data: rows, error: selErr } = await supabaseAdmin
    .from("trade_offers")
    .select("id")
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .or(
      `offer_player_ids.ov.{${playerIds.join(",")}},request_player_ids.ov.{${playerIds.join(",")}}`
    );

  if (selErr) throw selErr;

  const ids = (rows ?? []).map((r: any) => String(r.id)).filter(Boolean);
  if (!ids.length) return { cancelled: 0 };

  const { error: updErr } = await supabaseAdmin
    .from("trade_offers")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids)
    .eq("status", "pending");

  if (updErr) throw updErr;

  return { cancelled: ids.length };
}

/**
 * Cancel any pending trades involving these teams that are now invalid:
 * - from_team no longer owns every offered player
 * - to_team no longer owns every requested player
 *
 * Call this after any roster mutation.
 */
export async function cancelInvalidPendingTradesForTeams(args: {
  leagueId: string;
  teamIds: string[];
  reason: string;
}) {
  const leagueId = String(args.leagueId ?? "").trim();
  const teamIds = uniq(args.teamIds ?? []);
  const reason = String(args.reason ?? "INVALID").slice(0, 200);

  if (!leagueId || teamIds.length === 0) return { cancelled: 0 };

  // Pull pending trades where either side is in teamIds
  const { data: offers, error: oErr } = await supabaseAdmin
    .from("trade_offers")
    .select("id, from_team_id, to_team_id, offer_player_ids, request_player_ids, status")
    .eq("league_id", leagueId)
    .eq("status", "pending")
    .or(`from_team_id.in.(${teamIds.join(",")}),to_team_id.in.(${teamIds.join(",")})`);

  if (oErr) throw oErr;
  if (!offers?.length) return { cancelled: 0 };

  // Load rosters for all teams that appear in these offers
  const allTeams = uniq(
    offers.flatMap((t: any) => [t.from_team_id, t.to_team_id].map(String))
  );

  const { data: rosterRows, error: rErr } = await supabaseAdmin
    .from("rosters")
    .select("team_id, data")
    .eq("league_id", leagueId)
    .in("team_id", allTeams);

  if (rErr) throw rErr;

  const rosterSetByTeam = new Map<string, Set<string>>();
  for (const row of rosterRows ?? []) {
    const tid = String((row as any).team_id);
    rosterSetByTeam.set(tid, new Set(extractIds((row as any).data ?? {})));
  }

  const invalidIds: string[] = [];

  for (const t of offers as any[]) {
    const fromTeamId = String(t.from_team_id);
    const toTeamId = String(t.to_team_id);

    const fromSet = rosterSetByTeam.get(fromTeamId) ?? new Set<string>();
    const toSet = rosterSetByTeam.get(toTeamId) ?? new Set<string>();

    const offered = uniq((t.offer_player_ids ?? []) as any);
    const requested = uniq((t.request_player_ids ?? []) as any);

    // invalid if any offered missing from fromTeam OR any requested missing from toTeam
    const fromOk = offered.every((pid) => fromSet.has(pid));
    const toOk = requested.every((pid) => toSet.has(pid));

    if (!fromOk || !toOk) invalidIds.push(String(t.id));
  }

  if (!invalidIds.length) return { cancelled: 0 };

  const nowIso = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
    .from("trade_offers")
    .update({
      status: "cancelled",
      updated_at: nowIso,
    })
    .in("id", invalidIds)
    .eq("status", "pending");

  if (updErr) throw updErr;

  return { cancelled: invalidIds.length };
}