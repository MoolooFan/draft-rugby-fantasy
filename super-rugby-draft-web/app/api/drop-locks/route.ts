import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const leagueId = String(searchParams.get("leagueId") ?? "").trim();

    if (!leagueId) {
      return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    }

    await requireLeagueTeam(leagueId);

    const { data, error } = await supabaseAdmin
      .from("drop_locks")
      .select("*")
      .eq("league_id", leagueId)
      .order("locked_until_ms", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}