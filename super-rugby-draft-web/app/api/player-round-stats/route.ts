// app/api/sheets/player-round-stats/route.ts
import { NextResponse } from "next/server";
import { PUBLIC_SHEETS } from "@/lib/sheets/publicUrls";
import { fetchCsvRows } from "@/lib/sheets/csv";

function pick(row: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return "";
}

function toNum(x: any): number {
  const n = Number(String(x).trim());
  return Number.isFinite(n) ? n : 0;
}

// 1) map your sheet headers -> internal stat keys
const HEADER_TO_KEY: Record<string, string> = {
  "Tries": "tries",
  "Try Assists": "tryAssists",
  "Linebreaks": "lineBreaks",
  "Linebreak assists": "lineBreakAssists",
  "Defenders beaten": "defendersBeaten",
  "Carries (m)": "metresGained",
  "Offloads": "offloads",
  "Tackles": "tackles",
  "Missed tackles": "tacklesMissed",
  "Turnover Forced": "turnoversForced",
  "Interceptions": "interceptions",
  "50:22 Kicks": "fiftyTwentyTwos",
  "Penalties Conceded": "penaltiesConceded",
  "Errors": "errors",
  "Lineouts won": "lineoutsWon",
  "Lineout steals": "lineoutSteals",
  "Lineout errors": "lineoutErrors",
  "Scrums won outright": "scrumsWon",
  "Conversions": "conversions",
  "Conversions missed": "conversionsMissed",
  "Penalty scored": "penaltyGoals",
  "Penalty missed": "penaltyGoalsMissed",
  "Drop goal scored": "dropGoals",
  "Drop goal missed": "dropGoalsMissed",
  "Yellow cards": "yellowCards",
  "Red cards": "redCards",
};

// 2) points-per-event table (MUST match your scoring rules)
// IMPORTANT: these should be the points for ONE event (try=15 etc)
const POINTS_PER_EVENT: Record<string, number> = {
  tries: 15,
  tryAssists: 9,

  lineBreaks: 7,
  lineBreakAssists: 7,
  defendersBeaten: 1,
  metresGained: 1,
  offloads: 2,

  tackles: 1,
  tacklesMissed: -1,

  turnoversForced: 5,
  interceptions: 5,
  fiftyTwentyTwos: 5,

  penaltiesConceded: -2,
  errors: -2,

  lineoutsWon: 1,
  lineoutSteals: 2,
  lineoutErrors: -1,
  scrumsWon: 2,

  conversions: 2,
  conversionsMissed: -1,

  penaltyGoals: 3,
  penaltyGoalsMissed: -1,

  dropGoals: 5,
  dropGoalsMissed: -2,

  yellowCards: -5,
  redCards: -10,
};

function pointsToCount(points: number, key: string): number {
  const per = POINTS_PER_EVENT[key];
  if (!per) return 0;

  // Example: triesPoints=30, per=15 => 2
  const raw = points / per;

  // Keep it neat: most of these are integers; metres could be non-integer if you ever want
  // If you want metres to stay decimal, set a special case here.
  return Number.isFinite(raw) ? raw : 0;
}

export async function GET() {
  try {
    const rows = await fetchCsvRows(PUBLIC_SHEETS.playerRoundStatsCsv);

    // Debug headers (keep for now, remove later)
    console.log("player-round-stats headers:", rows[0] ? Object.keys(rows[0]) : []);

    // Return normalized rows (still per player+round)
    const normalized = rows.map((r) => {
      const week = Number(pick(r, ["round", "Round", "week", "Week"])) || 0;
      const playerId = String(pick(r, ["playerId", "PlayerId", "playerID", "id"])).trim();

      const minutes = toNum(pick(r, ["Minutes played", "minutesPlayed", "minutes"]));

      // Convert “points-entered” columns into COUNTS for breakdown
      const breakdown: Record<string, number> = {};
      let computedTotalPoints = 0;

      for (const [header, internalKey] of Object.entries(HEADER_TO_KEY)) {
        const pts = toNum(pick(r, [header]));
        if (!pts) continue;

        computedTotalPoints += pts;

        const count = pointsToCount(pts, internalKey);
        // If you want to force integers:
        breakdown[internalKey] = Math.round(count);
      }

      // Optional: if you later add a "Total" column, you can prefer it here
      // const totalOverride = toNum(pick(r, ["Total", "totalPoints", "points"]));
      // const points = totalOverride || computedTotalPoints;

      return {
        week,
        playerId,
        minutes,
        points: computedTotalPoints,
        breakdown,
      };
    });

    return NextResponse.json({ ok: true, rows: normalized });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
