import { getExternalPlayerId } from "@/lib/players/externalIdMap";

export type ExternalWeekStat = {
  round: number;
  points: number;
  raw: any;
};

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normaliseRoundRow(row: any): ExternalWeekStat | null {
  if (!row || typeof row !== "object") return null;

  const round =
    toNum(row.roundId) ??
    toNum(row.round) ??
    toNum(row.week) ??
    toNum(row.gameweek) ??
    toNum(row.gw) ??
    toNum(row.id);

  const points =
    toNum(row.points) ??
    toNum(row.score) ??
    toNum(row.total) ??
    toNum(row.fantasyPoints);

  if (round == null || points == null) return null;

  return {
    round,
    points,
    raw: row,
  };
}

export async function fetchExternalPlayerStatsByExternalId(
  externalId: number
): Promise<ExternalWeekStat[]> {
  const url = `https://www.playfantasyrugby.com/json/fantasy/player_stats/${externalId}.json`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`External stats fetch failed for ${externalId}: ${res.status}`);
  }

  const json = await res.json();

  const rows = Array.isArray(json)
    ? json
    : Array.isArray(json?.stats)
    ? json.stats
    : Array.isArray(json?.rounds)
    ? json.rounds
    : Array.isArray(json?.data)
    ? json.data
    : [];

  return rows.map(normaliseRoundRow).filter(Boolean) as ExternalWeekStat[];
}

export async function fetchExternalPlayerStatsByInternalId(
  internalId: string
): Promise<ExternalWeekStat[]> {
  const externalId = getExternalPlayerId(internalId);
  if (externalId == null) return [];
  return fetchExternalPlayerStatsByExternalId(externalId);
}