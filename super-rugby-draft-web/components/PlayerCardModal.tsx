"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import playersData from "@/data/players.json";
import { PointsBreakdownModal } from "@/components/PointsBreakdownModal";

import { useTransactionsStore } from "@/lib/transactions/store";
import { useDraftStore } from "@/lib/draft/store";
import { useLeagueStore } from "@/lib/league/store";
import { usePlayersStore, usePlayers } from "@/lib/players/store";



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

type PlayerRoundStatsResponse =
  | { rounds: PlayerRound[] }
  | PlayerRound[];

type FixtureRow = {
  week: number;
  opponent?: string;         // undefined = bye
  homeAway?: "H" | "A";
  kickoff?: string;
  isBye?: boolean;

  // ✅ add these:
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isComplete?: boolean;
  fdr?: number | null;

};


type FixturesResponse =
  | { fixtures: FixtureRow[] }
  | FixtureRow[];
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

const POINTS_PER_EVENT: Record<string, number> = {
  tries: 15,
  tryAssists: 9,
  lineBreaks: 7,
  lineBreakAssists: 5,
  defendersBeaten: 2,
  offloads: 2,
  tackles: 1,
  tacklesMissed: -1,
  turnoversForced: 4,
  interceptions: 5,
  fiftyTwentyTwos: 10,
  penaltiesConceded: -1,
  errors: -1,
  lineoutsWon: 1,
  lineoutSteals: 5,
  lineoutErrors: -2,
  scrumsWon: 3,
  conversions: 2,
  conversionsMissed: -1,
  penaltyGoals: 3,
  penaltyGoalsMissed: -1,
  dropGoals: 3,
  dropGoalsMissed: -1,
  yellowCards: -5,
  redCards: -10,
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

const TEAM_LOGOS: Record<string, string> = {
  BLU: "/images/logos/BLU.webp",
  BRU: "/images/logos/BRU.png",
  CHI: "/images/logos/CHI.png",
  CRU: "/images/logos/CRU.png",
  DRU: "/images/logos/DRU.png",
  FOR: "/images/logos/FOR.png",
  HIG: "/images/logos/HIG.png",
  HUR: "/images/logos/HUR.png",
  MOA: "/images/logos/MOA.png",
  RED: "/images/logos/RED.png",
  WAR: "/images/logos/WAR.png",
};

const TEAM_LOGO_PLACEHOLDER = "/images/logo-placeholder.png";

function teamLogoSrc(codeOrName: string | null | undefined) {
  const code =
    normalizeTeamCodeLocal(codeOrName) ??
    String(codeOrName ?? "").toUpperCase().slice(0, 3);

  return TEAM_LOGOS[code] ?? TEAM_LOGO_PLACEHOLDER;
}


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

// =========================
// Jersey assets (same as Matchup page)
// Files live in: /public/images/jerseys
// =========================
const JERSEYS: Record<string, { angle?: string; front?: string; single?: string }> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.png", front: "/images/jerseys/BLUJerseyFront.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.png", front: "/images/jerseys/CHIJerseyFront.png" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.png", front: "/images/jerseys/CRUJerseyFront.png" },
  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.png", front: "/images/jerseys/HIGJerseyFront.png" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.png", front: "/images/jerseys/HURJerseyFront.png" },
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },

