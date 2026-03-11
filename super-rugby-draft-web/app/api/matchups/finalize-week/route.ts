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

function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

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

    const raw = String(p.id);
    const norm = String(p.id).toLowerCase().replace(/[^a-z0-9]/g, "");

    const value =
      pointsByPlayerId[raw] ??
      pointsByPlayerId[norm] ??
      0;

    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
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

  function compareBenchPriorityVectors(a: number[], b: number[]) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      if (av !== bv) return av - bv;
    }
    return 0;
  }

  function generateCombinations<T>(
    arr: T[],
    choose: number,
    start = 0,
    current: T[] = [],
    out: T[][] = []
  ): T[][] {
    if (current.length === choose) {
      out.push([...current]);
      return out;
    }

    for (let i = start; i <= arr.length - (choose - current.length); i++) {
      current.push(arr[i]);
      generateCombinations(arr, choose, i + 1, current, out);
      current.pop();
    }

    return out;
  }

  const originalStarters = STARTER_SLOTS
    .map((slot) => base[slot])
    .filter(Boolean) as Player[];

  const originalBench = BENCH_SLOTS
    .map((slot) => base[slot])
    .filter(Boolean) as Player[];

  const lockedStarters = originalStarters.filter((p) => scoreOf(p) !== 0);
  const zeroScoreStarters = originalStarters.filter((p) => scoreOf(p) === 0);

  const eligibleBench = BENCH_SLOTS
    .map((slot) => base[slot])
    .filter((p): p is Player => !!p?.id)
    .filter((p) => scoreOf(p) !== 0);

  const candidatePool = uniquePlayers([
    ...lockedStarters,
    ...zeroScoreStarters,
    ...eligibleBench,
  ]);

  if (candidatePool.length < 15) {
    return { ...base };
  }

  const lockedIds = new Set(lockedStarters.map((p) => p.id));
  const zeroIds = new Set(zeroScoreStarters.map((p) => p.id));
  const eligibleBenchIdsInPriorityOrder = eligibleBench.map((p) => p.id);

  let bestCombo: Player[] | null = null;
  let bestBenchCount = -1;
  let bestBenchPriorityVector: number[] = [];
  let bestZeroCount = Number.POSITIVE_INFINITY;

  const allCombos = generateCombinations(candidatePool, 15);

  for (const combo of allCombos) {
    const comboIds = new Set(combo.map((p) => p.id));

    // all non-zero starters must remain in the XV
    let missingLocked = false;
    for (const id of lockedIds) {
      if (!comboIds.has(id)) {
        missingLocked = true;
        break;
      }
    }
    if (missingLocked) continue;

    if (!canFillRequiredStarterSlots(combo)) continue;

    const benchPriorityVector = eligibleBenchIdsInPriorityOrder.map((id) =>
      comboIds.has(id) ? 1 : 0
    );

    const benchCount = benchPriorityVector.reduce<number>((sum, x) => sum + x, 0);

    let zeroCount = 0;
    for (const id of comboIds) {
      if (zeroIds.has(id)) zeroCount++;
    }

    let better = false;

    if (benchCount > bestBenchCount) {
      better = true;
    } else if (benchCount === bestBenchCount) {
      const cmp = compareBenchPriorityVectors(benchPriorityVector, bestBenchPriorityVector);
      if (cmp > 0) {
        better = true;
      } else if (cmp === 0 && zeroCount < bestZeroCount) {
        better = true;
      }
    }

    if (better) {
      bestCombo = combo;
      bestBenchCount = benchCount;
      bestBenchPriorityVector = benchPriorityVector;
      bestZeroCount = zeroCount;
    }
  }

  if (!bestCombo) {
    return { ...base };
  }

  const rebuilt = assignStarters(bestCombo);
  if (!rebuilt) {
    return { ...base };
  }

  const starterIds = new Set(
    STARTER_SLOTS
      .map((slot) => rebuilt[slot]?.id)
      .filter(Boolean) as string[]
  );

  const benchPool = [
    ...BENCH_SLOTS.map((slot) => base[slot]).filter(Boolean) as Player[],
    ...STARTER_SLOTS.map((slot) => base[slot]).filter(Boolean) as Player[],
  ].filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);

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