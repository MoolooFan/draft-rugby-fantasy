import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { STATS } from "@/lib/scoring";

function toNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRawJsonToLegacyRow(row: any) {
  const raw = row?.raw_json ?? {};
  const stats = raw?.stats ?? {};

  return {
    season: row.season,
    round: toNum(raw.roundId ?? row.round),

    // keep your app keyed by INTERNAL player id
    playerId: row.internal_player_id,
    internalPlayerId: row.internal_player_id,
    externalPlayerId: row.external_player_id,

    // raw stat COUNTS under the page-style headers ("Minutes played", "Tries", ...)
    ...Object.fromEntries(STATS.map((st) => [st.header, toNum(stats[st.code])])),

    // useful extras
    points: toNum(raw.points ?? row.points),
    avg: toNum(raw.avg),
    raw_json: raw,
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const season = Number(searchParams.get("season") ?? 2026);
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

    const rows = allRows.map(mapRawJsonToLegacyRow);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to load round stats" },
      { status: 500 }
    );
  }
}