// backwards compatibility (old code)
MOP: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },

  RED: { single: "/images/jerseys/REDJersey.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};

const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.png";

function normalizeTeamCodeLocal(raw: string | null | undefined): string | null {

  const s = (raw ?? "").trim();
  if (!s) return null;

  const upper = s.toUpperCase();
// hard alias: if sheet sends MOA, use MOA; if anything sends MOP, treat as MOA
if (upper === "MOP") return "MOA";
if (upper === "MOA") return "MOA";

  // 1) direct match (already BLU/BRU/CHI/.../MOP etc)
  if (JERSEYS[upper]) return upper;

  // 2) "clean" token version for mapping
  const key = upper.replace(/\s+/g, "_").replace(/[^A-Z_]/g, "");

  const NAME_TO_CODE: Record<string, string> = {
    BLUES: "BLU",
    BRUMBIES: "BRU",
    CHIEFS: "CHI",
    CRUSADERS: "CRU",
    DRUA: "DRU",
    FIJIAN_DRUA: "DRU",
    FORCE: "FOR",
    WESTERN_FORCE: "FOR",
    HIGHLANDERS: "HIG",
    HURRICANES: "HUR",
    MOANA: "MOA",
MOANA_PASIFIKA: "MOA",
MOANAPASIFIKA: "MOA",
MOP: "MOA",     // backwards compatibility
MOA: "MOA",     // explicit
    REDS: "RED",
    WARATAHS: "WAR",
  };

  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];

  // 3) FUZZY match (this is the key missing piece)
  // Strip everything except letters so "(NZ)" "-" etc don't matter
  const lettersOnly = upper.replace(/[^A-Z]/g, "");

  if (lettersOnly.includes("MOANA")) return "MOA";
if (lettersOnly.includes("PASIFIKA")) return "MOA";


  if (lettersOnly.includes("HIGHLANDERS")) return "HIG";
  if (lettersOnly.includes("HURRICANES")) return "HUR";
  if (lettersOnly.includes("WARATAHS")) return "WAR";
  if (lettersOnly.includes("BRUMBIES")) return "BRU";
  if (lettersOnly.includes("CRUSADERS")) return "CRU";
  if (lettersOnly.includes("CHIEFS")) return "CHI";
  if (lettersOnly.includes("BLUES")) return "BLU";
  if (lettersOnly.includes("DRUA")) return "DRU";
  if (lettersOnly.includes("FORCE")) return "FOR";
  if (lettersOnly.includes("REDS")) return "RED";

  // 4) last resort: try first 3 letters
  const guess = upper.slice(0, 3);
  return JERSEYS[guess] ? guess : null;
}


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

function chipStyle(theme: ChipTheme): React.CSSProperties {
  return {
    minWidth: theme.minWidth,

    height: 28,
    padding: "0 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    background: theme.bg,
    border: `${theme.borderWidth}px solid ${theme.text}`,
    color: theme.text,
    fontWeight: 900,
    fontSize: 12,
    lineHeight: "12px",
  };
}

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

function playerGetsScrumPointsForCard(player: {
  posAbbrev?: string;
  secondaryPosAbbrev?: string;
}) {
  const a = String(player?.posAbbrev ?? "").trim().toUpperCase();
  const b = String(player?.secondaryPosAbbrev ?? "").trim().toUpperCase();
  return a === "PR" || a === "HO" || b === "PR" || b === "HO";
}

function getMinutesFantasyPoints(minutes: number) {
  if (!minutes) return 0;
  if (minutes >= 61) return 2;
  return 1;
}

