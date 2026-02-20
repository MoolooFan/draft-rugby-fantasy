// app/api/sheets/player-round-stats/route.ts
import { NextResponse } from "next/server";
import { PUBLIC_SHEETS } from "@/lib/sheets/publicUrls";
import { fetchCsvRows } from "@/lib/sheets/csv";

export async function GET() {
  try {
    const rows = await fetchCsvRows(PUBLIC_SHEETS.playerRoundStatsCsv);
    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
