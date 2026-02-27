import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();
  const weekStr = String(searchParams.get("week") ?? "").trim();
  const week = weekStr ? Number(weekStr) : null;

  if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });

  try {
    await requireLeagueTeam(leagueId);

    const tradesQ = supabaseAdmin.from("trade_offers").select("*").eq("league_id", leagueId);
    const claimsQ = supabaseAdmin.from("waiver_claims").select("*").eq("league_id", leagueId);
    const freesQ = supabaseAdmin.from("free_agent_transfers").select("*").eq("league_id", leagueId);
    const locksQ = supabaseAdmin.from("drop_locks").select("*").eq("league_id", leagueId);

    if (week !== null && Number.isFinite(week)) {
      tradesQ.eq("week", week);
      claimsQ.eq("week", week);
      freesQ.eq("week", week);
      locksQ.eq("week", week);
    }

    const [trades, claims, frees, locks] = await Promise.all([
      tradesQ.order("created_at_ms", { ascending: false }),
      claimsQ.order("priority", { ascending: true }),
      freesQ.order("created_at_ms", { ascending: false }),
      locksQ.order("locked_until_ms", { ascending: false }),
    ]);

    if (trades.error) throw trades.error;
    if (claims.error) throw claims.error;
    if (frees.error) throw frees.error;
    if (locks.error) throw locks.error;

    return NextResponse.json({
      ok: true,
      trades: trades.data ?? [],
      claims: claims.data ?? [],
      freeAgentTransfers: frees.data ?? [],
      dropLocks: locks.data ?? [],
    });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}