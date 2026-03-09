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

type PosGroup = "PROP" | "HOOKER" | "LOCK" | "LOOSE" | "HB" | "FH" | "CENTRE" | "OB" | "WC";

const SLOT_GROUP: Record<SlotId, PosGroup> = {
  prop1: "PROP",
  hooker1: "HOOKER",
  prop2: "PROP",
  lock1: "LOCK",
  lock2: "LOCK",
  looseforward1: "LOOSE",
  looseforward2: "LOOSE",
  looseforward3: "LOOSE",
  halfback1: "HB",
  flyhalf1: "FH",
  centre1: "CENTRE",
  centre2: "CENTRE",
  outsideback1: "OB",
  outsideback2: "OB",
  outsideback3: "OB",
  bench1: "WC",
  bench2: "WC",
  bench3: "WC",
  bench4: "WC",
  bench5: "WC",
};

const STARTER_SLOTS: SlotId[] = [
  "prop1","hooker1","prop2",
  "lock1","lock2",
  "looseforward1","looseforward2","looseforward3",
  "halfback1","flyhalf1",
  "centre1","centre2",
  "outsideback1","outsideback2","outsideback3",
];

const BENCH_SLOTS: SlotId[] = ["bench1","bench2","bench3","bench4","bench5"];

function canPlayerFitGroup(player: Player, group: PosGroup) {
  if (group === "WC") return true;

  const primary = String(player.posAbbrev ?? "").toUpperCase();
  const secondary = String(player.secondaryPosAbbrev ?? "").toUpperCase();
  const either = (fn: (p: string) => boolean) => fn(primary) || fn(secondary);

  if (group === "PROP") return either((p) => p.includes("PROP") || p === "PR");
  if (group === "HOOKER") return either((p) => p.includes("HOOK") || p === "HO");
  if (group === "LOCK") return either((p) => p.includes("LOCK") || p === "LK");
  if (group === "LOOSE") return either((p) => p.includes("LOOSE") || p === "LF");
  if (group === "HB") return either((p) => p.includes("HALF") || p === "HB");
  if (group === "FH") return either((p) => p.includes("FLY") || p === "FH");
  if (group === "CENTRE") return either((p) => p.includes("CENTRE") || p === "CE");
  if (group === "OB") return either((p) => p.includes("OUT") || p.includes("BACK") || p === "OB");

  return false;
}

function applyAutoSubs(
  base: Lineup,
  pointsByPlayerId: Record<string, number>
): Lineup {
  const next: Lineup = { ...base };

  const startersNeedingHelp = () =>
    STARTER_SLOTS.filter((sid) => {
      const p = next[sid];
      if (!p?.id) return false;
      return (pointsByPlayerId[p.id] ?? 0) <= 0;
    });

  for (const benchSlot of BENCH_SLOTS) {
    const benchPlayer = next[benchSlot];
    if (!benchPlayer?.id) continue;

    if ((pointsByPlayerId[benchPlayer.id] ?? 0) <= 0) continue;

    const candidates = startersNeedingHelp();
    const targetStarter = candidates.find((starterSlot) => {
      const group = SLOT_GROUP[starterSlot];
      return canPlayerFitGroup(benchPlayer, group);
    });

    if (!targetStarter) continue;

    const starterPlayer = next[targetStarter];
    next[targetStarter] = benchPlayer;
    next[benchSlot] = starterPlayer ?? null;
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