import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/session/server"; // or your server session helper

export async function GET(req: Request) {
  const username = await getServerUsername(); // must return string or null
  if (!username) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();
  if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("watchlist")
    .select("player_id")
    .eq("league_id", leagueId)
    .eq("user_id", username);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    data: (data ?? []).map((r) => r.player_id),
  });
}

export async function POST(req: Request) {
  const username = await getServerUsername();
  if (!username) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();
  const playerId = String(body?.playerId ?? "").trim();

  if (!leagueId || !playerId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/playerId" }, { status: 400 });
  }

  // Upsert-like behavior via unique index
  const { error } = await supabaseAdmin
    .from("watchlist")
    .insert({ league_id: leagueId, user_id: username, player_id: playerId })
    .select()
    .maybeSingle();

  // If it's duplicate, ignore (unique constraint)
  if (error && !String(error.message).toLowerCase().includes("duplicate")) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const username = await getServerUsername();
  if (!username) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();
  const playerId = String(searchParams.get("playerId") ?? "").trim();

  if (!leagueId || !playerId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/playerId" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("watchlist")
    .delete()
    .eq("league_id", leagueId)
    .eq("user_id", username)
    .eq("player_id", playerId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}