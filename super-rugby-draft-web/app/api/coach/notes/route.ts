// app/api/coach/notes/route.ts
// GET ?playerId -> the AI coach's notes about a player (newest first; hidden ones left out).
// Signed-in users only. (lib/coach)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireUsername, toHttpError } from "@/lib/league/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUsername();
    const playerId = String(new URL(req.url).searchParams.get("playerId") ?? "").trim();
    if (!playerId) return NextResponse.json({ ok: false, error: "Missing playerId" }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from("coach_notes")
      .select("id, season, kind, week, headline, body, next_week, verdict, trend, factors, created_at")
      .eq("player_id", playerId)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return NextResponse.json({ ok: true, notes: data ?? [] });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
