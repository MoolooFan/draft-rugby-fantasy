import { NextRequest, NextResponse } from "next/server";
import { PUBLIC_SHEETS } from "@/lib/sheets/publicUrls";
import { fetchCsvRows } from "@/lib/sheets/csv";

function pick(row: Record<string, string>, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return "";
}

function toNum(x: any): number {
  const n = Number(String(x ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const teamCode = searchParams.get("teamCode")?.trim();

    if (!teamCode) {
      return NextResponse.json(
        { ok: false, error: "Missing teamCode" },
        { status: 400 }
      );
    }

    const rows = await fetchCsvRows(PUBLIC_SHEETS.fixturesCsv);

    // TEMP DEBUG: confirm headers once
    console.log("fixtures headers:", rows[0] ? Object.keys(rows[0]) : []);

    const fixtures = rows
      .map((r) => {
        const week = toNum(pick(r, ["week", "round"]));
        const homeTeam = pick(r, ["homeTeam", "home", "homeTeamCode"]);
        const awayTeam = pick(r, ["awayTeam", "away", "awayTeamCode"]);

        // your sheets route creates kickoffMs; raw sheet may have kickoffAt/kickOffAt
        const kickoff = pick(r, ["kickoffAt", "kickOffAt", "kickoff", "datetime", "date"]) || "";

        let homeAway: "H" | "A" | undefined;
        let opponent: string | undefined;

        if (homeTeam === teamCode) {
          homeAway = "H";
          opponent = awayTeam || undefined;
        } else if (awayTeam === teamCode) {
          homeAway = "A";
          opponent = homeTeam || undefined;
        } else {
          return null;
        }

        return {
          week,
          opponent,
          homeAway,
          kickoff: kickoff || undefined,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.week - b.week);

    return NextResponse.json({ ok: true, fixtures });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
