// components/playerCard/cardData.ts
// The player card's data helpers (moved out of components/PlayerCardModal.tsx, 20 Nov 2026):
// round-by-round points from the stats sheet, the team's fixtures, the points breakdown labels,
// position / team colours and the Match Avg / Form / Total / Position Rank numbers.
import { getPlayerPool } from "@/lib/players/pool";
import { isFrontRow, pointsFromRow, roundPoints, statPoints, STATS, type StatKey } from "@/lib/scoring";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";
import { type FixtureRow, normalizeTeamCodeLocal } from "./helpers";
import type { PlayerCardPlayer } from "../PlayerCardModal";

export type RoundBreakdown = Record<string, number>; // e.g. { tries: 1, tackles: 14, ... }

export type PlayerRound = {
  week: number;
  opponent?: string;
  homeAway?: "H" | "A";
  points: number;
  breakdown?: RoundBreakdown; // RAW COUNTS per stat
  date?: string;
  minutes?: number;
  /** what the team list said that round (lib/status/roles.ts) */
  role?: "starting" | "bench" | null;
};

/**
 * =========================
 * CHIP TUNING KNOBS
 * =========================
 * Adjust these without hunting through styles.
 */
export const POSITION_CHIP_MIN_WIDTH = 54;
export const TEAM_CHIP_MIN_WIDTH = 54;
export const POSITION_CHIP_BORDER_WIDTH = 3;
export const TEAM_CHIP_BORDER_WIDTH = 3;
export const PLAYER_CARD_HEADER_MIN_HEIGHT = 150;
export const PLAYER_CARD_BOTTOM_LABEL_BOTTOM = 12;

// =========================
// DEV TOGGLES (easy remove)
// =========================
export const DEV_SEED_PLAYER_TX = true; // <- set false (or delete) to remove the demo seeding
export const ENABLE_TRADES = true; // 🔒 design-only: keep button, block navigation
/**
 * =========================
 * POSITION THEMES
 * Primary = fill
 * Secondary = (auto) darker version of primary for text + border
 * (Derived from your spreadsheet)
 * =========================
 */
export const POSITION_THEME: Record<
  string,
  { primary: string; secondary: string }
> = {
  PR: { primary: "#fb7b77", secondary: "#8a4441" },
  HO: { primary: "#fdc170", secondary: "#8b6a3e" },
  LK: { primary: "#f3f87f", secondary: "#868846" },
  LF: { primary: "#98f786", secondary: "#54884a" },
  HB: { primary: "#69ebfc", secondary: "#3a818b" },
  FH: { primary: "#6d9efc", secondary: "#3c578b" },
  CE: { primary: "#937df8", secondary: "#514588" },
  OB: { primary: "#f78ef0", secondary: "#884e84" },
};

