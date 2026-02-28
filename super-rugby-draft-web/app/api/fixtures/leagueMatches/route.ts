import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SHEET_CSV_URL = process.env.FIXTURES_SHEET_CSV_URL!;
// example: https://docs.google.com/spreadsheets/d/e/.../pub?output=csv

function normKey(s: string) {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")          // ✅ strip BOM
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");      // remove spaces/underscores etc
}

function pick(row: Record<string, string>, keys: string[]) {
  const map = new Map<string, string>();
  for (const k of Object.keys(row)) map.set(normKey(k), k);

  for (const k of keys) {
    const realKey = map.get(normKey(k));
    if (!realKey) continue;

    const s = String(row[realKey] ?? "")
      .replace(/^\uFEFF/, "") // ✅ strip BOM from VALUE too
      .trim();

    if (s !== "") return s;
  }
  return "";
}

function parseCsv(csv: string): Record<string, string>[] {
  // Minimal CSV parser that handles quoted commas.
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  const line: string[] = [];
  const pushCell = () => { line.push(cur); cur = ""; };
  const pushLine = () => { rows.push([...line]); line.length = 0; };

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (ch === '"') {
      const next = csv[i + 1];
      if (inQuotes && next === '"') {
        cur += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") { pushCell(); continue; }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && csv[i + 1] === "\n") i++; // CRLF
      pushCell();
      pushLine();
      continue;
    }

    cur += ch;
  }
  // last line
  pushCell();
  pushLine();

  const header = rows[0]?.map((h) => String(h).replace(/^\uFEFF/, "").trim()) ?? [];
  const out: Record<string, string>[] = [];

  for (const r of rows.slice(1)) {
    if (r.every((x) => String(x ?? "").trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]] = (r[c] ?? "").trim();
    out.push(obj);
  }
  return out;
}

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  try {
    if (!SHEET_CSV_URL) {
      return NextResponse.json({ ok: false, error: "Missing FIXTURES_SHEET_CSV_URL" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const season = Number(searchParams.get("season") ?? "2026");

    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Sheet fetch failed: ${res.status}` }, { status: 500 });
    }

    const csv = await res.text();
    const raw = parseCsv(csv);
    console.log("FIRST RAW ROW:", raw[0]);
console.log("SEASON PARAM:", season);

console.log("CSV HEAD:", csv.slice(0, 200));
console.log("PARSED ROWS:", raw.length, "FIRST ROW KEYS:", Object.keys(raw[0] ?? {}));
const mapped = raw.map((r, idx) => {
  const seasonRaw = pick(r, ["season"]);
const seasonVal = Number(seasonRaw);
const seasonFinal = Number.isFinite(seasonVal) ? seasonVal : season; // fallback to query param
  const weekFantasy = Number(pick(r, ["weekFantasy", "week_fantasy", "week"]));
  const weekRealRaw = pick(r, ["weekReal", "week_real", "weekRealRound"]);
  const weekReal = Number(weekRealRaw);

  const labelRaw = pick(r, ["label"]);
  const kindRaw = pick(r, ["kind"]);

  const homeTeamIdRaw = pick(r, ["homeTeamId", "home_team_id", "homeTeam"]);
  const awayTeamIdRaw = pick(r, ["awayTeamId", "away_team_id", "awayTeam"]);

  const statusRaw = pick(r, ["status"]);
  const homeScoreRaw = pick(r, ["homeScore", "home_score"]);
  const awayScoreRaw = pick(r, ["awayScore", "away_score"]);

  // 🔎 debug first few rows (this is the important part)
  if (idx < 5) {
    console.log("ROW", idx, {
      seasonRaw: pick(r, ["season"]),
      seasonVal,
      weekFantasyRaw: pick(r, ["weekFantasy", "week_fantasy", "week"]),
      weekFantasy,
    });
  }

  const label = labelRaw ? labelRaw : null;
  const kind = kindRaw ? kindRaw : null;

  const homeTeamId = homeTeamIdRaw ? homeTeamIdRaw : null;
  const awayTeamId = awayTeamIdRaw ? awayTeamIdRaw : null;

  const status = (statusRaw || "upcoming").toLowerCase();

  const homeScore = toNum(homeScoreRaw);
  const awayScore = toNum(awayScoreRaw);

  return {
    season: seasonFinal,
    weekFantasy,
    weekReal: Number.isFinite(weekReal) ? weekReal : null,
    label,
    kind,
    homeTeamId,
    awayTeamId,
    status,
    homeScore,
    awayScore,
  };
});

const rows = mapped
  .filter((r) => r.season === season)
  .filter((r) => r.weekFantasy && Number.isFinite(r.weekFantasy));

console.log("MAPPED:", mapped.length, "AFTER FILTER:", rows.length);

    return NextResponse.json({ ok: true, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}