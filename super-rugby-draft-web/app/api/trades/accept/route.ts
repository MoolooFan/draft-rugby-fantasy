import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

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

  if (Array.isArray(rosterData)) {
    return { key: "__root_array__", ids: rosterData.map(normId).filter(Boolean) };
  }

  if (typeof rosterData === "object") {
    const candidates = ["playerIds", "players", "squad", "roster", "ids"];
    for (const k of candidates) {
      const v = (rosterData as any)[k];
      if (Array.isArray(v)) return { key: k, ids: v.map(normId).filter(Boolean) };
    }
  }

  return { key: null, ids: [] };
}

function writePlayerIds(rosterData: any, key: string | null, ids: string[]) {
  if (key === "__root_array__") return ids;
  if (!rosterData || typeof rosterData !== "object" || Array.isArray(rosterData)) {
    // if it's some unexpected shape, store a consistent object
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

    for (const pid of offered) {
      if (!fromSet.has(pid)) throw new Error(`from_team does not own offered player: ${pid}`);
    }
    for (const pid of requested) {
      if (!toSet.has(pid)) throw new Error(`to_team does not own requested player: ${pid}`);
    }

    // 9) Swap
    const nextFrom = fromExtract.ids.filter((id) => !offered.includes(id)).concat(requested);
    const nextTo = toExtract.ids.filter((id) => !requested.includes(id)).concat(offered);

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
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", offer.id);

    if (acceptErr) throw new Error("Failed to finalize trade status");

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