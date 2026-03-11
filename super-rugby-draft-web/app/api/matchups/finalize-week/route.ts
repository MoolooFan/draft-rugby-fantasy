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
  const scoreOf = (p: Player | null) => {
    if (!p?.id) return 0;
    return Number(pointsByPlayerId[p.id] ?? 0);
  };

  const starterPosOrder: Array<{ slot: SlotId; pos: string }> = [
    { slot: "prop1", pos: "PR" },
    { slot: "hooker1", pos: "HO" },
    { slot: "prop2", pos: "PR" },
    { slot: "lock1", pos: "LK" },
    { slot: "lock2", pos: "LK" },
    { slot: "looseforward1", pos: "LF" },
    { slot: "looseforward2", pos: "LF" },
    { slot: "looseforward3", pos: "LF" },
    { slot: "halfback1", pos: "HB" },
    { slot: "flyhalf1", pos: "FH" },
    { slot: "centre1", pos: "CE" },
    { slot: "centre2", pos: "CE" },
    { slot: "outsideback1", pos: "OB" },
    { slot: "outsideback2", pos: "OB" },
    { slot: "outsideback3", pos: "OB" },
  ];

  function uniquePlayers(players: Player[]) {
    const seen = new Set<string>();
    const out: Player[] = [];
    for (const p of players) {
      const id = String(p?.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(p);
    }
    return out;
  }

  function assignStarters(players: Player[]): Lineup | null {
    const lineup: Lineup = {
      prop1: null,
      hooker1: null,
      prop2: null,
      lock1: null,
      lock2: null,
      looseforward1: null,
      looseforward2: null,
      looseforward3: null,
      halfback1: null,
      flyhalf1: null,
      centre1: null,
      centre2: null,
      outsideback1: null,
      outsideback2: null,
      outsideback3: null,
      bench1: null,
      bench2: null,
      bench3: null,
      bench4: null,
      bench5: null,
    };

    const used = new Array(players.length).fill(false);

    const orderedSlots = starterPosOrder
      .map((entry) => ({
        ...entry,
        candidates: players
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => playerCanPlayPos(p, entry.pos)),
      }))
      .sort((a, b) => a.candidates.length - b.candidates.length);

    function dfs(i: number): boolean {
      if (i >= orderedSlots.length) return true;

      const entry = orderedSlots[i];
      for (const cand of entry.candidates) {
        if (used[cand.i]) continue;
        used[cand.i] = true;
        lineup[entry.slot] = cand.p;

        if (dfs(i + 1)) return true;

        lineup[entry.slot] = null;
        used[cand.i] = false;
      }

      return false;
    }

    if (!dfs(0)) return null;
    return lineup;
  }

  const originalStarters = STARTER_SLOTS
    .map((slot) => base[slot])
    .filter(Boolean) as Player[];

  const originalBench = BENCH_SLOTS
    .map((slot) => base[slot])
    .filter(Boolean) as Player[];

  // starters who stay protected in the XV because they did NOT score 0
  const lockedStarters = originalStarters.filter((p) => scoreOf(p) !== 0);

  // starters who are allowed to drop out because they scored exactly 0
  const removableStarters = originalStarters.filter((p) => scoreOf(p) === 0);

  // bench priority is bench1 -> bench5 exactly as stored in BENCH_SLOTS
  const eligibleBench = BENCH_SLOTS
    .map((slot) => base[slot])
    .filter((p): p is Player => !!p?.id)
    .filter((p) => scoreOf(p) !== 0);

  let starterPool = uniquePlayers([...lockedStarters]);

  for (const benchPlayer of eligibleBench) {
    const trialPool = uniquePlayers([...starterPool, benchPlayer]);

    // cannot exceed 15 starters unless one zero-score starter can be displaced
    if (trialPool.length <= 15) {
      if (canFillRequiredStarterSlots(trialPool)) {
        starterPool = trialPool;
      }
      continue;
    }

    let accepted = false;

    // try removing one zero-score starter to make room
        for (const removable of removableStarters) {
      const currentPoolWithBench = uniquePlayers([...starterPool, benchPlayer]);

      const withSwap = currentPoolWithBench.filter((p) => p.id !== removable.id);

      if (withSwap.length !== 15) continue;
      if (!canFillRequiredStarterSlots(withSwap)) continue;

      starterPool = withSwap;
      accepted = true;
      break;
    }

    if (!accepted) {
      // if no valid reshuffle exists, skip this bench player
      continue;
    }
  }

  // If we still do not have 15, fill from original starters first, then original bench
  if (starterPool.length < 15) {
    for (const p of [...originalStarters, ...originalBench]) {
      if (starterPool.some((x) => x.id === p.id)) continue;
      const trial = uniquePlayers([...starterPool, p]);
      if (trial.length > 15) continue;
      if (!canFillRequiredStarterSlots(trial)) continue;
      starterPool = trial;
      if (starterPool.length === 15) break;
    }
  }

  if (starterPool.length !== 15) {
    // fallback: return unchanged if we somehow cannot build a legal XV
    return { ...base };
  }

  const rebuilt = assignStarters(starterPool);
  if (!rebuilt) {
    return { ...base };
  }

  const starterIds = new Set(
    STARTER_SLOTS
      .map((slot) => rebuilt[slot]?.id)
      .filter(Boolean) as string[]
  );

  // bench order:
  // 1) original bench players still not in starters, in bench priority order
  // 2) zero-score starters who got displaced, in original starter order
  const benchPool = [
    ...BENCH_SLOTS.map((slot) => base[slot]).filter(Boolean) as Player[],
    ...STARTER_SLOTS.map((slot) => base[slot]).filter(Boolean) as Player[],
  ].filter((p, idx, arr) => {
    return arr.findIndex((x) => x.id === p.id) === idx;
  });

  const finalBench = benchPool.filter((p) => !starterIds.has(p.id)).slice(0, 5);

  rebuilt.bench1 = finalBench[0] ?? null;
  rebuilt.bench2 = finalBench[1] ?? null;
  rebuilt.bench3 = finalBench[2] ?? null;
  rebuilt.bench4 = finalBench[3] ?? null;
  rebuilt.bench5 = finalBench[4] ?? null;

  return rebuilt;
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