function getBreakdownPointsFromCount(
  key: string,
  count: number,
  player: { posAbbrev?: string; secondaryPosAbbrev?: string }
) {
  if (!count) return 0;

  if (key === "minutesPlayed") {
    return getMinutesFantasyPoints(count);
  }

  if (key === "metresGained") {
    return Math.floor(count / 10);
  }

  if (key === "scrumsWon" && !playerGetsScrumPointsForCard(player)) {
    return 0;
  }

  const per = POINTS_PER_EVENT[key];
  if (!per) return 0;

  return count * per;
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

      const rowPoints =
        toNum(pickAny(r, ["points", "Points"])) ||
        0;

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


function pointsToCount(points: number, key: string) {
  // Special rule: metres are 1pt per 10m (floor)
  if (key === "metresGained") {
    return Math.max(0, Math.floor(points) * 10);
  }

  const per = POINTS_PER_EVENT[key];
  if (!per) return 0;

  // Example: tries points 30 / 15 = 2
  const raw = points / per;

  // most are integer events
  return Number.isFinite(raw) ? Math.round(raw) : 0;
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





export function PlayerCardModal({
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
}: {
  open?: boolean;
  player: PlayerCardPlayer | null;
  status?: PlayerStatus;
  stats?: Record<string, number>;
  

  teamLabel?: string;
  initialTab?: PlayerCardTab;
  actions?: PlayerCardAction[];
  hideActions?: boolean;
  onClose: () => void;
}) {



const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const [rounds, setRounds] = useState<PlayerRound[]>([]);
const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
const [allRoundRows, setAllRoundRows] = useState<Record<string, any>[]>([]);
const [seasonWeeks, setSeasonWeeks] = useState<number[]>([]);
const [lastCompletedWeek, setLastCompletedWeek] = useState<number>(0);


// for the Results score breakdown popup
const [openBreakdown, setOpenBreakdown] = useState(false);
const [selectedRound, setSelectedRound] = useState<PlayerRound | null>(null);

  const tabs: PlayerCardTab[] = useMemo(
  () => ["Results", "Stats", "Fixtures"],
  []
);

  const [tab, setTab] = useState<PlayerCardTab>(initialTab);
if (!open || !player) return null;


// ✅ from here onward, player is guaranteed non-null
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

      const [roundRes, fixRes] = await Promise.all([
  fetch(`/api/players/round-stats?season=2026`),
  fetch(`/api/sheets/fixtures`),
]);


      if (!roundRes.ok) throw new Error("Failed to load player stats");
      if (!fixRes.ok) throw new Error("Failed to load fixtures");

const roundJson = await roundRes.json();
const fixJson = await fixRes.json();

// /api/sheets/player-round-stats -> { ok: true, rows: [...] }
const roundRows: Record<string, any>[] = Array.isArray(roundJson?.rows) ? roundJson.rows : [];

// /api/sheets/fixtures -> { ok: true, fixtures: [...] }
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

if (!cancelled) {
  setRounds(parsedRounds);
  setFixtures(parsedFix);
  setAllRoundRows(roundRows);
  setSeasonWeeks(weeks);
  setLastCompletedWeek(lastW); // ✅ add this
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

  const positionLabel =
  (p.posName?.trim() ? p.posName.trim() : p.posAbbrev) +
  (p.secondaryPosName?.trim() ? ` / ${p.secondaryPosName.trim()}` : "");

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
  fixtures={fixtures}
  teamCode={p.teamCode}
  seasonWeeks={seasonWeeks}
  lastCompletedWeek={lastCompletedWeek} // ✅ add
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
      label: BREAKDOWN_LABELS[key] ?? key,
    };
  })
  .filter((x) => x.pts !== 0)
  .map((x) => ({
    label: x.label,
    right: String(x.pts),
  }));


  return (
    <PointsBreakdownModal
  open={openBreakdown}
  onClose={() => setOpenBreakdown(false)}

  playerId={p.id}
  playerName={`${p.firstName} ${p.lastName}`}
  teamCode={p.teamCode}

  weekLabel={selectedRound ? `Week ${selectedRound.week}` : ""}
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
    ? BREAKDOWN_ORDER.reduce<{ label: string; right: string }[]>((acc, key) => {
        const count = Number((selectedRound.breakdown as any)?.[key]) || 0;
        if (!count) return acc;

        const pts = getBreakdownPointsFromCount(key, count, p);
        if (!pts) return acc;

        acc.push({
          label: BREAKDOWN_LABELS[key] ?? key,
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
function computeGames(rounds: { points: number; minutes?: number }[]) {
  // If you track minutes, use minutes > 0. If not, just count rounds.
  return rounds?.length ?? 0;
}
function computeTotalPoints(rounds: { points: number }[]) {
  return (rounds ?? []).reduce((sum, r) => sum + (Number(r?.points) || 0), 0);
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

  const totalsById = new Map<string, number>();

  for (const r of roundRows) {
    const idRaw =
      pickAny(r, ["internalPlayerId", "internal_player_id", "InternalPlayerId"]) ||
      pickAny(r, ["playerId", "PlayerId", "playerID"]);

    const id = normaliseIdForRounds(idRaw);
    if (!id) continue;

    const rowPoints = toNum(pickAny(r, ["points", "Points"]));
    totalsById.set(id, (totalsById.get(id) ?? 0) + rowPoints);
  }

  const primaryPosById = new Map<string, string>();
  for (const pl of (playersData as any[])) {
    const id = normaliseIdForRounds(pl?.id);
    if (!id) continue;

    const pos =
      String(pl?.posAbbrev ?? pl?.position ?? pl?.pos ?? "").trim().toUpperCase();

    if (pos) primaryPosById.set(id, pos);
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

// Alias so your existing UI code works (missedRows uses perGame(...))
function perGame(rounds: any[], key: string) {
  return perGameDerived(rounds, key);
}

function TabCard({ children }: { children: ReactNode }) {

  return (
    <div
      style={{
        borderRadius: 12,
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: 12,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

function totalPointsForKey(rounds: any[], key: string) {
  return rounds.reduce((sum, r) => sum + (Number(r?.breakdown?.[key]) || 0), 0);
}

function totalDerived(rounds: any[], key: string) {
  return rounds.reduce((sum, r) => sum + (Number(r?.breakdown?.[key]) || 0), 0);
}

function perGameDerived(rounds: any[], key: string) {
  const gp = computeGames(rounds);
  if (!gp) return 0;
  return totalDerived(rounds, key) / gp;
}

function StatsTab({
  player,
  rounds,
  gamesPlayed,
  starts,
}: {
  player: {
    posAbbrev?: string;
    secondaryPosAbbrev?: string;
  };
  rounds: any[];
  gamesPlayed?: number;
  starts?: number;
}) {
  const gp =
    typeof gamesPlayed === "number" && gamesPlayed > 0
      ? gamesPlayed
      : computeGames(rounds);

  const st = typeof starts === "number" ? starts : undefined;

  // Top totals
  const triesTotal = totalDerived(rounds, "tries");
  const tryAssistsTotal = totalDerived(rounds, "tryAssists");

  // Per-game single-value rows (match screenshot order)
    const allPerGameRows: { label: string; key: string }[] = [
    { label: "Line Breaks", key: "lineBreaks" },
    { label: "Line Break Assists", key: "lineBreakAssists" },
    { label: "Defenders Beaten", key: "defendersBeaten" },
    { label: "Metres Gained", key: "metresGained" },
    { label: "Offloads", key: "offloads" },
    { label: "Tackles", key: "tackles" },
    { label: "Turnovers Forced", key: "turnoversForced" },
    { label: "Interceptions", key: "interceptions" },
    { label: "Successful 50:22s", key: "fiftyTwentyTwos" },
    { label: "Penalties Conceded", key: "penaltiesConceded" },
    { label: "Errors", key: "errors" },
    { label: "Lineouts Won", key: "lineoutsWon" },
    { label: "Lineout Steals", key: "lineoutSteals" },
    { label: "Lineout Errors", key: "lineoutErrors" },
    { label: "Scrums Won", key: "scrumsWon" },
    { label: "Conversions", key: "conversions" },
    { label: "Penalty Goals", key: "penaltyGoals" },
    { label: "Drop Goals", key: "dropGoals" },
  ];

  const shouldShowPerGameRow = (key: string) => {
    const total = totalDerived(rounds, key);

    // Only props / hookers should see scrums won
    if (key === "scrumsWon") {
      return playerGetsScrumPointsForCard(player) && total > 0;
    }

    // Only show these if non-zero
    if (
      key === "interceptions" ||
      key === "fiftyTwentyTwos" ||
      key === "lineoutsWon" ||
      key === "lineoutSteals" ||
      key === "lineoutErrors"
    ) {
      return total > 0;
    }

    // Show kicking rows if either made OR missed is non-zero
    if (key === "conversions") {
      return totalDerived(rounds, "conversions") > 0 || totalDerived(rounds, "conversionsMissed") > 0;
    }

    if (key === "penaltyGoals") {
      return totalDerived(rounds, "penaltyGoals") > 0 || totalDerived(rounds, "penaltyGoalsMissed") > 0;
    }

    if (key === "dropGoals") {
      return totalDerived(rounds, "dropGoals") > 0 || totalDerived(rounds, "dropGoalsMissed") > 0;
    }

    // Everything else stays visible
    return true;
  };

  const perGameRows = allPerGameRows.filter((r) => shouldShowPerGameRow(r.key));

  // Map which rows have "Missed"
  const missedKeyByMadeKey: Record<string, string> = {
    tackles: "tacklesMissed",
    conversions: "conversionsMissed",
    penaltyGoals: "penaltyGoalsMissed",
    dropGoals: "dropGoalsMissed",
  };

  // Totals section
  const totalRows: { label: string; key: string }[] = [
    { label: "Yellow Cards", key: "yellowCards" },
    { label: "Red Cards", key: "redCards" },
  ];

  // Formatting to match screenshot (mostly 1dp, but "-" when no games)
  function fmtPerGame(val: number) {
    if (!gp) return "-";
    // If it’s basically an integer, show 0dp? Screenshot shows decimals often, so keep 1dp always.
    return val.toFixed(1);
  }

  return (
    <TabCard>
      <div
        style={{
          display: "grid",
          gap: 0,
          borderTop: "1px solid rgba(0,0,0,0.18)", // top rule like screenshot
        }}
      >
        {/* === Top rows === */}
        <StatRow
          label="Games Played"
          right={gp ? String(gp) : "-"}
          right2={typeof st === "number" ? String(st) : "-"}
          right2Label="Starts"
        />
        <StatRow label="Tries Scored" right={triesTotal ? String(triesTotal) : "-"} />
        <StatRow label="Try Assists" right={tryAssistsTotal ? String(tryAssistsTotal) : "-"} />

        {/* divider */}
        <div style={{ height: 10 }} />

        {/* Per Game header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px",
            padding: "6px 0",
            borderBottom: "1px solid rgba(0,0,0,0.18)",
            alignItems: "end",
          }}
        >
          <div />
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.6, fontWeight: 800 }}>
            Per Game
          </div>
        </div>

        {/* === Per game rows === */}
        {perGameRows.map((r) => {
          const missedKey = missedKeyByMadeKey[r.key];
          const made = gp ? perGameDerived(rounds, r.key) : 0;

          // If it's a "missed" row, show missed underneath like screenshot
          if (missedKey) {
            const missed = gp ? perGameDerived(rounds, missedKey) : 0;

            return (
              <StatRow
                key={r.key}
                label={r.label}
                right={gp ? fmtPerGame(made) : "-"}
                subRight={gp ? fmtPerGame(missed) : "-"}

              />
            );
          }

          return (
            <StatRow
              key={r.key}
              label={r.label}
              right={gp ? fmtPerGame(made) : "-"}
            />
          );
        })}

        {/* divider */}
        <div style={{ height: 10 }} />

        {/* Total header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px",
            padding: "6px 0",
            borderBottom: "1px solid rgba(0,0,0,0.18)",
            alignItems: "end",
          }}
        >
          <div />
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.6, fontWeight: 800 }}>
            Total
          </div>
        </div>

        {/* === Totals === */}
        {totalRows.map((r) => (
          <StatRow
            key={r.key}
            label={r.label}
            right={String(totalDerived(rounds, r.key) || "-")}
          />
        ))}
      </div>
    </TabCard>
  );
}

/**
 * Single row component matching screenshot:
 * - left label
 * - right value
 * - optional second right value (for Starts)
 * - optional small "Missed x" under the right value
 */
function StatRow({
  label,
  right,
  subRight,
  right2,
  right2Label,
}: {
  label: string;
  right: string;
  subRight?: string;      // number only, e.g. "3.5" or "-"
  right2?: string;        // starts value
  right2Label?: string;   // "Starts"
}) {
  const hasThirdCol = typeof right2 === "string" || !!subRight;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: hasThirdCol ? "1fr 56px 90px" : "1fr 90px",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.18)",
        alignItems: "center",
      }}
    >
      {/* label */}
      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>{label}</div>

      {/* main value */}
      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
        {right}
      </div>

      {/* third column: Starts OR Missed (inline, same row) */}
      {typeof right2 === "string" ? (
        <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
          <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 800, marginRight: 16 }}>
            {right2Label ?? ""}
          </span>
          {right2}
        </div>
      ) : subRight ? (
        <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
          <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 800, marginRight: 16 }}>
            Missed
          </span>
          {subRight}
        </div>
      ) : null}
    </div>
  );
}





function StatLine({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 60px", gap: 8 }}>
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ textAlign: "right" }}>{left}</div>
      <div style={{ textAlign: "right", opacity: 0.6 }}>{right}</div>
    </div>
  );
}
function ResultsTab({
  rounds,
  fixtures,
  seasonWeeks,
  lastCompletedWeek,
  teamCode,
  onOpenBreakdown,
}: {
  rounds: any[];
  fixtures: FixtureRow[];
  seasonWeeks: number[];
  lastCompletedWeek: number; // ✅ add
  teamCode: string;
  onOpenBreakdown: (r: any) => void;
}) {

  // Map player rounds by week so we can show "-" if they didn't play
  const roundByWeek = useMemo(() => {
    const m = new Map<number, any>();
    for (const r of rounds ?? []) {
      const w = Number(r?.week) || 0;
      if (w > 0) m.set(w, r);
    }
    return m;
  }, [rounds]);

  // Map team fixtures by week so we can show opponent/bye
  const fixtureByWeek = useMemo(() => {
    const m = new Map<number, FixtureRow>();
    for (const f of fixtures ?? []) {
      const w = Number(f?.week) || 0;
      if (w > 0) m.set(w, f);
    }
    return m;
  }, [fixtures]);

  // Build one row per season week
const rows = useMemo(() => {


  // ✅ Only show weeks up to last completed week
  const weeks = (seasonWeeks ?? [])
    .map((w) => Number(w) || 0)
    .filter((w) => w > 0 && w <= lastCompletedWeek)
    .sort((a, b) => b - a);

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
    RED: "Reds",
    WAR: "Waratahs",
  };

  return weeks.map((w) => {
    const fx = fixtureByWeek.get(w);
    const isBye = !fx || !fx.opponent;

    const oppCode = isBye ? "" : String(fx.opponent);
    const oppName = TEAM_NAME_BY_CODE[oppCode] ?? oppCode;
    const ha = isBye ? "" : fx.homeAway ? ` (${fx.homeAway})` : "";

    const r = roundByWeek.get(w) ?? null;

    let gameScoreLabel = "";
    if (fx && !isBye) {
      const hs = fx.homeScore;
      const as = fx.awayScore;

      const hasScore =
        hs != null &&
        as != null &&
        Number.isFinite(Number(hs)) &&
        Number.isFinite(Number(as));

      if (hasScore) {
        gameScoreLabel = fx.homeAway === "A" ? `${as} - ${hs}` : `${hs} - ${as}`;
      }
    }

    return {
      week: w,
      opponentLabel: isBye ? "BYE" : `v ${oppName}${ha}`,
      gameScoreLabel,
      isBye,
      oppCode: isBye ? null : oppCode,
      round: r,
    };
  });
}, [fixtures, seasonWeeks, fixtureByWeek, roundByWeek]);




  if (!rows.length) return <TabCard>No results yet.</TabCard>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => {
  if (row.isBye) {
    return (
      <div
        key={`wk${row.week}`}
        style={{
          borderRadius: 12,
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          padding: 10,
          display: "grid",
          gridTemplateColumns: "34px 1fr",
          gap: 10,
          alignItems: "center",
          fontSize: 12,
          fontWeight: 900,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", opacity: 0.6 }}>
          {row.week}
        </div>
        <div style={{ opacity: 0.75 }}>BYE</div>
      </div>
    );
  }

  const hasPlayed = !!row.round;
  const pts = hasPlayed ? (row.round.points ?? 0) : null;

  return (
    <div
      key={`wk${row.week}`}
      style={{
        borderRadius: 12,
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: 10,
        display: "grid",
        gridTemplateColumns: "34px 1fr 40px",
        gap: 10,
        alignItems: "center",
        fontSize: 12,
        fontWeight: 900,
      }}
    >
          
            {/* week number (far left) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
  <div style={{ opacity: 0.6 }}>{row.week}</div>
  {row.oppCode ? (
    <img
      src={teamLogoSrc(row.oppCode)}
      alt=""
      draggable={false}
      style={{ width: 20, height: 20, objectFit: "contain", display: "block" }}
    />
  ) : null}
</div>


            {/* opponent / bye */}
            <div style={{ opacity: 0.75 }}>
  <div>{row.opponentLabel}</div>
  {row.gameScoreLabel ? (
    <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
      {row.gameScoreLabel}
    </div>
  ) : null}
</div>


            {/* points (hidden on BYE rows) */}
{row.isBye ? null : (
  <button
    onClick={() => {
      if (hasPlayed) onOpenBreakdown(row.round);
    }}
    disabled={!hasPlayed}
    style={{
      height: 32,
      borderRadius: 10,
      background: hasPlayed ? "rgba(5,150,105,0.12)" : "rgba(15,23,42,0.06)",
      border: hasPlayed
        ? "1px solid rgba(5,150,105,0.35)"
        : "1px solid rgba(0,0,0,0.10)",
      fontWeight: 900,
      cursor: hasPlayed ? "pointer" : "default",
      opacity: hasPlayed ? 1 : 0.8,
    }}
  >
    {hasPlayed ? String(pts) : "-"}
  </button>
)}

          </div>
        );
      })}
    </div>
  );
}
function fdrTheme(val: number | null) {
  // Adjust these colours to EXACTLY match your Fixtures page FDR tab if needed
  if (val == null) return { bg: "rgba(15,23,42,0.06)", border: "rgba(0,0,0,0.10)", text: "#0f172a" };

  if (val === 1) return { bg: "#375523", text: "white" };   // green
  if (val === 2) return { bg: "#01FC7A", text: "#000000" };   // green
  if (val === 3) return { bg: "#E7E7E7", text: "#000000" };   // amber
  if (val === 4) return { bg: "#FF1751", text: "white" };   // green
  return { bg: "#80072D", text: "white" };                   // red
}



