import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { EXTERNAL_PLAYER_ID_MAP } from "@/lib/players/externalIdMap";
import { fetchExternalPlayerStatsByExternalId } from "@/lib/players/externalStats";

type SyncFailure = {
  internalId: string;
  externalId: number;
  error: string;
};

async function runSync(season: number) {
  const upserts: any[] = [];
  const failures: SyncFailure[] = [];

  for (const [internalId, externalId] of Object.entries(EXTERNAL_PLAYER_ID_MAP)) {
    try {
      const rows = await fetchExternalPlayerStatsByExternalId(externalId);

      for (const row of rows) {
        upserts.push({
          season,
          internal_player_id: internalId,
          external_player_id: externalId,
          round: row.round,
          points: row.points,
          raw_json: row.raw ?? {},
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      failures.push({
        internalId,
        externalId,
        error: e?.message ?? "Unknown error",
      });
    }
  }

  if (upserts.length) {
    const { error } = await supabaseAdmin
      .from("player_round_stats")
      .upsert(upserts, {
        onConflict: "season,internal_player_id,round",
      });

    if (error) throw error;
  }

  return {
    ok: true,
    insertedOrUpdated: upserts.length,
    failedPlayers: failures.length,
    failures,
  };
}

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const season = Number(body?.season ?? 2026);

    const result = await runSync(season);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to sync external player stats" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const season = Number(url.searchParams.get("season") ?? 2026);

    const result = await runSync(season);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to sync external player stats" },
      { status: 500 }
    );
  }
}