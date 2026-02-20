import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const leagueId = body?.leagueId;
  const teamId = body?.teamId;
  const data = body?.data;

  if (!leagueId || !teamId || !data) {
    return NextResponse.json(
      { ok: false, error: "Missing leagueId/teamId/data" },
      { status: 400 }
    );
  }

  const { error } = await supabaseServer
    .from("rosters")
    .upsert({
      league_id: leagueId,
      team_id: teamId,
      data,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}