function fdrText(rating: number) {
  return rating === 1 || rating === 4 || rating === 5
    ? "white"
    : "#0f172a";
}

function formatKickoffLocal(input: any): string {
  if (!input) return "";

  // Works best if input is an ISO string (e.g. "2026-02-22T02:35:00Z")
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input); // fallback if it's not parseable

  // Viewer’s local timezone is used by default (no timeZone option)
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d);
  const day = new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(d);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(d);

  const time = d
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" ", "")    // "10:35 am" -> "10:35am"
    .toLowerCase();

  return `${weekday} ${day} ${month} ${time}`;
}

function FixturesTab({
  fixtures,
  teamCode,
  seasonWeeks,
  lastCompletedWeek,
}: {
  fixtures: FixtureRow[];
  teamCode: string;
  seasonWeeks: number[];
  lastCompletedWeek: number; // ✅ add
}) {

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
    RED: "Reds",
    WAR: "Waratahs",
  };


  // Weeks AFTER the last completed week (upcoming period)
  const weeksToShow = useMemo(() => {
  return (seasonWeeks ?? [])
    .map((w) => Number(w) || 0)
    .filter((w) => w > lastCompletedWeek)
    .sort((a, b) => a - b);
}, [seasonWeeks, lastCompletedWeek]);


  // Map non-complete fixtures by week (upcoming fixtures)
  const upcomingByWeek = useMemo(() => {
    const m = new Map<number, FixtureRow>();
    for (const f of fixtures ?? []) {
      const w = Number(f?.week) || 0;
      if (w > 0 && !f?.isComplete) m.set(w, f);
    }
    return m;
  }, [fixtures]);

  if (!weeksToShow.length) return <TabCard>No upcoming fixtures.</TabCard>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {weeksToShow.map((w) => {
        const fx = upcomingByWeek.get(w);
        const isBye = !fx || fx.isBye || !fx.opponent;


        // ✅ BYE rows: ONLY week + BYE
        if (isBye) {
          return (
            <div
              key={`wk${w}`}
              style={{
                borderRadius: 12,
                background: "white",
                border: "1px solid rgba(0,0,0,0.08)",
                padding: 10,
                display: "grid",
                gridTemplateColumns: "34px 1fr",
                gap: 10,
                alignItems: "center",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", opacity: 0.6 }}>
                {w}
              </div>
              <div style={{ opacity: 0.75 }}>BYE</div>
            </div>
          );
        }

        const oppCode = String(fx.opponent);
        const oppName = TEAM_NAME_BY_CODE[oppCode] ?? oppCode;
        const ha = fx.homeAway ? ` (${fx.homeAway})` : "";
        const opponentLabel = `v ${oppName}${ha}`;

        const fdrValRaw = fx.fdr;
        const fdrVal =
          fdrValRaw == null || !Number.isFinite(Number(fdrValRaw)) ? null : Number(fdrValRaw);

        return (
          <div
            key={`wk${fx.week}`}
            style={{
              borderRadius: 12,
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              display: "grid",
              gridTemplateColumns: "34px 1fr 56px",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {/* week number + opponent logo (same as Results) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ opacity: 0.6 }}>{fx.week}</div>
              {oppCode ? (
                <img
                  src={teamLogoSrc(oppCode)}
                  alt=""
                  draggable={false}
                  style={{ width: 20, height: 20, objectFit: "contain", display: "block" }}
                />
              ) : null}
            </div>

            {/* opponent + kickoff */}
            <div style={{ opacity: 0.75 }}>
              <div>{opponentLabel}</div>
              {fx.kickoff ? (
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                  {formatKickoffLocal(fx.kickoff)}
                </div>
              ) : null}
            </div>

            {/* FDR box (unchanged) */}
            {(() => {
              const theme = fdrTheme(fdrVal);

              return (
                <div
                  style={{
                    height: 32,
                    borderRadius: 10,
                    background: theme.bg,
                    color: theme.text,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 950,
                    width: 50,
                    justifySelf: "end",
                  }}
                >
                  {fdrVal != null ? String(fdrVal) : "-"}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
