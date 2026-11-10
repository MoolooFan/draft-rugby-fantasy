"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlayerPool } from "@/lib/players/pool";
import { PointsBreakdownModal } from "@/components/PointsBreakdownModal";

import { usePlayersStore, usePlayers } from "@/lib/players/store";
import { isFrontRow, pointsFromRow, statPoints, STATS, type StatKey, roundPoints } from "@/lib/scoring";
import { currentSeasonYear, statsSeasonYear, roundLabel } from "@/lib/season";
import { cachedJson } from "@/lib/cachedJson";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";
import { FixtureRow, normalizeTeamCodeLocal, TabCard } from "./playerCard/helpers";
import { ResultsTab, StatsTab, FixturesTab } from "./playerCard/tabs";
import { positionsLabel } from "@/lib/players/positions";
import { formatStatCount } from "@/lib/scoring";

export type PlayerStatus = "starting" | "benched" | "out" | null;

export type PlayerCardTab = "Results" | "Stats" | "Fixtures";

export type PlayerCardPlayer = {
  id: string;
  firstName: string;
  lastName: string;

  posAbbrev: string;
  posName: string;

  secondaryPosAbbrev?: string;
  secondaryPosName?: string;

  teamCode: string;
  teamName?: string;

  status?: "starting" | "benched" | string | null;
  weeklyStatus?: Record<string, string>; // can be {W1:..} or {statusW1:..}

  stats?: Record<string, number>;
};

export type PlayerCardAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
};

type RoundBreakdown = Record<string, number>; // e.g. { tries: 1, tackles: 14, ... }

type PlayerRound = {
  week: number;
  opponent?: string;
  homeAway?: "H" | "A";
  points: number;
  breakdown?: RoundBreakdown; // RAW COUNTS per stat
  date?: string;
  minutes?: number;
};

/**
 * =========================
 * CHIP TUNING KNOBS
 * =========================
 * Adjust these without hunting through styles.
 */
const POSITION_CHIP_MIN_WIDTH = 54;
const TEAM_CHIP_MIN_WIDTH = 54;
const POSITION_CHIP_BORDER_WIDTH = 3;
const TEAM_CHIP_BORDER_WIDTH = 3;
const PLAYER_CARD_HEADER_MIN_HEIGHT = 150;
const PLAYER_CARD_BOTTOM_LABEL_BOTTOM = 12;

// =========================
// DEV TOGGLES (easy remove)
// =========================
const DEV_SEED_PLAYER_TX = true; // <- set false (or delete) to remove the demo seeding
const ENABLE_TRADES = true; // 🔒 design-only: keep button, block navigation
/**
 * =========================
 * POSITION THEMES
 * Primary = fill
 * Secondary = (auto) darker version of primary for text + border
 * (Derived from your spreadsheet)
 * =========================
 */
const POSITION_THEME: Record<
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

