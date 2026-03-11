import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string | null;
  posName: string;
  secondaryPosName?: string | null;
};

type SlotId =
  | "prop1" | "hooker1" | "prop2"
  | "lock1" | "lock2"
  | "looseforward1" | "looseforward2" | "looseforward3"
  | "halfback1" | "flyhalf1"
  | "centre1" | "centre2"
  | "outsideback1" | "outsideback2" | "outsideback3"
  | "bench1" | "bench2" | "bench3" | "bench4" | "bench5";

type Lineup = Record<SlotId, Player | null>;

const STARTER_SLOTS: SlotId[] = [
  "prop1", "hooker1", "prop2",
  "lock1", "lock2",
  "looseforward1", "looseforward2", "looseforward3",
  "halfback1", "flyhalf1",
  "centre1", "centre2",
  "outsideback1", "outsideback2", "outsideback3",
];

const BENCH_SLOTS: SlotId[] = ["bench1", "bench2", "bench3", "bench4", "bench5"];

function playerCanPlayPos(player: Player | null, pos: string) {
  if (!player) return false;

  const primary = String(player.posAbbrev ?? "").toUpperCase();
  const secondary = String(player.secondaryPosAbbrev ?? "").toUpperCase();

  return primary === pos || secondary === pos;
}

const REQUIRED_STARTER_POSITIONS: string[] = [
  "PR", "HO", "PR",
  "LK", "LK",
  "LF", "LF", "LF",
  "HB", "FH",
  "CE", "CE",
  "OB", "OB", "OB",
];

function canFillRequiredStarterSlots(players: Player[]) {
  const required = REQUIRED_STARTER_POSITIONS.slice();

  const candidatesByPos = new Map<string, number[]>();
  for (const pos of new Set(required)) {
    const idxs: number[] = [];
    players.forEach((pl, i) => {
      if (playerCanPlayPos(pl, pos)) idxs.push(i);
    });
    candidatesByPos.set(pos, idxs);
  }

  required.sort((a, b) => {
    const ca = candidatesByPos.get(a)?.length ?? 0;
    const cb = candidatesByPos.get(b)?.length ?? 0;
    return ca - cb;
  });

  const used = new Array(players.length).fill(false);

  function dfs(i: number): boolean {
    if (i >= required.length) return true;

    const pos = required[i];
    const cand = candidatesByPos.get(pos) ?? [];

    for (const pi of cand) {
      if (used[pi]) continue;
      used[pi] = true;
      if (dfs(i + 1)) return true;
      used[pi] = false;
    }

    return false;
  }

  return dfs(0);
}

function applyAutoSubs(
  base: Lineup,
  pointsByPlayerId: Record<string, number>
): Lineup {
  const next: Lineup = { ...base };

  const scoreOf = (p: Player | null) => {
    if (!p?.id) return 0;
    return Number(pointsByPlayerId[p.id] ?? 0);
  };

  for (const benchSlot of BENCH_SLOTS) {
    const benchPlayer = next[benchSlot];
    if (!benchPlayer?.id) continue;
    if (scoreOf(benchPlayer) <= 0) continue;

    const zeroScoreStarters = STARTER_SLOTS.filter((starterSlot) => {
      const starter = next[starterSlot];
      if (!starter?.id) return false;
      return scoreOf(starter) <= 0;
    });

    let chosenStarterSlot: SlotId | null = null;

    for (const starterSlot of zeroScoreStarters) {
      const starterPlayer = next[starterSlot];
      if (!starterPlayer?.id) continue;

      const trial = { ...next };
      trial[starterSlot] = benchPlayer;
      trial[benchSlot] = starterPlayer;

      const starterPlayers = STARTER_SLOTS
        .map((slot) => trial[slot])
        .filter(Boolean) as Player[];

      if (starterPlayers.length !== STARTER_SLOTS.length) continue;

      if (canFillRequiredStarterSlots(starterPlayers)) {
        chosenStarterSlot = starterSlot;
        break;
      }
    }

    if (!chosenStarterSlot) continue;

    const oldStarter = next[chosenStarterSlot];
    next[chosenStarterSlot] = benchPlayer;
    next[benchSlot] = oldStarter ?? null;
  }

  return next;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const leagueId = String(body.leagueId ?? "").trim();
    const week = Number(body.week);
    const pointsByPlayerId = body.pointsByPlayerId ?? {};

    if (!leagueId || !Number.isFinite(week) || week <= 0) {
      return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    }

    await requireLeagueTeam(leagueId);

    const { data: rows, error: tsErr } = await supabaseAdmin
      .from("team_selections")
      .select("team_id, lineup, captain_id, vice_id")
      .eq("league_id", leagueId)
      .eq("week", week);

    if (tsErr) throw tsErr;

    const updates = (rows ?? []).map((row: any) => {
      const lineup = (row.lineup ?? {}) as Lineup;
      const finalLineup = applyAutoSubs(lineup, pointsByPlayerId);

      return {
        league_id: leagueId,
        week,
        team_id: String(row.team_id),
        lineup: finalLineup,
        captain_id: row.captain_id ?? null,
        vice_id: row.vice_id ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    if (!updates.length) {
      return NextResponse.json({ ok: false, error: "No team selections found for that week." }, { status: 400 });
    }

    const { error: upErr } = await supabaseAdmin
      .from("team_selections")
      .upsert(updates, { onConflict: "league_id,week,team_id" });

    if (upErr) throw upErr;

    return NextResponse.json({
      ok: true,
      updatedCount: updates.length,
    });
  } catch (e: any) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}