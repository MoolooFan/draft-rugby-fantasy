import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { isPastWeekDeadline } from "@/lib/trades/deadlines";

const norm = (s: string) => s.trim().toLowerCase();

// Team selection deadline = 1 hour before first kickoff

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const tradeOfferId = String(body?.tradeOfferId ?? body?.tradeId ?? "").trim();
  if (!tradeOfferId) return NextResponse.json({ ok: false, error: "Missing tradeOfferId" }, { status: 400 });

  const { data: offer, error: offerErr } = await supabaseAdmin
    .from("trade_offers")
    .select("id, league_id, week, to_team_id, status")
    .eq("id", tradeOfferId)
    .maybeSingle<any>();

  if (offerErr) return NextResponse.json({ ok: false, error: offerErr.message }, { status: 500 });
  if (!offer) return NextResponse.json({ ok: false, error: "Trade offer not found" }, { status: 404 });

  if (String(offer.status).toLowerCase() !== "pending") {
    return NextResponse.json({ ok: false, error: `Trade is not pending (status=${offer.status})` }, { status: 400 });
  }

  // ✅ If deadline has passed, auto-cancel instead of declining
  const now = Date.now();
  if (isPastWeekDeadline(Number(offer.week), now)) {
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

  // only to_team owner can decline
  const { data: toTeam, error: toTeamErr } = await supabaseAdmin
    .from("teams")
    .select("id, owner_username")
    .eq("id", offer.to_team_id)
    .maybeSingle<any>();

  if (toTeamErr) return NextResponse.json({ ok: false, error: toTeamErr.message }, { status: 500 });
  if (!toTeam) return NextResponse.json({ ok: false, error: "to_team not found" }, { status: 400 });

  if (norm(String(toTeam.owner_username)) !== username) {
    return NextResponse.json({ ok: false, error: "Only the receiving team owner can decline" }, { status: 403 });
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("trade_offers")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "Trade already processed" }, { status: 409 });

  return NextResponse.json({ ok: true, offer: updated });
}