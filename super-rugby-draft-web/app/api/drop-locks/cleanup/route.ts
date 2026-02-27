import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const leagueId = String(body?.leagueId ?? "").trim();
    const nowMs = Number(body?.nowMs ?? Date.now());

    if (!leagueId) {
      return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    }

    // Admin client (bypasses RLS)
const supabase = supabaseAdmin;

    // Delete expired locks for this league
    const { data, error } = await supabase
      .from("drop_locks")
      .delete()
      .eq("league_id", leagueId)
      .lte("locked_until_ms", nowMs)
      .select("id");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedCount: Array.isArray(data) ? data.length : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}