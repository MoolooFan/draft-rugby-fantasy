import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  
const tradeOfferId = String(body?.tradeOfferId ?? body?.tradeId ?? "").trim();  if (!tradeOfferId) return NextResponse.json({ ok: false, error: "Missing tradeOfferId" }, { status: 400 });

  const { data: offer, error: offerErr } = await supabaseAdmin
    .from("trade_offers")
    .select("id, league_id, from_team_id, status")
    .eq("id", tradeOfferId)
    .maybeSingle<any>();

  if (offerErr) return NextResponse.json({ ok: false, error: offerErr.message }, { status: 500 });
  if (!offer) return NextResponse.json({ ok: false, error: "Trade offer not found" }, { status: 404 });

  if (String(offer.status).toLowerCase() !== "pending") {
    return NextResponse.json({ ok: false, error: `Trade is not pending (status=${offer.status})` }, { status: 400 });
  }

  // only from_team owner can cancel
  const { data: fromTeam, error: fromTeamErr } = await supabaseAdmin
    .from("teams")
    .select("id, owner_username")
    .eq("id", offer.from_team_id)
    .maybeSingle<any>();

  if (fromTeamErr) return NextResponse.json({ ok: false, error: fromTeamErr.message }, { status: 500 });
  if (!fromTeam) return NextResponse.json({ ok: false, error: "from_team not found" }, { status: 400 });

  if (norm(String(fromTeam.owner_username)) !== username) {
    return NextResponse.json({ ok: false, error: "Only the proposing team owner can cancel" }, { status: 403 });
  }

  const { data: updated, error: upErr } = await supabaseAdmin
    .from("trade_offers")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", offer.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  if (!updated) return NextResponse.json({ ok: false, error: "Trade already processed" }, { status: 409 });

  return NextResponse.json({ ok: true, offer: updated });
}