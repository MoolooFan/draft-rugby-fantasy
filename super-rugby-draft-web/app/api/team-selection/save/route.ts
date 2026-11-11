import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { selectionDeadlineMs } from "@/lib/league/deadlines";
import { loadPickRank, loadRosterPlayers } from "@/lib/league/rosterChange";
import { fixCaptains, updateLineup } from "@/lib/league/lineup";
import { activeIdsOf } from "@/lib/league/ir";
import type { Lineup } from "@/lib/scoring/week";

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

    // Lineups lock at the week's deadline (1 hour before its first kickoff), on the server's clock.
    const { data: league, error: leagueErr } = await supabaseAdmin
      .from("leagues")
      .select("season")
      .eq("id", leagueId)
      .maybeSingle();
    if (leagueErr) throw leagueErr;

    const deadline = selectionDeadlineMs(Number(league?.season), week);
    if (deadline == null) {
      return NextResponse.json({ ok: false, error: "That week has no fixtures" }, { status: 400 });
    }
    if (Date.now() >= deadline) {
      return NextResponse.json(
        { ok: false, error: "Lineups for this week are locked (the deadline has passed)" },
        { status: 403 }
      );
    }

    // Only the team's own players, in spots they can play (a valid lineup is saved as it is), and
    // the captain / vice-captain must be starting (moved automatically if not).
    const { data: rosterRow, error: rErr } = await supabaseAdmin
      .from("rosters")
      .select("data")
      .eq("league_id", leagueId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (rErr) throw rErr;
    const rosterIds: string[] = activeIdsOf(rosterRow?.data); // not IR
    const players = await loadRosterPlayers(supabaseAdmin, Number(league?.season), rosterIds);
    const pickRank = await loadPickRank(supabaseAdmin, leagueId, players);
    const roster = rosterIds
      .map((id) => players.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .sort((a, b) => pickRank(a.id) - pickRank(b.id));
    // If the team can't fill every starting spot (only possible while a player is in IR and the
    // team is short of his position) the lineup is still saved, with that spot empty.
    const fixed = updateLineup(lineup as Lineup, roster);
    const caps = fixCaptains(fixed.lineup, captainId, viceId, pickRank);

    const { error } = await supabaseAdmin
      .from("team_selections")
      .upsert(
        {
          league_id: leagueId,
          week,
          team_id: teamId,
          lineup: fixed.lineup,
          captain_id: caps.captainId,
          vice_id: caps.viceId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "league_id,week,team_id" }
      );

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      lineup: fixed.lineup,
      captainId: caps.captainId,
      viceId: caps.viceId,
      moved: fixed.ok ? fixed.moved : [],
      warning: fixed.ok ? null : "Your team can't fill every starting spot - add a player for the empty spot",
    });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}