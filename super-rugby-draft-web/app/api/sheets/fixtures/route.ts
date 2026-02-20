// app/api/sheets/fixtures/route.ts
import { NextResponse } from "next/server";
import { PUBLIC_SHEETS } from "@/lib/sheets/publicUrls";
import { fetchCsvRows, toNumberOrNull } from "@/lib/sheets/csv";

function pick(row: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

// Make kickoff parsing bulletproof (CSV often gives strings)
function toKickoffMs(x: any): number {
  if (x == null) return 0;

  // If it’s already a number-like string, try to treat it as number
  const num = typeof x === "number" ? x : Number(String(x).trim());
  if (Number.isFinite(num) && num !== 0) {
    // Google Sheets serial date (days since 1899-12-30)
    if (num > 20000 && num < 80000) return Math.round((num - 25569) * 86400 * 1000);

    // seconds epoch
    if (num > 1e9 && num < 1e12) return Math.round(num * 1000);

    // ms epoch
    if (num > 1e12) return Math.round(num);
  }

  const s = String(x).trim();
  if (!s) return 0;

  // DD/MM/YYYY HH:mm (common AU/NZ sheet formatting)
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]) - 1;
    const yyyy = Number(m1[3]);
    const hh = Number(m1[4] ?? 0);
    const min = Number(m1[5] ?? 0);
    const ms = new Date(yyyy, mm, dd, hh, min, 0, 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  // YYYY-MM-DD HH:mm (no timezone)
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (m2) {
    const yyyy = Number(m2[1]);
    const mm = Number(m2[2]) - 1;
    const dd = Number(m2[3]);
    const hh = Number(m2[4] ?? 0);
    const min = Number(m2[5] ?? 0);
    const ms = new Date(yyyy, mm, dd, hh, min, 0, 0).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  // ISO / fallback
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export async function GET() {
  try {
    const rows = await fetchCsvRows(PUBLIC_SHEETS.fixturesCsv);


    // TEMP DEBUG (remove after you confirm):
     console.log("fixtures csv headers:", rows[0] ? Object.keys(rows[0]) : []);

    const fixtures = rows.map((r) => {
      const id = pick(r, ["id", "fixtureId"]);
      const week = Number(pick(r, ["week", "round"]));

      // broaden keys a lot (CSV headers are often different)
      const kickoffRaw = pick(r, [
  "kickoffAt",
  "kickOffAt",     // ✅ ADD THIS (matches your sheet header)
  "kickoff",
  "kickoff_ms",
  "kickoffMs",
  "dateTime",
  "datetime",
  "date",
  "start",
  "startTime",
  "start_time",
]);


      const kickoffMs = toKickoffMs(kickoffRaw);

const homeTeam = pick(r, ["homeTeam", "Home Team", "home", "homeTeamCode", "Home"]);
const awayTeam = pick(r, ["awayTeam", "Away Team", "away", "awayTeamCode", "Away"]);

      const statusRaw = pick(r, ["status", "Status", "fixtureStatus", "Fixture Status"]);
const s = (statusRaw || "scheduled").toLowerCase();

// Normalize status to the 3 values your app expects in other places
const status =
  s === "final" || s === "complete" || s === "completed"
    ? "final"
    : s === "live" || s === "inprogress" || s === "in progress"
    ? "live"
    : "scheduled";

// Scores: add common “sheet-style” headers with spaces/case
const homeScore = toNumberOrNull(
  pick(r, ["homeScore", "HomeScore", "home_score", "Home Score", "Home score", "HS"])
);
const awayScore = toNumberOrNull(
  pick(r, ["awayScore", "AwayScore", "away_score", "Away Score", "Away score", "AS"])
);

      const fdrHomeRaw = toNumberOrNull(pick(r, ["fdrHome", "homeFdr", "fdr_home"]));
      const fdrAwayRaw = toNumberOrNull(pick(r, ["fdrAway", "awayFdr", "fdr_away"]));

      const fdrHome =
        fdrHomeRaw && [1, 2, 3, 4, 5].includes(fdrHomeRaw)
          ? (fdrHomeRaw as 1 | 2 | 3 | 4 | 5)
          : undefined;

      const fdrAway =
        fdrAwayRaw && [1, 2, 3, 4, 5].includes(fdrAwayRaw)
          ? (fdrAwayRaw as 1 | 2 | 3 | 4 | 5)
          : undefined;

      return {
        id,
        week,
        kickoffAt: kickoffRaw, // keep for debugging (optional)
        kickoffMs,             // ✅ this is what the UI should use
        homeTeam,
        awayTeam,
        status,
        homeScore,
        awayScore,
        fdrHome,
        fdrAway,
      };
    });

    return NextResponse.json({ ok: true, fixtures });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
