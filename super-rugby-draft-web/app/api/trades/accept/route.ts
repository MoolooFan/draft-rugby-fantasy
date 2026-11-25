import { NextResponse } from "next/server";
import { loadSquadFormat } from "@/lib/league/squadServer";
import { postTradeResult } from "@/lib/chat/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { cancelPendingTradesTouchingPlayers, cancelInvalidPendingTradesForTeams } from "@/lib/trades/cancelPendingTrades";
import { isPastWeekDeadline } from "@/lib/trades/deadlines";
import { loadRosterPlayers, rosterProblem, updateLineupsAfterRosterChange } from "@/lib/league/rosterChange";
import { healthyIrBlock, irIdsOf } from "@/lib/league/ir";
import { loadTradeBlock, tradeBlockedMessage } from "@/lib/league/eliminated";

type TradeOfferRow = {
  id: string;
  league_id: string;
  week: number;
  from_team_id: string;
  to_team_id: string;
    offer_player_ids: string[];
  request_player_ids: string[];
  status: string;
};

function normId(x: any) {
  return String(x ?? "").trim();
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map(normId).filter(Boolean)));
}

/**
 * Roster data is stored as JSON in rosters.data.
 * This tries to locate the array of player IDs in common shapes:
 * - { playerIds: [...] }
 * - { players: [...] }
 * - { squad: [...] }
 * - { roster: [...] }
 * - [ ... ]  (data itself is an array)
 */
function extractPlayerIds(rosterData: any): { key: string | null; ids: string[] } {
  if (!rosterData) return { key: null, ids: [] };

  // If rosterData itself is an array of ids
  if (Array.isArray(rosterData)) {
    return { key: "__root_array__", ids: rosterData.map(normId).filter(Boolean) };
  }

  if (typeof rosterData === "object") {
    // 1) direct id arrays
    const candidates = ["playerIds", "players", "squad", "roster", "ids"];
    for (const k of candidates) {
      const v = (rosterData as any)[k];
      if (Array.isArray(v)) return { key: k, ids: v.map(normId).filter(Boolean) };
    }

    // 2) slots + wildcards (your app shape)
    const ids: string[] = [];
    const slots = (rosterData as any).slots ?? {};
    if (slots && typeof slots === "object") {
      for (const arr of Object.values(slots)) {
        for (const p of (arr as any[]) ?? []) {
          if (p?.id) ids.push(normId(p.id));
        }
      }
    }
    for (const p of ((rosterData as any).wildcards ?? []) as any[]) {
      if (p?.id) ids.push(normId(p.id));
    }
    const clean = ids.filter(Boolean);
    if (clean.length) return { key: "__derived_from_slots__", ids: clean };
  }

  return { key: null, ids: [] };
}

function writePlayerIds(rosterData: any, key: string | null, ids: string[]) {
  if (key === "__root_array__") return ids;

  // If the roster was derived from slots/wildcards, DON'T try to rewrite slots (server doesn't have player objects).
  // Instead, store/overwrite a canonical playerIds array alongside whatever else is there.
  if (key === "__derived_from_slots__") {
    return { ...(rosterData ?? {}), playerIds: ids };
  }

  if (!rosterData || typeof rosterData !== "object" || Array.isArray(rosterData)) {
    return { playerIds: ids };
  }
  if (!key) return { ...(rosterData as any), playerIds: ids };
  return { ...(rosterData as any), [key]: ids };
}

