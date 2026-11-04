import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

// Deletes this league's drop locks that have already expired.
// Only players in the league can trigger it.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const leagueId = String(body?.leagueId ?? "").trim();

    if (!leagueId) {
      return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    }

    await requireLeagueTeam(leagueId);

    // Always use the server's clock, so nobody can expire locks early.
    const nowMs = Date.now();

    const { data, error } = await supabaseAdmin
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
  } catch (e: unknown) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
