import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { EXTERNAL_PLAYER_ID_MAP } from "@/lib/players/externalIdMap";
import { fetchExternalPlayers } from "@/lib/players/externalPlayers";

type SyncFailure = {
  internalId: string;
  externalId: number;
  error: string;
};

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function runImageSync(season: number) {
  const externalPlayers = await fetchExternalPlayers();

  const byExternalId = new Map<number, any>();
  for (const row of externalPlayers) {
    const externalId = Number(row?.id);
    if (Number.isFinite(externalId) && externalId > 0) {
      byExternalId.set(externalId, row);
    }
  }

  const failures: SyncFailure[] = [];
  let updatedPlayers = 0;

  for (const [internalId, externalId] of Object.entries(EXTERNAL_PLAYER_ID_MAP)) {
    try {
      const externalPlayer = byExternalId.get(Number(externalId));
      if (!externalPlayer) {
        failures.push({
          internalId,
          externalId,
          error: "External player not found in players.json",
        });
        continue;
      }

      const imageProfile =
        typeof externalPlayer.imageProfile === "string" && externalPlayer.imageProfile.trim()
          ? externalPlayer.imageProfile.trim()
          : null;

      const { error } = await supabaseAdmin
        .from("player_round_stats")
        .update({
          image_profile: imageProfile,
          updated_at: new Date().toISOString(),
        })
        .eq("season", season)
        .eq("internal_player_id", internalId);

      if (error) throw error;

      updatedPlayers++;
    } catch (e: any) {
      failures.push({
        internalId,
        externalId,
        error: e?.message ?? "Unknown error",
      });
    }
  }

  return {
    ok: true,
    updatedPlayers,
    failedPlayers: failures.length,
    failures,
  };
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

    const result = await runImageSync(season);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to sync external images" },
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

    const result = await runImageSync(season);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to sync external images" },
      { status: 500 }
    );
  }
}