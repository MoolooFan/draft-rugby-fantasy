import { NextResponse } from "next/server";
import playersData from "@/data/players.json";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getExternalPlayerId } from "@/lib/players/externalIdMap";
import { fetchExternalPlayerStatsByExternalId } from "@/lib/players/externalStats";

const SEASON = 2026;

function getInternalPlayerId(p: any): string | null {
  const id = String(p?.id ?? "").trim();
  return id || null;
}

export async function POST() {
  try {
    const players = Array.isArray(playersData) ? playersData : [];

    const results: Array<{
      internalId: string;
      externalId: number | null;
      imported: number;
      skipped: boolean;
      error?: string;
    }> = [];

    for (const p of players) {
      const internalId = getInternalPlayerId(p);
      if (!internalId) continue;

      const externalId = getExternalPlayerId(internalId);

      if (externalId == null) {
        results.push({
          internalId,
          externalId: null,
          imported: 0,
          skipped: true,
        });
        continue;
      }

      try {
        const rows = await fetchExternalPlayerStatsByExternalId(externalId);

        if (!rows.length) {
          results.push({
            internalId,
            externalId,
            imported: 0,
            skipped: false,
          });
          continue;
        }

        const upserts = rows.map((r) => ({
          season: SEASON,
          internal_player_id: internalId,
          external_player_id: externalId,
          round: r.round,
          points: r.points,
          raw_json: r.raw ?? null,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabaseAdmin
          .from("player_round_stats")
          .upsert(upserts, {
            onConflict: "season,internal_player_id,round",
          });

        if (error) throw error;

        results.push({
          internalId,
          externalId,
          imported: upserts.length,
          skipped: false,
        });
      } catch (err: any) {
        results.push({
          internalId,
          externalId,
          imported: 0,
          skipped: false,
          error: err?.message ?? "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      results,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Import failed" },
      { status: 500 }
    );
  }
}