export async function POST(req: Request) {
  // 1) Must be logged in
  const username = await getServerUsername();
  if (!username) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  // 2) Read payload
  const body = await req.json().catch(() => null);
  const tradeOfferId = String(body?.tradeOfferId ?? "").trim();

  if (!tradeOfferId) {
    return NextResponse.json({ ok: false, error: "Missing tradeOfferId" }, { status: 400 });
  }

  // 3) Load offer
  const { data: offer, error: offerErr } = await supabaseAdmin
    .from("trade_offers")
    .select("id, league_id, week, from_team_id, to_team_id, offer_player_ids, request_player_ids, status")
    .eq("id", tradeOfferId)
    .single<TradeOfferRow>();

  if (offerErr || !offer) {
    return NextResponse.json({ ok: false, error: "Trade offer not found" }, { status: 404 });
  }

  // 4) Only pending offers can be accepted
  const status = String(offer.status ?? "").toLowerCase();
  if (status !== "pending") {
    return NextResponse.json({ ok: false, error: `Trade is not pending (status=${offer.status})` }, { status: 400 });
  }

  // 4b) Block if selection deadline passed for this trade week
const now = Date.now();
if (isPastWeekDeadline(offer.week, now)) {
  // Auto-cancel it
  await supabaseAdmin
    .from("trade_offers")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "pending");

  return NextResponse.json(
    { ok: false, error: "Trade expired (selection deadline passed)" },
    { status: 400 }
  );
}

  // 5) Verify current user owns the *to_team*
  const { data: toTeam, error: toTeamErr } = await supabaseAdmin
    .from("teams")
    .select("id, owner_username")
    .eq("id", offer.to_team_id)
    .single<any>();

  if (toTeamErr || !toTeam) {
    return NextResponse.json({ ok: false, error: "to_team not found" }, { status: 400 });
  }

  const owner = String(toTeam.owner_username ?? "").toLowerCase();
  if (owner !== String(username).toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Only the receiving team owner can accept this trade" }, { status: 403 });
  }

  // 6) Lock offer by moving it to "processing" (prevents double-accept)
  const { data: processingOffer, error: lockErr } = await supabaseAdmin
    .from("trade_offers")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (lockErr) {
    return NextResponse.json({ ok: false, error: "Failed to lock trade offer" }, { status: 500 });
  }
  if (!processingOffer) {
    return NextResponse.json({ ok: false, error: "Trade was already processed by someone else" }, { status: 409 });
  }

  try {
    const offered = uniq((offer.offer_player_ids ?? []) as any);
const requested = uniq((offer.request_player_ids ?? []) as any);

    if (offered.length === 0 || requested.length === 0) {
      throw new Error("Trade offer missing offered/requested players");
    }

    // 7) Load both rosters
    const { data: fromRoster, error: fromErr } = await supabaseAdmin
      .from("rosters")
      .select("league_id, team_id, data")
      .eq("league_id", offer.league_id)
      .eq("team_id", offer.from_team_id)
      .maybeSingle<any>();

    const { data: toRoster, error: toErr } = await supabaseAdmin
      .from("rosters")
      .select("league_id, team_id, data")
      .eq("league_id", offer.league_id)
      .eq("team_id", offer.to_team_id)
      .maybeSingle<any>();

    if (fromErr || !fromRoster) throw new Error("from_team roster not found");
    if (toErr || !toRoster) throw new Error("to_team roster not found");

    const fromExtract = extractPlayerIds(fromRoster.data);
    const toExtract = extractPlayerIds(toRoster.data);

    // 8) Validate players are actually on the correct rosters
    const fromSet = new Set(fromExtract.ids);
    const toSet = new Set(toExtract.ids);

    const fromIr = irIdsOf(fromRoster.data);
    const toIr = irIdsOf(toRoster.data);
    for (const pid of offered) {
      if (fromIr.includes(pid)) throw new Error(`${pid} is in IR and can't be traded`);
      if (!fromSet.has(pid)) throw new Error(`from_team does not own offered player: ${pid}`);
    }
    for (const pid of requested) {
      if (toIr.includes(pid)) throw new Error(`${pid} is in IR and can't be traded`);
      if (!toSet.has(pid)) throw new Error(`to_team does not own requested player: ${pid}`);
    }

    // 8b) A team whose IR player is fit again can't trade until he's activated.
    const { data: lg, error: lgErr } = await supabaseAdmin.from("leagues").select("season").eq("id", offer.league_id).maybeSingle();
    if (lgErr) throw new Error("League not found");
    const season = Number(lg?.season);
    const myIrBlock = await healthyIrBlock(supabaseAdmin, season, toRoster.data, { nowMs: now });
    if (myIrBlock) throw new Error(myIrBlock);
    const theirIrBlock = await healthyIrBlock(supabaseAdmin, season, fromRoster.data, { mine: false, nowMs: now });
    if (theirIrBlock) throw new Error(theirIrBlock);

    // 8c) League rule: eliminated teams can't trade (a team knocked out since the offer was made)
    const blocked = tradeBlockedMessage(await loadTradeBlock(supabaseAdmin, offer.league_id), offer.to_team_id, offer.from_team_id);
    if (blocked) throw new Error(blocked);

    // 9) Swap
    const nextFrom = fromExtract.ids.filter((id) => !offered.includes(id)).concat(requested);
    const nextTo = toExtract.ids.filter((id) => !requested.includes(id)).concat(offered);

    // 9b) Both teams must keep the position rules (so each can always field a full XV)
    const rosterPlayers = await loadRosterPlayers(supabaseAdmin, season, [...nextFrom, ...nextTo]);
    const format = await loadSquadFormat(supabaseAdmin, offer.league_id);
    const toProblem = rosterProblem(uniq(nextTo), rosterPlayers, toExtract.ids, format);
    if (toProblem) throw new Error(`Your team: ${toProblem}`);
    const fromProblem = rosterProblem(uniq(nextFrom), rosterPlayers, fromExtract.ids, format);
    if (fromProblem) throw new Error(`The other team: ${fromProblem}`);

    const nextFromData = writePlayerIds(fromRoster.data, fromExtract.key, uniq(nextFrom));
    const nextToData = writePlayerIds(toRoster.data, toExtract.key, uniq(nextTo));

    // 10) Save both rosters
    const { error: upFromErr } = await supabaseAdmin
      .from("rosters")
      .update({ data: nextFromData, updated_at: new Date().toISOString() })
      .eq("league_id", offer.league_id)
      .eq("team_id", offer.from_team_id);

    if (upFromErr) throw new Error("Failed to update from_team roster");

    const { error: upToErr } = await supabaseAdmin
      .from("rosters")
      .update({ data: nextToData, updated_at: new Date().toISOString() })
      .eq("league_id", offer.league_id)
      .eq("team_id", offer.to_team_id);

    if (upToErr) throw new Error("Failed to update to_team roster");

    // 11) Mark accepted
    const { error: acceptErr } = await supabaseAdmin
  .from("trade_offers")
  .update({ status: "accepted", accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  .eq("id", offer.id);

if (acceptErr) throw new Error("Failed to finalize trade status");

// New players take the spots of the players traded away (or the lineups are fixed up); captains too.
// (After the trade is final: a problem here mustn't put the trade back to pending.)
try {
  await updateLineupsAfterRosterChange(
    supabaseAdmin,
    offer.league_id,
    new Map([
      [offer.from_team_id, uniq(nextFrom)],
      [offer.to_team_id, uniq(nextTo)],
    ]),
    now
  );
} catch (e) {
  console.error("[trades/accept] lineup update failed:", e);
}

// Cancel other pending trades that mention any moved player
const movedPlayerIds = uniq([...offered, ...requested]);
await cancelPendingTradesTouchingPlayers({
  leagueId: offer.league_id,
  playerIds: movedPlayerIds,
  reason: "PLAYER_MOVED_BY_ACCEPTED_TRADE",
});

// Also cancel any pending trades for these teams that are now invalid
await cancelInvalidPendingTradesForTeams({
  leagueId: offer.league_id,
  teamIds: [offer.from_team_id, offer.to_team_id],
  reason: "ROSTER_CHANGED_BY_ACCEPTED_TRADE",
});

// chat: a note in the two teams' DM, and the trade in the league chat
await postTradeResult(supabaseAdmin, tradeOfferId, "accepted");

return NextResponse.json({ ok: true });

  } catch (e: any) {
    // Best-effort: revert status back to pending if something failed
    await supabaseAdmin
      .from("trade_offers")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "processing");

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Trade accept failed" },
      { status: 400 }
    );
  }
}