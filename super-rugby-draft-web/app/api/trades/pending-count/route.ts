import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/session/server";

export async function GET(req: Request) {
  const username = await getServerUsername();
  if (!username) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();
  const teamId = String(searchParams.get("teamId") ?? "").trim();

  if (!leagueId || !teamId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/teamId" }, { status: 400 });
  }

  // Count pending offers RECEIVED by this team
  // Assumes columns: league_id, to_team_id, status
  const { count, error } = await supabaseAdmin
    .from("trade_offers")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId)
    .eq("to_team_id", teamId)
    .in("status", ["pending", "PENDING"]);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: count ?? 0 });
}