const HEADER_TO_KEY: Record<string, string> = {
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

const BREAKDOWN_LABELS: Record<string, string> = {
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
const BREAKDOWN_ORDER: string[] = [
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
const TEAM_THEME: Record<string, { primary: string; secondary: string }> = {
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

function jerseySrcForTeam(code: string | null, prefer: "angle" | "front" = "angle") {
  if (!code) return JERSEY_PLACEHOLDER;
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

type ChipTheme = {
  bg: string;
  text: string; // border matches text by design
  borderWidth: number;
  minWidth: number;
};

function toNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function pickAny(row: Record<string, any>, keys: string[]) {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function normaliseIdForRounds(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function encodePlayerImageId(id: string) {
  return encodeURIComponent(String(id ?? "")).replace(/'/g, "%27");
}

function rowBelongsToPlayer(row: Record<string, any>, playerId: string) {
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

const SCORED_STAT_KEYS = new Set<string>(STATS.map((s) => s.key));

// Points for one stat, using the shared scoring rules (lib/scoring).
function getBreakdownPointsFromCount(
  key: string,
  count: number,
  player: { posAbbrev?: string; secondaryPosAbbrev?: string }
) {
  if (!count || !SCORED_STAT_KEYS.has(key)) return 0;
  return statPoints(key as StatKey, count, isFrontRow(player));
}

function buildRoundsFromSheetRows(
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

      return {
        week,
        points: rowPoints,
        breakdown,
        minutes,
      };
    })
    .filter((r) => r.week > 0)
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0));
}

function isFixtureCompleteAny(raw: any) {
  const s = String(raw?.status ?? raw?.Status ?? "").toLowerCase().trim();
  if (s === "final" || s === "complete" || s === "completed") return true;

  const hs = raw?.homeScore ?? raw?.HomeScore ?? raw?.["Home Score"];
  const as = raw?.awayScore ?? raw?.AwayScore ?? raw?.["Away Score"];

  const homeScore = hs === "" || hs == null ? null : Number(hs);
  const awayScore = as === "" || as == null ? null : Number(as);

  if (Number.isFinite(homeScore) && Number.isFinite(awayScore)) return true;

  return false;
}

function buildFixturesForTeam(all: any[], teamCode: string): FixtureRow[] {
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

type PlayerCardModalProps = {
  open?: boolean;
  player: PlayerCardPlayer | null;
  status?: PlayerStatus;
  stats?: Record<string, number>;

  teamLabel?: string;
  initialTab?: PlayerCardTab;
  actions?: PlayerCardAction[];
  hideActions?: boolean;
  onClose: () => void;
};

/**
 * Shows nothing when closed or when there's no player; otherwise the card.
 * (Kept separate so the card's React hooks always run in the same order;
 * returning early in the middle of them could crash the page.)
 */
export function PlayerCardModal(props: PlayerCardModalProps) {
  if (props.open === false || !props.player) return null;
  return <PlayerCardModalInner {...props} player={props.player} />;
}

function PlayerCardModalInner({
  open = true,
  player,
  status = null,
  stats = {},

  teamLabel = "Stouty's Studs",
  initialTab = "Stats",
  actions = [
    { label: "Watch", onClick: () => {}, variant: "secondary" },
    { label: "Submit Claim", onClick: () => {}, variant: "primary" },
  ],
  hideActions = false,
  onClose,
}: PlayerCardModalProps & { player: PlayerCardPlayer }) {

const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const [rounds, setRounds] = useState<PlayerRound[]>([]);
const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
const [allRoundRows, setAllRoundRows] = useState<Record<string, any>[]>([]);
const [seasonWeeks, setSeasonWeeks] = useState<number[]>([]);
const [lastCompletedWeek, setLastCompletedWeek] = useState<number>(0);
// Results/Stats use the stats season (last season's until this season's first kickoff); the
// Fixtures tab always shows this season's draw.
const [statSeason, setStatSeason] = useState<number>(() => statsSeasonYear());
const [upcomingFixtures, setUpcomingFixtures] = useState<FixtureRow[]>([]);
const [upcomingWeeks, setUpcomingWeeks] = useState<number[]>([]);
const [upcomingLastCompleted, setUpcomingLastCompleted] = useState<number>(0);

// for the Results score breakdown popup
const [openBreakdown, setOpenBreakdown] = useState(false);
const [selectedRound, setSelectedRound] = useState<PlayerRound | null>(null);

  const tabs: PlayerCardTab[] = useMemo(
  () => ["Results", "Stats", "Fixtures"],
  []
);

  const [tab, setTab] = useState<PlayerCardTab>(initialTab);

// player is always set here (PlayerCardModal only renders this when it is)
const p = player;

// ensure sheet players are loaded (no-op if already loaded)
usePlayers();

// pull the authoritative player from sheets (status comes from the "status" column)
const sheetP = usePlayersStore((s) => s.getById(p.id));
const statusFromSheet = sheetP?.status ?? null;
const weeklyFromSheet = sheetP?.weeklyStatus ?? null;

// ✅ Use sheet status automatically if not explicitly passed
const effectiveStatus: PlayerStatus = useMemo(() => {
  // if caller explicitly forces status, respect it
  if (status === "starting" || status === "benched" || status === "out") return status;

  // otherwise ONLY use sheet status
  const raw = String(statusFromSheet ?? "");

  const s = raw.trim().toLowerCase();

  // treat empty / "-" as no status
  if (!s || s === "-") return null;

  if (s === "starting") return "starting";
  if (s === "benched") return "benched";

  // anything else counts as out
  return "out";
}, [status, statusFromSheet]);

const computed = useMemo(() => {
  const ws = weeklyFromSheet ?? p.weeklyStatus ?? {};

  // Support BOTH:
  //  - new API format: { W1: "starting", W2: "benched", ... }
  //  - old format:     { statusW1: "starting", statusW2: "benched", ... }
  const vals: string[] = [];
  for (let w = 1; w <= 16; w++) {
    const v =
      ws[`W${w}`] ??
      ws[`statusW${w}`] ??
      ws[`statusw${w}`] ??
      ws[`StatusW${w}`] ??
      ws[`Statusw${w}`];

    if (typeof v === "string" && v.trim() !== "") vals.push(v.trim().toLowerCase());
  }

  const gamesPlayed = vals.filter((v) => v === "starting" || v === "benched").length;
  const starts = vals.filter((v) => v === "starting").length;

  return { gamesPlayed, starts };
}, [weeklyFromSheet, p.weeklyStatus]);

useEffect(() => {
  setTab(initialTab);
}, [initialTab, open, p.id]);

useEffect(() => {
  if (!open) return;

  let cancelled = false;

  async function load() {
    try {
      setLoading(true);
      setError(null);

      // shared with the rest of the site (lib/cachedJson): opening a card doesn't re-download them
      const statsYear = statsSeasonYear();
      const thisYear = currentSeasonYear();
      const [roundJson, fixJson, upcomingJson] = await Promise.all([
        cachedJson<any>(`/api/players/round-stats?season=${statsYear}`),
        cachedJson<any>(`/api/fixtures/season?season=${statsYear}`),
        statsYear === thisYear ? Promise.resolve(null) : cachedJson<any>(`/api/fixtures/season?season=${thisYear}`),
      ]);

// /api/players/round-stats -> { ok: true, rows: [...] }
const roundRows: Record<string, any>[] = Array.isArray(roundJson?.rows) ? roundJson.rows : [];

// /api/fixtures/season -> { ok: true, fixtures: [...] }
const allFixtures: any[] = Array.isArray(fixJson?.fixtures) ? fixJson.fixtures : [];
// ✅ GLOBAL last completed week (from ALL fixtures, not team-only)
const completedWeeksGlobal = allFixtures
  .filter((f) => isFixtureCompleteAny(f))
  .map((f) => Number(f.week) || 0)
  .filter((w) => w > 0);

const lastW = completedWeeksGlobal.length ? Math.max(...completedWeeksGlobal) : 0;

// ✅ season weeks = every week number that exists in the fixtures sheet
const weeks = Array.from(
  new Set(
    allFixtures
      .map((f) => Number(f.week) || 0)
      .filter((w) => w > 0)
  )
).sort((a, b) => b - a); // newest first

// Convert to what the UI expects
const parsedRounds = buildRoundsFromSheetRows(roundRows, p);
const parsedFix = buildFixturesForTeam(allFixtures, p.teamCode);

// this season's draw for the Fixtures tab (the same as above once the season has started)
const upcomingAll: any[] = upcomingJson ? (Array.isArray(upcomingJson?.fixtures) ? upcomingJson.fixtures : []) : allFixtures;
const upcomingDone = upcomingAll.filter((f) => isFixtureCompleteAny(f)).map((f) => Number(f.week) || 0).filter((w) => w > 0);
const upcomingWeekList = Array.from(new Set(upcomingAll.map((f) => Number(f.week) || 0).filter((w) => w > 0))).sort((a, b) => b - a);

if (!cancelled) {
  setRounds(parsedRounds);
  setFixtures(parsedFix);
  setAllRoundRows(roundRows);
  setSeasonWeeks(weeks);
  setLastCompletedWeek(lastW); // ✅ add this
  setStatSeason(statsYear);
  setUpcomingFixtures(upcomingJson ? buildFixturesForTeam(upcomingAll, p.teamCode) : parsedFix);
  setUpcomingWeeks(upcomingJson ? upcomingWeekList : weeks);
  setUpcomingLastCompleted(upcomingJson ? (upcomingDone.length ? Math.max(...upcomingDone) : 0) : lastW);
}

    } catch (e: any) {
      if (!cancelled) setError(e?.message ?? "Failed to load data");
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, [open, p.id, p.teamCode]);

// ✅ If player is OUT, show the actual sheet reason (e.g. "Hamstring", "Suspended", etc)
const outReason = useMemo(() => {
  const raw = String(statusFromSheet ?? "").trim();
  if (!raw) return "";

  const low = raw.toLowerCase();
  if (low === "starting" || low === "benched" || low === "out") return "";

  return raw;
}, [statusFromSheet]);

// Status strip (optional)
const statusStyle =
  effectiveStatus === "starting"
    ? { bg: "#bbf7d0", text: "#111827", icon: "👍", label: "Starting" }
    : effectiveStatus === "benched"
    ? { bg: "#FFE65B", text: "#111827", icon: "⚠️", label: "Benched" }
    : effectiveStatus === "out"
    ? {
        bg: "#C0020D",
        text: "#ffffff",
        icon: "⛔",
        // ✅ if we have a reason from the sheet, show that instead of just "Out"
        label: outReason || "Out",
      }
    : null;

  const posTheme = POSITION_THEME[p.posAbbrev] ?? {
  primary: "rgba(0,0,0,0.25)",
  secondary: "rgba(255,255,255,0.95)",
};

const teamTheme = TEAM_THEME[p.teamCode] ?? {
  primary: "#f97316",
  secondary: "rgba(255,255,255,0.95)",
};

  const posChip: ChipTheme = {
    bg: posTheme.primary,
    text: posTheme.secondary,
    minWidth: POSITION_CHIP_MIN_WIDTH,
    borderWidth: POSITION_CHIP_BORDER_WIDTH,
  };

  const teamChip: ChipTheme = {
    bg: teamTheme.primary,
    text: teamTheme.secondary,
    minWidth: TEAM_CHIP_MIN_WIDTH,
    borderWidth: TEAM_CHIP_BORDER_WIDTH,
  };

  // e.g. "CE/OB/FH" (the full player record has all three positions)
  const positionLabel = positionsLabel(sheetP ?? p);

const TEAM_NAME_BY_CODE: Record<string, string> = {
  BLU: "Blues",
  BRU: "Brumbies",
  CHI: "Chiefs",
  CRU: "Crusaders",
  DRU: "Drua",
  FOR: "Force",
  HIG: "Highlanders",
  HUR: "Hurricanes",
  MOA: "Moana Pasifika",
  MOP: "Moana Pasifika", // backwards compatibility
  RED: "Reds",
  WAR: "Waratahs",
};

const teamLabelFull =
  (p.teamName?.trim() ? p.teamName.trim() : TEAM_NAME_BY_CODE[p.teamCode]) ?? p.teamCode;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "94%",
          maxWidth: 520,
          maxHeight: "92svh",
        }}
      >
        <div
  key={p.id} // ✅ add this
  style={{
    borderRadius: 14,
    background: "rgba(255,255,255,0.20)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
    color: "white",
    display: "flex",
    flexDirection: "column",
    maxHeight: "92svh",
  }}
>

          {/* Status strip (only if status exists) */}
          {statusStyle && (
  <div
    style={{
      background: statusStyle.bg,
      color: statusStyle.text,
      padding: "6px 10px",
      fontWeight: 900,
      fontSize: 12,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    <span style={{ fontSize: 14, lineHeight: "14px" }}>{statusStyle.icon}</span>
    <span>{statusStyle.label}</span>
  </div>
)}

          {/* Header */}
          <div
  style={{
    padding: 12,
    minHeight: PLAYER_CARD_HEADER_MIN_HEIGHT,
    position: "relative",
    overflow: "visible",
    background: "linear-gradient(to right, rgb(255, 255, 255), rgb(29, 78, 216))",
    borderBottom: "0px solid rgba(255,255,255,0.14)",
    paddingRight: 160, // keeps text clear of big jersey
    zIndex: 1,
  }}
>

            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "transparent",
                border: "none",
                color: "white",
                fontSize: 20,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <div>

              <div>
                <div style={{ fontSize: 22, fontWeight: 600, lineHeight: "22px", color: "#000000" }}>
  {p.firstName}
</div>
<div style={{ fontSize: 26, fontWeight: 900, lineHeight: "30px", marginTop: 2, color: "#000000" }}>
  {p.lastName}
</div>

                {/* Position text (no chip styling) */}
<div style={{ marginTop: 0, fontSize: 12, fontWeight: 500, opacity: 0.95, color: "#000000" }}>
  {positionLabel}
</div>

                <div
  style={{
    position: "absolute",
    left: 12,
    bottom: PLAYER_CARD_BOTTOM_LABEL_BOTTOM,
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.95,
    color: "#000000",
    zIndex: 2,
  }}
>
  {teamLabel}
</div>
              </div>

{/* Big jersey (front where possible), overlaps into stats strip */}
<div
  aria-hidden="true"
  style={{
    position: "absolute",
    right: -5,
    top: 5,
    width: 190,
    height: 190,
    zIndex: 1,          // jersey above header bg
    pointerEvents: "none",
  }}
>
  <img
  key={p.id}
  src={`/api/players/image-file?playerId=${encodePlayerImageId(p.id)}`}
  alt=""
  onError={(e) => {
    e.currentTarget.src = jerseySrcForTeam(
      normalizeTeamCodeLocal(p.teamCode),
      "front"
    );
  }}
  style={{
    width: "100%",
    height: "100%",
    objectFit: "contain",
    display: "block",
  }}
/>
</div>

            </div>
          </div>

{/* Stat strip */}
{(() => {
  const matchAvg = rounds.length ? computeAvgPoints(rounds) : 0;
  const formAvg = rounds.length ? computeFormAvg(rounds, 3) : 0;
  const total = computeTotalPoints(rounds);

  const rk = computePositionRank({
    playerId: p.id,
    posAbbrev: String(p.posAbbrev ?? "").toUpperCase(),
    roundRows: allRoundRows,
  });

  return (
    <div
      style={{
        background: "#059669",
        borderTop: "1x solid rgba(255,255,255,0)",
        borderBottom: "1px solid rgba(255,255,255,0.14)",
        padding: 10,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8,
        position: "relative",
        zIndex: 5,
      }}
    >
      <MiniStat label="Match Avg" value={rounds.length ? matchAvg.toFixed(1) : "-"} />
      <MiniStat label="Form" value={rounds.length ? formAvg.toFixed(1) : "-"} />
      <MiniStat label="Total" value={rounds.length ? String(total) : "-"} />
      <MiniStat
  label="Position Rk"
  value={rk ? String(rk.rank) : "-"}
/>
      {statSeason !== currentSeasonYear() ? (
        <div style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: 11, fontWeight: 800, opacity: 0.92, color: "white" }}>
          {statSeason} season stats until the {currentSeasonYear()} season starts
        </div>
      ) : null}

    </div>
  );
})()}

{/* Tabs + content */}
<div
  style={{
    background: "rgba(255,255,255,0.92)",
    color: "#0f172a",
    position: "relative",
    zIndex: 6,

    // ✅ fixed white section height across all tabs
    height: "48svh", //content size area
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }}
>

            <div
              style={{
                padding: 10,
                display: "grid",
                gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,

                gap: 8,
                borderBottom: "1px solid rgba(0,0,0,0.10)",
              }}
            >
              {tabs.map((t) => {
                const active = t === tab;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      width: "100%",
                      height: 28,
                      borderRadius: 10,
                      background: active ? "rgba(15, 35, 83, 0.1)" : "rgba(0,0,0,0.05)",
                      border: active
                        ? "1px solid rgba(15,23,42,0.35)"
                        : "1px solid rgba(0,0,0,0.12)",
                      color: "#0f172a",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <div
  style={{
    padding: 10,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    flex: 1,        // ✅ take remaining space in the white area
    minHeight: 0,   // ✅ important so flex scrolling works correctly
  }}
>

              {error ? (
  <TabCard>
    <div style={{ color: "#b91c1c", fontWeight: 900 }}>{error}</div>
  </TabCard>
) : loading ? (
  <TabCard>
    <div style={{ opacity: 0.7 }}>Loading…</div>
  </TabCard>
) : tab === "Results" ? (
  <ResultsTab
  rounds={rounds}
  fixtures={fixtures}
  seasonWeeks={seasonWeeks}
  lastCompletedWeek={lastCompletedWeek}  // ✅ add
  teamCode={p.teamCode}
  onOpenBreakdown={(r) => {
    setSelectedRound(r);
    setOpenBreakdown(true);
  }}
/>

) : tab === "Stats" ? (
  <StatsTab
    player={p}
    rounds={rounds}
    gamesPlayed={computed.gamesPlayed}
    starts={computed.starts}
  />

) : tab === "Fixtures" ? (
  <FixturesTab
  fixtures={upcomingFixtures}
  teamCode={p.teamCode}
  seasonWeeks={upcomingWeeks}
  lastCompletedWeek={upcomingLastCompleted}
/>

) : null

}
            </div>
          </div>

          {/* Footer actions */}
<div
  style={{
    padding: 10,
    background: "#059669",
    borderTop: "1px solid rgba(255,255,255,0.18)",
    display: "grid",
    gridTemplateColumns: `repeat(${Math.min(actions.length, 3)}, 1fr)`,
    gap: 10,
  }}
>
    {(!hideActions ? actions : []).slice(0, 3).map((a) => (

    <button
      key={a.label}
      onClick={() => {
  const isTradeAction = a.label.toLowerCase().includes("trade");

  // 🔒 trades disabled => do nothing (design stays)
  if (isTradeAction && !ENABLE_TRADES) return;

  a.onClick();
}}
      style={{
        height: 40,
        borderRadius: 12,
        background: "#059669",
        border: "2px solid rgba(255,255,255,0.9)",
        color: "white",
        fontWeight: 700,
        fontSize: 14,
        cursor: "pointer",
        width: "100%",
        whiteSpace: "nowrap",
      }}
    >
      {a.label}
    </button>
  ))}
</div>

        </div>
      </div>      
      {(() => {
  if (!openBreakdown || !selectedRound) return null;

  const wk = Number(selectedRound.week) || 0;
  const fx = fixtures.find((f) => Number(f.week) === wk);

  const isBye = !fx || fx.isBye || !fx.opponent;

  // Opponent label
  const opp = !isBye ? String(fx.opponent) : "";
  const ha = !isBye && fx?.homeAway ? ` (${fx.homeAway})` : "";
  const fixtureLabel = isBye ? "BYE" : `v ${opp}${ha}`;

  const rows = BREAKDOWN_ORDER
  .map((key) => {
    const count = Number((selectedRound.breakdown as any)?.[key]) || 0;
    const pts = getBreakdownPointsFromCount(key, count, p);

    return {
      key,
      pts,
      count,
      label: BREAKDOWN_LABELS[key] ?? key,
    };
  })
  .filter((x) => x.pts !== 0)
  .map((x) => ({
    label: x.label,
    count: formatStatCount(x.key, x.count),
    right: String(x.pts),
  }));

  return (
    <PointsBreakdownModal
  open={openBreakdown}
  onClose={() => setOpenBreakdown(false)}

  playerId={p.id}
  playerName={`${p.firstName} ${p.lastName}`}
  teamCode={p.teamCode}

  weekLabel={selectedRound ? roundLabel(selectedRound.week, statSeason) : ""}
  fixtureLabel={
    selectedRound
      ? (() => {
          const fx = fixtures.find(f => f.week === selectedRound.week);
          if (!fx) return "";
          const ha = fx.homeAway ? ` (${fx.homeAway})` : "";
          return fx.opponent ? `v ${fx.opponent}${ha}` : "BYE";
        })()
      : ""
  }

  totalPoints={selectedRound?.points ?? 0}

rows={
  selectedRound
    ? BREAKDOWN_ORDER.reduce<{ label: string; right: string; count?: string }[]>((acc, key) => {
        const count = Number((selectedRound.breakdown as any)?.[key]) || 0;
        if (!count) return acc;

        const pts = getBreakdownPointsFromCount(key, count, p);
        if (!pts) return acc;

        acc.push({
          label: BREAKDOWN_LABELS[key] ?? key,
          count: formatStatCount(key, count),
          right: String(pts),
        });

        return acc;
      }, [])
    : []
}

/>

  );
})()}

    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function computeTotalPoints(rounds: { points: number }[]) {
  return roundPoints((rounds ?? []).reduce((sum, r) => sum + (Number(r?.points) || 0), 0));
}
function computeAvgPoints(rounds: { points: number }[]) {
  const gp = rounds?.length ?? 0;
  if (!gp) return 0;
  return computeTotalPoints(rounds) / gp;
}

function computeFormAvg(rounds: { week?: number; points: number }[], lastN = 3) {
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
function computePositionRank(args: {
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
