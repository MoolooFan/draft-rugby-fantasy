import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { RESULT_STATS, STATS } from "@/lib/scoring";
import { addMatchResults } from "@/lib/results/matchResults";
import { fantasyWeekForRealRound, getSeason, SEASONS } from "@/lib/season";
import { currentSeasonYear } from "@/lib/season";
import { demo } from "@/lib/demo";
import { loadRoundRoles, roleKey } from "@/lib/status/roles";

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRawJsonToLegacyRow(row: any) {
  const raw = row?.raw_json ?? {};
  const stats = raw?.stats ?? {};
  const realRound = toNum(raw.roundId ?? row.round);
  const season = SEASONS[Number(row.season)] ? getSeason(Number(row.season)) : null;

  return {
    season: row.season,
    // the FANTASY week (2027: rounds 10 and 11 are both week 10); realRound is Super Rugby's
    round: season ? fantasyWeekForRealRound(season, realRound) ?? realRound : realRound,
    realRound,

    // keep your app keyed by INTERNAL player id
    playerId: row.internal_player_id,
    internalPlayerId: row.internal_player_id,
    externalPlayerId: row.external_player_id,

    // raw stat COUNTS under the page-style headers ("Minutes played", "Tries", ...)
    ...Object.fromEntries(STATS.map((st) => [st.header, toNum(stats[st.code])])),
    // team win / draw in games he played ("Team win": 1), for leagues that score them
    ...Object.fromEntries(RESULT_STATS.filter((st) => toNum(stats[st.code])).map((st) => [st.header, toNum(stats[st.code])])),

    // useful extras
    points: toNum(raw.points ?? row.points),
    avg: toNum(raw.avg),
    // (the raw playfantasyrugby JSON isn't sent: nothing in the browser uses it, and it doubled the size)
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = Number(searchParams.get("season") ?? currentSeasonYear());
    const round = Number(searchParams.get("round") ?? 0);

    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
      let query = supabaseAdmin
        .from("player_round_stats")
        .select("season, internal_player_id, external_player_id, round, points, raw_json")
        .eq("season", season);

      if (Number.isFinite(round) && round > 0) {
        query = query.eq("round", round);
      }

      const { data, error } = await query
        .order("internal_player_id", { ascending: true })
        .order("round", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const batch = data ?? [];
      allRows = allRows.concat(batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    const [, roles] = await Promise.all([addMatchResults(supabaseAdmin, season, allRows), loadRoundRoles(supabaseAdmin, season)]);
    // role: what the team list said that round (starting / bench / null), for the player card's
    // Starts (lib/status/roles.ts)
    let rows = allRows.map((r) => {
      const row = mapRawJsonToLegacyRow(r);
      return { ...row, role: roles.get(roleKey(row.playerId, row.round)) ?? null };
    });
    // demo site: nothing after the frozen moment's last round (lib/demo.ts)
    const d = demo();
    if (d && season === d.season) rows = rows.filter((r) => Number(r.realRound) <= d.lastRealRound);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load round stats" },
      { status: 500 }
    );
  }
}