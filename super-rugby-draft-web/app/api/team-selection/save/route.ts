import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week ?? 0);
    const teamId = String(body.teamId ?? "").trim();
        const lineup = body.lineup ?? null;
    const captainId = body.captainId ?? null;
    const viceId = body.viceId ?? null;

    if (!leagueId || !teamId || !week || !lineup || typeof lineup !== "object") {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const requiredSlots = [
      "prop1", "hooker1", "prop2",
      "lock1", "lock2",
      "looseforward1", "looseforward2", "looseforward3",
      "halfback1", "flyhalf1",
      "centre1", "centre2",
      "outsideback1", "outsideback2", "outsideback3",
      "bench1", "bench2", "bench3", "bench4", "bench5",
    ];

    const hasAnyPlayer = requiredSlots.some((slot) => {
      const p = (lineup as any)?.[slot];
      return !!p?.id;
    });

    if (!hasAnyPlayer) {
      return NextResponse.json(
        { ok: false, error: "Refusing to save blank lineup" },
        { status: 400 }
      );
    }

    // Players can only save their own team's lineup.
    const { teamId: myTeamId } = await requireLeagueTeam(leagueId);
    if (myTeamId !== teamId) {
      return NextResponse.json(
        { ok: false, error: "You can only pick your own team" },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin
      .from("team_selections")
      .upsert(
        {
          league_id: leagueId,
          week,
          team_id: teamId,
          lineup,
          captain_id: captainId,
          vice_id: viceId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "league_id,week,team_id" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}