export const HEADER_TO_KEY: Record<string, string> = {
  "Minutes played": "minutesPlayed",
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

export const BREAKDOWN_LABELS: Record<string, string> = {
  minutesPlayed: "Minutes Played",
  tries: "Tries Scored",
  tryAssists: "Try Assists",
  lineBreaks: "Line Breaks",
  lineBreakAssists: "Line Break Assists",
  defendersBeaten: "Defenders Beaten",
  metresGained: "Metres Gained",
  offloads: "Offloads",
  tackles: "Tackles",
  tacklesMissed: "Missed Tackles",
  turnoversForced: "Turnovers Forced",
  interceptions: "Interceptions",
  fiftyTwentyTwos: "Successful 50:22s",
  penaltiesConceded: "Penalties Conceded",
  errors: "Errors",
  lineoutsWon: "Lineouts Won",
  lineoutSteals: "Lineout Steals",
  lineoutErrors: "Lineout Errors",
  scrumsWon: "Scrums Won",
  conversions: "Conversions",
  conversionsMissed: "Conversions Missed",
  penaltyGoals: "Penalty Goals",
  penaltyGoalsMissed: "Penalty Goals Missed",
  dropGoals: "Drop Goals",
  dropGoalsMissed: "Drop Goals Missed",
  yellowCards: "Yellow Cards",
  redCards: "Red Cards",
};

// Order you want rows to appear in the modal
export const BREAKDOWN_ORDER: string[] = [
  "minutesPlayed",
  "tries",
  "tryAssists",
  "lineBreaks",
  "lineBreakAssists",
  "defendersBeaten",
  "metresGained",
  "offloads",
  "tackles",
  "tacklesMissed",
  "turnoversForced",
  "interceptions",
  "fiftyTwentyTwos",
  "penaltiesConceded",
  "errors",
  "lineoutsWon",
  "lineoutSteals",
  "lineoutErrors",
  "scrumsWon",
  "conversions",
  "conversionsMissed",
  "penaltyGoals",
  "penaltyGoalsMissed",
  "dropGoals",
  "dropGoalsMissed",
  "yellowCards",
  "redCards",
];

/**
 * =========================
 * TEAM THEMES
 * Primary = fill
 * Secondary = text + border (from your spreadsheet)
 * =========================
 */
export const TEAM_THEME: Record<string, { primary: string; secondary: string }> = {
  BLU: { primary: "#053c7f", secondary: "#ffffff" },
  BRU: { primary: "#002b54", secondary: "#ffc222" },
  CHI: { primary: "#ce202d", secondary: "#f6a81c" },
  CRU: { primary: "#e41e29", secondary: "#000000" },
  DRU: { primary: "#0a14be", secondary: "#ffffff" },
  FOR: { primary: "#1f62b0", secondary: "#fcb040" },
  HIG: { primary: "#1b54a2", secondary: "#f1b713" },
  HUR: { primary: "#ffe01b", secondary: "#000000" },
  MOA: { primary: "#0cacba", secondary: "#f5821f" },

// backwards compatibility
MOP: { primary: "#0cacba", secondary: "#f5821f" },

  RED: { primary: "#701c31", secondary: "#ffffff" },
  WAR: { primary: "#8fc5eb", secondary: "#b41334" },
};

export function jerseySrcForTeam(code: string | null, prefer: "angle" | "front" = "angle") {
  if (!code) return JERSEY_PLACEHOLDER;
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

export type ChipTheme = {
  bg: string;
  text: string; // border matches text by design
  borderWidth: number;
  minWidth: number;
};

export function toNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function pickAny(row: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

export function normaliseIdForRounds(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function encodePlayerImageId(id: string) {
  return encodeURIComponent(String(id ?? "")).replace(/'/g, "%27");
}

export function rowBelongsToPlayer(row: Record<string, any>, playerId: string) {
  const want = normaliseIdForRounds(playerId);

  const candidates = [
    pickAny(row, ["playerId", "PlayerId", "playerID"]),
    pickAny(row, ["internalPlayerId", "internal_player_id", "InternalPlayerId"]),
    row?.playerId,
    row?.internalPlayerId,
    row?.internal_player_id,
  ];

  return candidates.some((v) => normaliseIdForRounds(v) === want);
}

export const SCORED_STAT_KEYS = new Set<string>(STATS.map((s) => s.key));

// Points for one stat, using the shared scoring rules (lib/scoring).
export function getBreakdownPointsFromCount(
  key: string,
  count: number,
  player: { posAbbrev?: string; secondaryPosAbbrev?: string }
) {
  if (!count || !SCORED_STAT_KEYS.has(key)) return 0;
  return statPoints(key as StatKey, count, isFrontRow(player));
}

export function buildRoundsFromSheetRows(
  rows: Record<string, any>[],
  player: PlayerCardPlayer
): PlayerRound[] {
  const mine = rows.filter((r) => rowBelongsToPlayer(r, player.id));

  return mine
    .map((r) => {
      const week = toNum(pickAny(r, ["round", "Round", "week", "Week"]));
      const breakdown: Record<string, number> = {};

      for (const [header, internalKey] of Object.entries(HEADER_TO_KEY)) {
        const count = toNum(pickAny(r, [header]));
        if (!count) continue;

        // store RAW COUNTS
        breakdown[internalKey] = count;
      }

      const rowPoints = pointsFromRow(r, player);

      const minutes = toNum(pickAny(r, ["Minutes played"]));

      const role: PlayerRound["role"] = r.role === "starting" || r.role === "bench" ? r.role : null;
      return {
        week,
        points: rowPoints,
        breakdown,
        minutes,
        role,
      };
    })
    .filter((r) => r.week > 0)
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
}

export function isFixtureCompleteAny(raw: any) {
  const s = String(raw?.status ?? raw?.Status ?? "").toLowerCase().trim();
  if (s === "final" || s === "complete" || s === "completed") return true;
  if (s === "live") return false; // a live score isn't a result yet

  const hs = raw?.homeScore ?? raw?.HomeScore ?? raw?.["Home Score"];
  const as = raw?.awayScore ?? raw?.AwayScore ?? raw?.["Away Score"];

  const homeScore = hs === "" || hs == null ? null : Number(hs);
  const awayScore = as === "" || as == null ? null : Number(as);

  if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) return true;

  return false;
}

export function buildFixturesForTeam(all: any[], teamCode: string): FixtureRow[] {
  const myCode = normalizeTeamCodeLocal(teamCode) ?? teamCode;

  const mine = all.filter((f) => {
    const h = normalizeTeamCodeLocal(f.homeTeam ?? f.homeTeamCode ?? f.home);
    const a = normalizeTeamCodeLocal(f.awayTeam ?? f.awayTeamCode ?? f.away);

    return h === myCode || a === myCode;
  });

return mine
  .map((f) => {
    const h = normalizeTeamCodeLocal(f.homeTeam ?? f.homeTeamCode ?? f.home);
    const a = normalizeTeamCodeLocal(f.awayTeam ?? f.awayTeamCode ?? f.away);

    const isHome = h === myCode;

    const fdrHome =
      f.homeFDR ?? f.HomeFDR ?? f["Home FDR"] ?? f.fdrHome ?? f["FDR Home"] ?? null;

    const fdrAway =
      f.awayFDR ?? f.AwayFDR ?? f["Away FDR"] ?? f.fdrAway ?? f["FDR Away"] ?? null;

    const fdrGeneric =
      f.fdr ?? f.FDR ?? f["FDR"] ?? f.fixtureDifficulty ?? f["Fixture Difficulty"] ?? null;

    const fdrPicked = isHome ? (fdrHome ?? fdrGeneric) : (fdrAway ?? fdrGeneric);

    const resolvedFdr =
      fdrPicked === "" || fdrPicked == null ? null : Number(fdrPicked);

    const homeScore =
      f.homeScore ?? f.HomeScore ?? f["Home Score"] ?? f.home_score ?? null;
    const awayScore =
      f.awayScore ?? f.AwayScore ?? f["Away Score"] ?? f.away_score ?? null;

    const status = String(f.status ?? f.Status ?? "").trim();

    const isComplete = isFixtureCompleteAny({
      status,
      homeScore,
      awayScore,
    });

    return {
      week: Number(f.week) || 0,
      opponent: isHome ? (a ?? f.awayTeam) : (h ?? f.homeTeam),
      homeAway: isHome ? "H" : "A",
      kickoff: f.kickoffAt || "",
      isBye: false,

      status,
      homeScore: homeScore === "" ? null : Number(homeScore),
      awayScore: awayScore === "" ? null : Number(awayScore),
      isComplete,

      fdr: resolvedFdr,
    } satisfies FixtureRow;
  })

    .filter((f) => f.week > 0)
    .sort((a, b) => (a.week ?? 0) - (b.week ?? 0));
}

export function computeTotalPoints(rounds: { points: number }[]) {
  return roundPoints((rounds ?? []).reduce((sum, r) => sum + (Number(r?.points) || 0), 0));
}
export function computeAvgPoints(rounds: { points: number }[]) {
  const gp = rounds?.length ?? 0;
  if (!gp) return 0;
  return computeTotalPoints(rounds) / gp;
}

export function computeFormAvg(rounds: { week?: number; points: number }[], lastN = 3) {
  if (!rounds?.length) return 0;
  const sorted = [...rounds].sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
  const recent = sorted.slice(0, lastN);
  if (!recent.length) return 0;
  const total = recent.reduce((sum, r) => sum + (Number(r?.points) || 0), 0);
  return total / recent.length;
}

/**
 * Rank player against others in SAME PRIMARY POSITION for TOTAL POINTS
 * Uses:
 * - roundRows from sheets (all player rounds)
 * - playersData for primary position by playerId
 */
export function computePositionRank(args: {
  playerId: string;
  posAbbrev: string;
  roundRows: Record<string, any>[];
}) {
  const { playerId, posAbbrev, roundRows } = args;

  if (!playerId || !posAbbrev || !Array.isArray(roundRows) || !roundRows.length) {
    return null as null | { rank: number; outOf: number };
  }

  const wantPlayerId = normaliseIdForRounds(playerId);
  const wantPos = String(posAbbrev ?? "").trim().toUpperCase();

  const primaryPosById = new Map<string, string>();
  const playerMetaById = new Map<string, any>();
  for (const pl of getPlayerPool() as any[]) {
    const id = normaliseIdForRounds(pl?.id);
    if (!id) continue;
    playerMetaById.set(id, pl);

    const pos =
      String(pl?.posAbbrev ?? pl?.position ?? pl?.pos ?? "").trim().toUpperCase();

    if (pos) primaryPosById.set(id, pos);
  }

  const totalsById = new Map<string, number>();

  for (const r of roundRows) {
    const idRaw =
      pickAny(r, ["internalPlayerId", "internal_player_id", "InternalPlayerId"]) ||
      pickAny(r, ["playerId", "PlayerId", "playerID"]);

    const id = normaliseIdForRounds(idRaw);
    if (!id) continue;

    const rowPoints = pointsFromRow(r, playerMetaById.get(id));
    totalsById.set(id, (totalsById.get(id) ?? 0) + rowPoints);
  }

  const samePosTotals: { id: string; total: number }[] = [];
  for (const [id, total] of totalsById.entries()) {
    const primaryPos = primaryPosById.get(id);
    if (primaryPos === wantPos) {
      samePosTotals.push({ id, total });
    }
  }

  if (!samePosTotals.length) return null;

  samePosTotals.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));

  const idx = samePosTotals.findIndex((x) => x.id === wantPlayerId);
  if (idx === -1) return null;

  return { rank: idx + 1, outOf: samePosTotals.length };
}
