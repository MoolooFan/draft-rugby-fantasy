// app/api/sheets/players/route.ts
import { NextResponse } from "next/server";
import { PUBLIC_SHEETS } from "@/lib/sheets/publicUrls";
import { fetchCsvRows } from "@/lib/sheets/csv";

function normalizeKey(k: string) {
  return String(k ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " "); // collapse multiple spaces
}

function normalizeVal(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const low = s.toLowerCase();

  // treat common placeholders as empty
  if (low === "-" || low === "—" || low === "n/a" || low === "na") return "";
  if (low === "null" || low === "undefined") return "";

  return s;
}

function pick(row: Record<string, string>, keys: string[]) {
  // build a normalized lookup so headers like "Status " or "CURRENT STATUS" still match
  const normRow: Record<string, string> = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    normRow[normalizeKey(k)] = normalizeVal(v);
  }

  for (const k of keys) {
    const v = normRow[normalizeKey(k)];
    if (v) return v;
  }
  return "";
}


export async function GET() {
  try {
    const rows = await fetchCsvRows(PUBLIC_SHEETS.playersCsv);

    const players = rows.map((r) => {
      // ✅ CURRENT status (force from "status" column; never from weekly columns)
      const statusRaw = pick(r, ["status", "current status", "currentStatus", "Status", "Current Status"]);
const status = statusRaw ? statusRaw.trim() : null;


      // ✅ weekly statuses (statusW1...statusW16)
      // Store as W1..W16 for cleaner consumption across the app
      const weeklyStatus: Record<string, string> = {};
      for (let w = 1; w <= 16; w++) {
        const v = pick(r, [
          `statusW${w}`,
          `StatusW${w}`,
          `statusw${w}`,
          `Statusw${w}`,
        ]);
        if (v) weeklyStatus[`W${w}`] = v.trim().toLowerCase();
      }

      return {
        id: pick(r, ["playerId", "PlayerId", "playerID", "id"]),
        firstName: pick(r, ["firstName", "FirstName", "first_name"]),
        lastName: pick(r, ["lastName", "LastName", "last_name"]),
        teamCode: pick(r, ["teamCode", "TeamCode", "team", "club"]),
        teamName: pick(r, ["teamName", "TeamName"]),

        posAbbrev: pick(r, ["posAbbrev", "PosAbbrev", "pos", "position"]),
        secondaryPosAbbrev: pick(r, ["secondaryPosAbbrev", "SecondaryPosAbbrev"]),
        posName: pick(r, ["posName", "PosName"]),
        secondaryPosName: pick(r, ["secondaryPosName", "SecondaryPosName"]),

        draftRank: Number(pick(r, ["draftRank", "DraftRank", "rank"])) || 9999,

        // ✅ fields used by PlayerCardModal
        status,
        weeklyStatus,
      };
    });

    return NextResponse.json({ ok: true, players });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
