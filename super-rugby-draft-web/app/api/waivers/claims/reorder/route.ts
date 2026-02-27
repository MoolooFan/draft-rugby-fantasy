import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);
    const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.map(String) : [];

    if (!leagueId || !Number.isFinite(week) || orderedIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const { teamId } = await requireLeagueTeam(leagueId);

    const { data: claims, error } = await supabaseAdmin
      .from("waiver_claims")
      .select("id")
      .eq("league_id", leagueId)
      .eq("week", week)
      .eq("team_id", teamId)
      .eq("status", "PENDING");

    if (error) throw error;

    const existingIds = new Set((claims ?? []).map((c: any) => String(c.id)));
    const filtered = orderedIds.filter((id: string) => existingIds.has(id));
    const now = Date.now();

    for (let i = 0; i < filtered.length; i++) {
      const { error: e2 } = await supabaseAdmin
        .from("waiver_claims")
        .update({ priority: i + 1, updated_at_ms: now })
        .eq("id", filtered[i]);
      if (e2) throw e2;
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}