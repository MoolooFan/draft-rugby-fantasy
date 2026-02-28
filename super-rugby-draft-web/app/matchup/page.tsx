"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getActiveUser, getActiveUsername } from "@/lib/session";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";


import fixturesData from "@/data/fixtures-2026.json";
import type { Fixture } from "@/lib/fixtures/types";

import { AppMenu } from "@/components/AppMenu";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";

import { PlayerCardModal } from "@/components/PlayerCardModal";
import { PointsBreakdownModal } from "@/components/PointsBreakdownModal";
import { usePlayersStore } from "@/lib/players/store";
import { useRequireSession } from "@/lib/session/useRequireSession";
// =========================
// Jersey assets (Matchup page uses ANGLED if available)
// Files live in: /public/images/jerseys
// =========================
const JERSEYS: Record<
  string,
  { angle?: string; front?: string; single?: string }
> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.png", front: "/images/jerseys/BLUJerseyFront.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.png", front: "/images/jerseys/CHIJerseyFront.png" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.png", front: "/images/jerseys/CRUJerseyFront.png" },
  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.png", front: "/images/jerseys/HIGJerseyFront.png" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.png", front: "/images/jerseys/HURJerseyFront.png" },
  MOP: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },
  RED: { single: "/images/jerseys/REDJersey.png" },
    MOA: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};

const JERSEY_PLACEHOLDER: string | null = null;
function pickValue(row: any, candidates: string[]) {
  if (!row || typeof row !== "object") return null;

  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const keyMap = new Map<string, string>();
  for (const k of Object.keys(row)) keyMap.set(norm(k), k);

  for (const c of candidates) {
    const k = keyMap.get(norm(c));
    if (k != null) {
      const v = (row as any)[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return null;
}


function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function rowPlayerId(row: any) {
  return pickValue(row, ["playerId", "Player ID", "player_id", "id"]);
}

function rowRound(row: any) {
  const v = pickValue(row, ["round", "Round", "week", "Week"]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}


// ✅ sheet already contains POINTS per column → sum them
function calcFantasyPoints(row: any): number {
  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const POINT_COLUMNS = [
    "Minutes played",
    "Tries",
    "Try Assists",
    "Linebreaks",
    "Linebreak assists",
    "Defenders beaten",
    "Carries (m)",
    "Offloads",
    "Tackles",
    "Missed tackles",
    "Turnover Forced",
    "Interceptions",
    "50:22 Kicks",
    "Penalties Conceded",
    "Errors",
    "Lineouts won",
    "Lineout steals",
    "Lineout errors",
    "Scrums won outright",
    "Conversions",
    "Conversions missed",
    "Penalty scored",
    "Penalty missed",
    "Drop goal scored",
    "Drop goal missed",
    "Yellow cards",
    "Red cards",
  ];

  let pts = 0;
  for (const col of POINT_COLUMNS) pts += toNumber(pickValue(row, [col]));
  return pts;
}

// Build breakdown rows for PointsBreakdownModal (matches Row: { label, right })
function buildBreakdownRows(row: any): Array<{ label: string; right?: string }> {
  const POINT_COLUMNS = [
    "Minutes played",
    "Tries",
    "Try Assists",
    "Linebreaks",
    "Linebreak assists",
    "Defenders beaten",
    "Carries (m)",
    "Offloads",
    "Tackles",
    "Missed tackles",
    "Turnover Forced",
    "Interceptions",
    "50:22 Kicks",
    "Penalties Conceded",
    "Errors",
    "Lineouts won",
    "Lineout steals",
    "Lineout errors",
    "Scrums won outright",
    "Conversions",
    "Conversions missed",
    "Penalty scored",
    "Penalty missed",
    "Drop goal scored",
    "Drop goal missed",
    "Yellow cards",
    "Red cards",
  ];

  const toNum = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  return POINT_COLUMNS.map((col) => {
    const v = pickValue(row, [col]);
    return { label: col, right: String(toNum(v)) };
  });
}
/**
 * Your Player currently uses `teamCode` for fixture matching in some places
 * (sometimes a full team name), and in other places you use abbreviations.
 * This makes jersey lookup tricky, so we normalize to a 3-letter code.
 */
function normalizeTeamCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const upper = s.toUpperCase();

  // Already a valid code?
  if (JERSEYS[upper]) return upper;

  // Common name -> code fallbacks (edit these names to match your fixtures JSON)
  const NAME_TO_CODE: Record<string, string> = {
    BLUES: "BLU",
    BLUESRUGBY: "BLU",

    BRUMBIES: "BRU",

    CHIEFS: "CHI",

    CRUSADERS: "CRU",

    DRUA: "DRU",
    FIJIAN_DRUA: "DRU",
    FIJIANDRUA: "DRU",

    FORCE: "FOR",
    WESTERN_FORCE: "FOR",
    WESTERNFORCE: "FOR",

    HIGHLANDERS: "HIG",

    HURRICANES: "HUR",

    MOA: "MOA",
    MOP: "MOA",
    MOANA: "MOP",
    MOANA_PASIFIKA: "MOA",
    MOANAPASIFIKA: "MOA",

    REDS: "RED",
    QUEENSLAND_REDS: "RED",
    QUEENSLANDREDS: "RED",

    WARATAHS: "WAR",
    NSW_WARATAHS: "WAR",
    NSWWARATAHS: "WAR",
  };

  // Normalize spaces/underscores to help matching
  const key = upper.replace(/\s+/g, "_").replace(/[^A-Z_]/g, "");
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];

  // Last fallback: first 3 letters (only if it exists in JERSEYS)
  const guess = upper.slice(0, 3);
  return JERSEYS[guess] ? guess : null;
}

function jerseySrcForTeam(
  code: string | null,
  prefer: "angle" | "front" = "angle"
): string | null {
  if (!code) return null;
  const j = JERSEYS[code];
  if (!j) return null;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? null;
  return j.front ?? j.single ?? j.angle ?? null;
}

function jerseySrcForPlayer(
  p: { teamCode: string } | null,
  prefer: "angle" | "front" = "angle"
): string | null {
  const code = normalizeTeamCode(p?.teamCode);
  return jerseySrcForTeam(code, prefer);
}

type TeamRecord = { w: number; l: number; d: number };
type Streak = { type: "W" | "L"; n: number } | null;

// --- Types (match your Team Selection page) ---
type SlotId =
  | "prop1" | "hooker1" | "prop2"
  | "lock1" | "lock2"
  | "looseforward1" | "looseforward2" | "looseforward3"
  | "halfback1" | "flyhalf1"
  | "centre1" | "centre2"
  | "outsideback1" | "outsideback2" | "outsideback3"
  | "bench1" | "bench2" | "bench3" | "bench4" | "bench5";

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string | null;
  posName: string;
  secondaryPosName?: string | null;
};

type Lineup = Record<SlotId, Player | null>;

type LockedSnapshot = {
  week: number;
  teamId: string;
  lockedAtMs: number;
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
};

type AnyFixture = Fixture & {
  id: string;
  week: number;
  kickoffAt: string | number;
  status?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};


function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

function isFixtureComplete(f: AnyFixture) {
  const s = (f.status ?? "").toLowerCase();

  // your fixtures-2026.json uses "final"
  if (s === "final" || s === "complete") return true;

  // still treat it as complete if both scores exist
  if (f.homeScore != null && f.awayScore != null) return true;

  return false;
}





function abbrevTeam(name: string) {
  const s = (name ?? "").trim();
  return s ? s.slice(0, 3).toUpperCase() : "TBD";
}

// Storage keys (must match Team Selection page)
function matchupSnapshotKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_snapshot_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

// ---- Team Selection localStorage keys (must match Team Selection page) ----
function teamSelectionLineupKey(leagueId: string | null, teamId: string | null) {
  return `ts_lineup_${leagueId ?? "no-league"}_${teamId ?? "no-team"}`;
}

function teamSelectionCapsBase(leagueId: string | null, teamId: string | null) {
  return `ts_caps_${leagueId ?? "no-league"}_${teamId ?? "no-team"}`;
}

function readTeamSelectionLineup(leagueId: string | null, teamId: string | null): Lineup | null {
  if (typeof window === "undefined") return null;
  if (!leagueId || !teamId) return null;

  const raw = window.localStorage.getItem(teamSelectionLineupKey(leagueId, teamId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // basic shape check (prevents accidentally reading roster shapes)
    const ok =
      parsed &&
      typeof parsed === "object" &&
      "prop1" in parsed &&
      "bench5" in parsed;

    return ok ? (parsed as Lineup) : null;
  } catch {
    return null;
  }
}

function readTeamSelectionCaps(leagueId: string | null, teamId: string | null) {
  if (typeof window === "undefined") return { captainId: null as string | null, viceId: null as string | null };
  if (!leagueId || !teamId) return { captainId: null, viceId: null };

  const base = teamSelectionCapsBase(leagueId, teamId);
  const captainId = window.localStorage.getItem(`${base}_captain`);
  const viceId = window.localStorage.getItem(`${base}_vice`);
  return { captainId: captainId || null, viceId: viceId || null };
}

function teamSelectionFallbackSnapshot(
  leagueId: string | null,
  displayWeek: number,
  teamId: string | null
): LockedSnapshot | null {
  if (typeof window === "undefined") return null;
  if (!leagueId || !teamId) return null;
  if (displayWeek <= 0) return null;

  const lineup = readTeamSelectionLineup(leagueId, teamId);
  if (!lineup) return null;

  const { captainId, viceId } = readTeamSelectionCaps(leagueId, teamId);

  return {
    week: displayWeek,
    teamId,
    lockedAtMs: 0,
    lineup,
    captainId,
    viceId,
  };
}



function useNowTick(ms = 1000) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return Date.now();
}

export default function MatchupPage() {
  useRequireSession();
  const router = useRouter();



  const [menuOpen, setMenuOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
const [pointsOpen, setPointsOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
const [selectedOwned, setSelectedOwned] = useState(false);
const [selectedSide, setSelectedSide] = useState<"left" | "right">("left");
const [selectedFixtureLabel, setSelectedFixtureLabel] = useState<string>("—");
const [selectedRows, setSelectedRows] = useState<Array<{ label: string; right?: string }>>([]);

  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useLeagueStore((s) => s.activeLeague());
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  const userId = useMemo(() => getActiveUsername(), []);
  
type SheetFixtureRow = {
  season: number;
  weekFantasy: number;
  weekReal: number | null;
  label: string | null;
  kind: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: string; // upcoming | complete
  homeScore: number | null;
  awayScore: number | null;
};

const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

useEffect(() => {
  if (!activeLeague?.id) return;

  const season = 2026;
  fetch(`/api/fixtures/leagueMatches?season=${season}`)
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id]);

function isSheetLabelRow(r: SheetFixtureRow) {
  return !!r.label || String(r.kind ?? "").toLowerCase() === "label";
}

function isCompletedPlayableRow(r: SheetFixtureRow) {
  if (isSheetLabelRow(r)) return false;
  const st = String(r.status ?? "").toLowerCase();
  if (st !== "complete") return false;
  // Needs 2 teams to count as a match
  if (!r.homeTeamId || !r.awayTeamId) return false;
  // Needs scores to determine W/L/D
  if (r.homeScore == null || r.awayScore == null) return false;
  return true;
}

function outcomeForTeam(match: SheetFixtureRow, teamId: string): "W" | "L" | "D" | null {
  const homeId = match.homeTeamId!;
  const awayId = match.awayTeamId!;
  const hs = match.homeScore!;
  const as = match.awayScore!;

  if (teamId !== homeId && teamId !== awayId) return null;

  if (hs === as) return "D";
  const teamIsHome = teamId === homeId;
  const teamWon = teamIsHome ? hs > as : as > hs;
  return teamWon ? "W" : "L";
}

const lastCompletedWeek = useMemo(() => {
  if (!sheetFixtures.length) return (activeLeague?.currentWeek ?? 1) - 1;
  return latestCompletedWeekFromSheet();
}, [sheetFixtures, activeLeague?.currentWeek]);

const recordByTeamId = useMemo(() => {
  const map = new Map<string, TeamRecord>();
  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, { w: 0, l: 0, d: 0 });
    return map.get(id)!;
  };

  // Completed matches up to lastCompletedWeek
  const rows = sheetFixtures
    .filter(isCompletedPlayableRow)
    .filter((r) => Number(r.weekFantasy) <= lastCompletedWeek);

  for (const m of rows) {
    const homeId = m.homeTeamId!;
    const awayId = m.awayTeamId!;
    const hs = m.homeScore!;
    const as = m.awayScore!;

    const home = ensure(homeId);
    const away = ensure(awayId);

    if (hs > as) { home.w += 1; away.l += 1; }
    else if (as > hs) { away.w += 1; home.l += 1; }
    else { home.d += 1; away.d += 1; }
  }

  return map;
}, [sheetFixtures, lastCompletedWeek]);

const streakByTeamId = useMemo(() => {
  const map = new Map<string, Streak>();

  // For streaks, we need each team’s results in chronological order
  const rows = sheetFixtures
    .filter(isCompletedPlayableRow)
    .filter((r) => Number(r.weekFantasy) <= lastCompletedWeek)
    .slice()
    .sort((a, b) => {
      // stable order: week asc, then sheet order is already preserved normally
      return Number(a.weekFantasy) - Number(b.weekFantasy);
    });

  const resultsByTeam = new Map<string, Array<"W" | "L" | "D">>();

  const push = (teamId: string, res: "W" | "L" | "D") => {
    if (!resultsByTeam.has(teamId)) resultsByTeam.set(teamId, []);
    resultsByTeam.get(teamId)!.push(res);
  };

  for (const m of rows) {
    const homeId = m.homeTeamId!;
    const awayId = m.awayTeamId!;
    const homeRes = outcomeForTeam(m, homeId);
    const awayRes = outcomeForTeam(m, awayId);
    if (homeRes) push(homeId, homeRes);
    if (awayRes) push(awayId, awayRes);
  }

  for (const [teamId, arr] of resultsByTeam.entries()) {
    if (!arr.length) { map.set(teamId, null); continue; }

    // streak ignores D (your UI currently shows (-) when no streak)
    // If last result is D => no streak
    const last = arr[arr.length - 1];
    if (last === "D") { map.set(teamId, null); continue; }

    let n = 1;
    for (let i = arr.length - 2; i >= 0; i--) {
      if (arr[i] === last) n++;
      else break;
    }
    map.set(teamId, { type: last, n });
  }

  return map;
}, [sheetFixtures, lastCompletedWeek]);

function isSheetPlayableRow(r: SheetFixtureRow) {
  // “playable” = an actual matchup row (regular/playoffs/consolation), not the header label rows
  return !isSheetLabelRow(r);
}

function isFantasyWeekCompleteFromSheet(weekNo: number) {
  const rows = sheetFixtures.filter((r) => Number(r.weekFantasy) === weekNo && isSheetPlayableRow(r));
  if (rows.length === 0) return false;
  return rows.every((r) => String(r.status ?? "").toLowerCase() === "complete");
}



function latestCompletedWeekFromSheet() {
  const weeks = Array.from(
    new Set(
      sheetFixtures
        .filter(isSheetPlayableRow)
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  let latest = 0;
  for (const w of weeks) {
    if (isFantasyWeekCompleteFromSheet(w)) latest = w;
  }
  return latest;
}

function currentWeekFromSheet() {
  // current week = first non-complete playable week
  const weeks = Array.from(
    new Set(
      sheetFixtures
        .filter(isSheetPlayableRow)
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  for (const w of weeks) {
    if (!isFantasyWeekCompleteFromSheet(w)) return w;
  }
  // if everything complete, fallback to latest complete
  return latestCompletedWeekFromSheet() || 1;
}

  // Your team id (league team)
  const yourLeagueTeamId = useMemo(() => {
    const l = activeLeague;
    if (!l) return null;
    if (userId) {
      const t = l.teams.find((x) => x.userId === userId);
      if (t) return t.id;
    }
    return l.teams[0]?.id ?? null;
  }, [activeLeague, userId]);

  // Draft teams for name lookup
  const draftTeams = useDraftStore((s) => s.teams);
const getLivePlayerById = useDraftStore((s) => (s as any).getLivePlayerById ?? null);

  const nameByTeamId = (id: string | null) => {
    if (!id) return "BYE";
    return draftTeams.find((t) => t.id === id)?.name
      ?? activeLeague?.teams.find((t) => t.id === id)?.name
      ?? "TBC";
  };

  // --- Determine "current week" and deadline from fixtures JSON ---
  const fixtures = useMemo(() => fixturesData as AnyFixture[], []);
  const normalizedFixtures = useMemo(() => {
    return fixtures
      .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
      .sort((a, b) => (a as any).kickoffMs - (b as any).kickoffMs);
  }, [fixtures]);


  const nowMs = useNowTick(10_000);

// 1) The week we are currently selecting for (drives the deadline)
const selectionWeek = useMemo(() => {
  if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
  return currentWeekFromSheet(); // first non-complete week from sheet
}, [sheetFixtures, activeLeague?.currentWeek]);

const startRound = activeLeague?.startRound ?? 1;

// Deadline is for the SELECTION week (not the displayed week)
const selectionRealRound = useMemo(
  () => fantasyWeekToRealRound(startRound, selectionWeek),
  [startRound, selectionWeek]
);

const deadlineMs = useMemo(() => {
  const wk = normalizedFixtures.filter((f) => f.week === selectionRealRound);
  if (!wk.length) return 0;

  const firstKickoff = Math.min(...wk.map((f) => (f as any).kickoffMs));
  if (!Number.isFinite(firstKickoff) || firstKickoff <= 0) return 0;

  return selectionDeadlineFromFirstKickoff(firstKickoff);
}, [normalizedFixtures, selectionRealRound]);

const deadlineLocked = deadlineMs ? nowMs >= deadlineMs : false;

// 2) The week the Matchup page should DISPLAY
// - before deadline: previous week
// - after deadline: selection week
const displayWeek = useMemo(() => {
  const w = deadlineLocked ? selectionWeek : selectionWeek - 1;
  return w; // can be 0 (pre-season state) – we handle that below
}, [deadlineLocked, selectionWeek]);

// The round used for POINTS + fixture tags should match the DISPLAY week
const displayRealRound = useMemo(() => {
  if (displayWeek <= 0) return 0;
  return fantasyWeekToRealRound(startRound, displayWeek);
}, [startRound, displayWeek]);

// For lineup-blanking: previous weeks are always "locked"
const displayLocked = useMemo(() => {
  if (displayWeek <= 0) return false;
  return displayWeek < selectionWeek ? true : deadlineLocked;
}, [displayWeek, selectionWeek, deadlineLocked]);


  // --- Live sheet data (must be inside component) ---
const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
const sheetPlayers = usePlayersStore((s) => s.players);
const roundRows = usePlayersStore((s) => s.roundRows);

useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);

const sheetPlayerById = useMemo(() => {
  const m = new Map<string, any>();
  for (const p of sheetPlayers ?? []) {
    const draftLikeId =
      pickValue(p, ["id", "draftId", "draft_id", "Draft ID", "playerKey"]) ?? null;

    const sheetPid =
      pickValue(p, ["playerId", "player_id", "player id", "Player ID", "id"]) ?? null;

    if (draftLikeId != null) m.set(normaliseId(draftLikeId), p);
    if (sheetPid != null) m.set(normaliseId(sheetPid), p);
  }
  return m;
}, [sheetPlayers]);

function getPlayerSheetId(p: Player | null) {
  if (!p) return null;

  const sheetPlayer = sheetPlayerById.get(normaliseId(p.id));
  const sheetPid =
    pickValue(sheetPlayer, ["playerId", "player_id", "player id", "Player ID", "id"]) ?? null;

  if (sheetPid != null) return normaliseId(sheetPid);
  return normaliseId(p.id); // fallback
}

const weekPointsByPlayerId = useMemo(() => {
  const m = new Map<string, number>();

  for (const row of roundRows ?? []) {
  if (rowRound(row) !== displayRealRound) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = normaliseId(pidRaw);
    m.set(pid, calcFantasyPoints(row));
  }

  return m;
}, [roundRows, displayRealRound]);


const weekMinutesByPlayerId = useMemo(() => {
  const m = new Map<string, number>();

  for (const row of roundRows ?? []) {
    if (rowRound(row) !== displayRealRound) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = normaliseId(pidRaw); // keep this

    // Pull the "Minutes played" column (same header you used in calcFantasyPoints)
    const minRaw = pickValue(row, ["Minutes played", "minutes played", "Minutes Played", "minutes"]);
    const mins = Number(minRaw);
    m.set(pid, Number.isFinite(mins) ? mins : 0);
  }

  return m;
}, [roundRows, displayRealRound]);

function pointsForPlayer(p: Player | null) {
  const pid = getPlayerSheetId(p);
  if (!pid) return 0;
  return weekPointsByPlayerId.get(pid) ?? 0;
}

function minutesForPlayer(p: Player | null) {
  if (!p) return 0;

  // Prefer the sheet's actual playerId (same ids used in roundRows)
  const sheetPlayer = sheetPlayerById.get(normaliseId(p.id));
  const sheetPid =
    pickValue(sheetPlayer, ["playerId", "player_id", "player id", "Player ID", "id"]) ?? null;

  const key = normaliseId(sheetPid ?? p.id);
  return weekMinutesByPlayerId.get(key) ?? 0;
}

const matchupsThisWeek = useMemo(() => {
  if (!sheetFixtures.length) return [];
  if (displayWeek <= 0) return [];

  return sheetFixtures
    .filter((r) => Number(r.weekFantasy) === displayWeek)
    .filter(isSheetPlayableRow)
    .map((r) => ({
      weekNo: displayWeek,
      homeTeamId: r.homeTeamId ?? null,
      awayTeamId: r.awayTeamId ?? null,
      kind: (r.kind ?? "").toLowerCase() || "regular",
      label: r.label ?? null,
      status: (r.status ?? "upcoming").toLowerCase(),
    }));
}, [sheetFixtures, displayWeek]);

  // Which matchup is currently being viewed (arrows)
  const defaultIndex = useMemo(() => {
    if (!yourLeagueTeamId) return 0;
    const idx = matchupsThisWeek.findIndex(
      (m) => m.homeTeamId === yourLeagueTeamId || m.awayTeamId === yourLeagueTeamId
    );
    return idx >= 0 ? idx : 0;
  }, [matchupsThisWeek, yourLeagueTeamId]);

  const [matchupIdx, setMatchupIdx] = useState(0);

  const [tsTick, setTsTick] = useState(0);

useEffect(() => {
  // refresh when tab gains focus (covers "save in another page then come back")
  const onFocus = () => setTsTick((x) => x + 1);
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}, []);

  useEffect(() => setMatchupIdx(defaultIndex), [defaultIndex]);

  useEffect(() => {
  if (matchupIdx >= matchupsThisWeek.length) setMatchupIdx(0);
}, [matchupIdx, matchupsThisWeek.length]);

  const matchup = matchupsThisWeek[matchupIdx] ?? null;

// Default from schedule (home vs away)
let leftTeamId = matchup?.homeTeamId ?? null;
let rightTeamId = matchup?.awayTeamId ?? null;

// ✅ If this matchup includes YOUR team, force YOUR team to be on the left
if (yourLeagueTeamId && (leftTeamId === yourLeagueTeamId || rightTeamId === yourLeagueTeamId)) {
  if (rightTeamId === yourLeagueTeamId) {
    // swap
    const tmp = leftTeamId;
    leftTeamId = rightTeamId;
    rightTeamId = tmp;
  }
}

type PosGroup = "PROP" | "HOOKER" | "LOCK" | "LOOSE" | "HB" | "FH" | "CENTRE" | "OB" | "WC";

const SLOT_GROUP: Record<SlotId, PosGroup> = {
  prop1: "PROP",
  hooker1: "HOOKER",
  prop2: "PROP",
  lock1: "LOCK",
  lock2: "LOCK",
  looseforward1: "LOOSE",
  looseforward2: "LOOSE",
  looseforward3: "LOOSE",
  halfback1: "HB",
  flyhalf1: "FH",
  centre1: "CENTRE",
  centre2: "CENTRE",
  outsideback1: "OB",
  outsideback2: "OB",
  outsideback3: "OB",
  bench1: "WC",
  bench2: "WC",
  bench3: "WC",
  bench4: "WC",
  bench5: "WC",
};

function canPlayerFitGroup(player: Player, group: PosGroup) {
  if (group === "WC") return true;

  const primary = (player.posAbbrev ?? "").toUpperCase();
  const secondary = (player.secondaryPosAbbrev ?? "").toUpperCase();
  const either = (fn: (p: string) => boolean) => fn(primary) || fn(secondary);

  if (group === "PROP") return either((p) => p.includes("PROP") || p === "PR");
  if (group === "HOOKER") return either((p) => p.includes("HOOK") || p === "HO");
  if (group === "LOCK") return either((p) => p.includes("LOCK") || p === "LK");
  if (group === "LOOSE") return either((p) => p.includes("LOOSE") || p === "LF");
  if (group === "HB") return either((p) => p.includes("HALF") || p === "HB");
  if (group === "FH") return either((p) => p.includes("FLY") || p === "FH");
  if (group === "CENTRE") return either((p) => p.includes("CENTRE") || p === "CE");
  if (group === "OB") return either((p) => p.includes("OUT") || p.includes("BACK") || p === "OB");

  return false;
}

const STARTER_SLOTS: SlotId[] = [
  "prop1","hooker1","prop2",
  "lock1","lock2",
  "looseforward1","looseforward2","looseforward3",
  "halfback1","flyhalf1",
  "centre1","centre2",
  "outsideback1","outsideback2","outsideback3",
];

const BENCH_SLOTS: SlotId[] = ["bench1","bench2","bench3","bench4","bench5"];

function applyAutoSubs(base: Lineup) {
  const next: Lineup = { ...base };

  // find starters that "did not play" (0 points)
  const startersNeedingHelp = () =>
    STARTER_SLOTS.filter((sid) => {
      const p = next[sid];
      if (!p?.id) return false;
      return minutesForPlayer(p) <= 0;
    });

  for (const benchSlot of BENCH_SLOTS) {
    const benchPlayer = next[benchSlot];
    if (!benchPlayer?.id) continue;

    // bench player must have played (>0)
    if (minutesForPlayer(benchPlayer) <= 0) continue;

    // try to sub them in for the first eligible 0-point starter
    const candidates = startersNeedingHelp();
    const targetStarter = candidates.find((starterSlot) => {
      const group = SLOT_GROUP[starterSlot];
      return canPlayerFitGroup(benchPlayer, group);
    });

    if (!targetStarter) continue;

    // swap bench -> starter
    const starterPlayer = next[targetStarter];
    next[targetStarter] = benchPlayer;
    next[benchSlot] = starterPlayer ?? null;
  }

  return next;
}



function finalizedLineupKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_final_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

function scoresLockedKey(leagueId: string | null, week: number) {
  return `mu_scores_locked_${leagueId ?? "no-league"}_wk${week}`;
}

function readScoresLocked(leagueId: string | null, week: number): boolean {
  if (typeof window === "undefined") return false;
  if (!leagueId || week <= 0) return false;
  return window.localStorage.getItem(scoresLockedKey(leagueId, week)) === "1";
}

const leftName = nameByTeamId(leftTeamId);
const rightName = nameByTeamId(rightTeamId);


  // --- Read locked snapshots for both teams (or blank) ---
const leagueId = activeLeague?.id ?? null;
const hasLeagueId = !!leagueId; // ✅ safeguard

type RosterApiRow = { team_id: string; data: any };

const [rosterByTeamId, setRosterByTeamId] = useState<Map<string, any>>(new Map());

useEffect(() => {
  if (!leagueId) return;

  fetch(`/api/rosters?leagueId=${leagueId}`)
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) {
        console.error("rosters fetch failed", j?.error);
        return;
      }

      const m = new Map<string, any>();
      for (const row of (j.data ?? j.rows ?? []) as RosterApiRow[]) {
        const tid = (row as any).team_id ?? (row as any).teamId;
        if (tid) m.set(String(tid), (row as any).data);
      }
      setRosterByTeamId(m);
    })
    .catch((e) => console.error(e));
}, [leagueId]);

const [scoresLockedTick, setScoresLockedTick] = useState(0);

function unlockScoresForWeek() {
  if (typeof window === "undefined") return;
  if (!hasLeagueId) return;
  if (displayWeek <= 0) return;
  if (!activeLeague?.teams?.length) return;

  const ok = window.confirm(
    `UNLOCK Week ${displayWeek}?\n\nThis will remove the locked flag and delete ALL finalized lineups for this week.`
  );
  if (!ok) return;

  // remove league/week lock
  window.localStorage.removeItem(scoresLockedKey(leagueId, displayWeek));

  // remove all finals for that week
  for (const t of activeLeague.teams) {
    window.localStorage.removeItem(finalizedLineupKey(leagueId, displayWeek, t.id));
  }

  setScoresLockedTick((x) => x + 1);
}

const scoresLocked = useMemo(() => {
  return readScoresLocked(leagueId, displayWeek);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [leagueId, displayWeek, scoresLockedTick]);

  function readFinalized(teamId: string | null) {
  if (typeof window === "undefined") return null;
  if (!hasLeagueId) return null;        // ✅ ADD
  if (!teamId) return null;

  const key = finalizedLineupKey(leagueId, displayWeek, teamId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Lineup;
  } catch {
    return null;
  }
}

function rosterFallbackSnapshot(teamId: string | null): LockedSnapshot | null {
  if (!teamId) return null;

  const data = rosterByTeamId.get(teamId);
  if (!data) return null;

  const lineup = rosterDataToLineup(data);
if (!lineup) return null;

  return {
    week: displayWeek,
    teamId,
    lockedAtMs: 0,
    lineup,
    captainId: data.captainId ?? null,
    viceId: data.viceId ?? null,
  };
}
function rosterDataToLineup(data: any): Lineup | null {
  if (!data) return null;

  // If it already looks like a Lineup (SlotId keys), return it
  if (data.prop1 || data.hooker1 || data.bench1) return data as Lineup;
  if (data.lineup && (data.lineup.prop1 || data.lineup.bench1)) return data.lineup as Lineup;

  const slots = data.slots ?? {};
  const wild = Array.isArray(data.wildcards) ? data.wildcards : [];

  const arr = (k: string) => (Array.isArray(slots?.[k]) ? slots[k] : []);
  const get = (a: any[], i: number) => (Array.isArray(a) ? a[i] ?? null : null);

  const PR = arr("PR");
  const HO = arr("HO");
  const LK = arr("LK");
  const LF = arr("LF");
  const HB = arr("HB");
  const FH = arr("FH");
  const CE = arr("CE");
  const OB = arr("OB");

  const lineup: Lineup = {
    prop1: get(PR, 0),
    hooker1: get(HO, 0),
    prop2: get(PR, 1),

    lock1: get(LK, 0),
    lock2: get(LK, 1),

    looseforward1: get(LF, 0),
    looseforward2: get(LF, 1),
    looseforward3: get(LF, 2),

    halfback1: get(HB, 0),
    flyhalf1: get(FH, 0),

    centre1: get(CE, 0),
    centre2: get(CE, 1),

    outsideback1: get(OB, 0),
    outsideback2: get(OB, 1),
    outsideback3: get(OB, 2),

    bench1: wild[0] ?? null,
    bench2: wild[1] ?? null,
    bench3: wild[2] ?? null,
    bench4: wild[3] ?? null,
    bench5: wild[4] ?? null,
  };

  return lineup;
}

  const readSnapshot = (teamId: string | null): LockedSnapshot | null => {
  if (typeof window === "undefined") return null;
  if (!hasLeagueId) return null;        // ✅ ADD
  if (!teamId) return null;

  const key = matchupSnapshotKey(leagueId, displayWeek, teamId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as LockedSnapshot;
  } catch {
    return null;
  }
};

const leftSnap = useMemo(() => {
  // 1) locked snapshot (mu_snapshot)
  const snap = readSnapshot(leftTeamId);
  if (snap) return snap;

  // 2) saved Team Selection lineup (ts_lineup + captain/vice)
  const ts = teamSelectionFallbackSnapshot(leagueId, displayWeek, leftTeamId);
  if (ts) return ts;

  // 3) fallback to Supabase roster conversion (ONLY for current selection week)
  if (displayWeek === selectionWeek) return rosterFallbackSnapshot(leftTeamId);

  return null;
}, [leagueId, displayWeek, leftTeamId, rosterByTeamId, selectionWeek, tsTick]);

const rightSnap = useMemo(() => {
  // 1) locked snapshot (mu_snapshot)
  const snap = readSnapshot(rightTeamId);
  if (snap) return snap;

  // 2) saved Team Selection lineup (ts_lineup + captain/vice)
  const ts = teamSelectionFallbackSnapshot(leagueId, displayWeek, rightTeamId);
  if (ts) return ts;

  // 3) fallback to Supabase roster conversion (ONLY for current selection week)
  if (displayWeek === selectionWeek) return rosterFallbackSnapshot(rightTeamId);

  return null;
}, [leagueId, displayWeek, rightTeamId, rosterByTeamId, selectionWeek, tsTick]);

const leftBlank = !leftSnap;
const rightBlank = !rightSnap;

const leftLineup: Lineup | null = leftSnap?.lineup ?? null;
const rightLineup: Lineup | null = rightSnap?.lineup ?? null;

const leftC = leftSnap?.captainId ?? null;
const leftV = leftSnap?.viceId ?? null;

const rightC = rightSnap?.captainId ?? null;
const rightV = rightSnap?.viceId ?? null;

const srWeekComplete = useMemo(() => {
  if (displayRealRound <= 0) return false;
  const wk = normalizedFixtures.filter((f) => f.week === displayRealRound);
  return wk.length ? wk.every(isFixtureComplete) : false;
}, [normalizedFixtures, displayRealRound]);

// Captain multiplier (for display + totals)
const CAP_MULT = 2;

const leftBase = leftLineup;
const rightBase = rightLineup;

const leftFinal = useMemo(
  () => readFinalized(leftTeamId),
  [leagueId, displayWeek, leftTeamId, scoresLockedTick]
);

const rightFinal = useMemo(
  () => readFinalized(rightTeamId),
  [leagueId, displayWeek, rightTeamId, scoresLockedTick]
);

const effectiveLeftLineup = leftFinal ?? leftBase;
const effectiveRightLineup = rightFinal ?? rightBase;

function pointsWithCaptain(p: Player | null, effCaptainId: string | null) {
  if (!p?.id) return 0;
  const base = pointsForPlayer(p);
  return p.id === effCaptainId ? base * CAP_MULT : base;
}


// If captain isn't in the lineup, vice becomes "active captain"
function effectiveCaptainId(lineup: Lineup | null, captainId: string | null, viceId: string | null) {
  if (!lineup) return null;

  const cap = Object.values(lineup).find((x) => x?.id === captainId) ?? null;
  const vice = Object.values(lineup).find((x) => x?.id === viceId) ?? null;

  const capMins = cap ? minutesForPlayer(cap) : 0;
if (cap && capMins > 0) return cap.id;

const viceMins = vice ? minutesForPlayer(vice) : 0;
if (vice && viceMins > 0) return vice.id;

  return captainId; // fallback (won’t matter if 0)
}


const selectedLive = useMemo(() => {
  if (!selectedPlayer?.id) return null;
  return typeof getLivePlayerById === "function"
    ? getLivePlayerById(selectedPlayer.id)
    : null;
}, [getLivePlayerById, selectedPlayer?.id]);

const selectedStatus = useMemo(() => {
  return (selectedLive as any)?.status ?? (selectedPlayer as any)?.status ?? null;
}, [selectedLive, selectedPlayer]);

const selectedStats = useMemo(() => {
  return (selectedLive as any)?.stats ?? (selectedPlayer as any)?.stats ?? {};
}, [selectedLive, selectedPlayer]);

const selectedPlayerForCard = useMemo(() => {
  if (!selectedPlayer) return null;

  return {
    id: selectedPlayer.id,
    firstName: selectedPlayer.firstName,
    lastName: selectedPlayer.lastName,
    posAbbrev: selectedPlayer.posAbbrev ?? "",
    posName: selectedPlayer.posName ?? "",
    teamCode: selectedPlayer.teamCode ?? "",

    // ✅ status lives on the player object now
    status: selectedStatus ?? null,
    weeklyStatus: (selectedLive as any)?.weeklyStatus ?? undefined,
  };
}, [selectedPlayer, selectedStatus, selectedLive]);

useEffect(() => {
  if (cardOpen) {
    console.log("modal player id", selectedPlayer?.id);
    console.log("selectedStatus", selectedStatus);
  }
}, [cardOpen, selectedPlayer?.id, selectedStatus]);



useEffect(() => {
  if (typeof window === "undefined") return;
  if (!hasLeagueId) return;

  // ✅ only finalize when YOU lock scores (manual)
  if (!scoresLocked) return;

  // Only finalize if we have real locked lineups
  if (!leftBase || !rightBase) return;

  if (leftBase && leftTeamId) {
    const k = finalizedLineupKey(leagueId, displayWeek, leftTeamId);
    if (!window.localStorage.getItem(k)) {
      const final = applyAutoSubs(leftBase);
      window.localStorage.setItem(k, JSON.stringify(final));
    }
  }

  if (rightBase && rightTeamId) {
    const k = finalizedLineupKey(leagueId, displayWeek, rightTeamId);
    if (!window.localStorage.getItem(k)) {
      const final = applyAutoSubs(rightBase);
      window.localStorage.setItem(k, JSON.stringify(final));
    }
  }
}, [scoresLocked, hasLeagueId, leagueId, displayWeek, leftTeamId, rightTeamId, leftBase, rightBase]);

const getIsCreator = useLeagueStore((s) => s.isActiveLeagueCreator);
const isLeagueCreator = getIsCreator();

function lockScoresAndFinalize() {
  if (typeof window === "undefined") return;
  if (!hasLeagueId) return;
  if (displayWeek <= 0) return;
  if (!activeLeague?.teams?.length) return;
  if (scoresLocked) return;

  // must be locked week (deadline passed)
  if (!displayLocked) {
    alert("Deadline not passed yet — lineups aren’t locked.");
    return;
  }

    // ✅ confirm before locking
  const ok = window.confirm(
    `Lock scores for Week ${displayWeek} (Round ${displayRealRound})?\n\n` +
    `This will finalize auto-subs for ALL teams and cannot be undone (without a manual reset).`
  );
  if (!ok) return;

  // mark scores locked for the whole league/week
  window.localStorage.setItem(scoresLockedKey(leagueId, displayWeek), "1");

  // finalize every team in the league for this week
  const missing: string[] = [];

  for (const t of activeLeague.teams) {
    const snap =
  readSnapshot(t.id) ??
  (displayWeek === selectionWeek ? rosterFallbackSnapshot(t.id) : null);
    if (!snap?.lineup) {
      missing.push(t.name ?? t.id);
      continue;
    }

    const k = finalizedLineupKey(leagueId, displayWeek, t.id);
    const final = applyAutoSubs(snap.lineup);
    window.localStorage.setItem(k, JSON.stringify(final));
  }

  if (missing.length) {
    alert(
      `Locked scores, but some teams had no locked lineup snapshot:\n\n${missing.join(
        "\n"
      )}`
    );
  }

  // force UI to re-read localStorage
  setScoresLockedTick((x) => x + 1);
}



// Effective captain (vice activates if captain not playing)
const leftEffC = effectiveCaptainId(effectiveLeftLineup, leftC, leftV);
const rightEffC = effectiveCaptainId(effectiveRightLineup, rightC, rightV);

function totalForSlots(lineup: Lineup | null, effCaptain: string | null, slots: SlotId[]) {
  if (!lineup) return 0;
  return slots.reduce((sum, sid) => sum + pointsWithCaptain(lineup[sid], effCaptain), 0);
}

const leftScore = totalForSlots(effectiveLeftLineup, leftEffC, STARTER_SLOTS);
const rightScore = totalForSlots(effectiveRightLineup, rightEffC, STARTER_SLOTS);

const leftBenchScore = totalForSlots(effectiveLeftLineup, leftEffC, BENCH_SLOTS);
const rightBenchScore = totalForSlots(effectiveRightLineup, rightEffC, BENCH_SLOTS);


// -----------------------
// RECORD + STREAK (TEMP MOCK)
// -----------------------


function streakColor(s: Streak) {
  if (!s) return "rgba(15,23,42,0.55)";
  return s.type === "W" ? "#16a34a" : "#dc2626"; // green / red
}

// TEMP placeholders until you wire real data
const leftRecord = (leftTeamId ? recordByTeamId.get(leftTeamId) : null) ?? { w: 0, l: 0, d: 0 };
const rightRecord = (rightTeamId ? recordByTeamId.get(rightTeamId) : null) ?? { w: 0, l: 0, d: 0 };

const leftStreak: Streak = (leftTeamId ? streakByTeamId.get(leftTeamId) : null) ?? null;
const rightStreak: Streak = (rightTeamId ? streakByTeamId.get(rightTeamId) : null) ?? null;

function recordText(r: { w: number; l: number; d: number }) {
  return `${r.w}-${r.l}-${r.d} `;
}

function streakText(s: Streak) {
  if (!s) return "(-)";
  return `(${s.type}${s.n})`;
}

  // Fixture tag helper for player rows for THIS week (code-based, fixes MOA/MOP)
const fixtureTagForPlayer = (p: Player | null) => {
  if (!p) return "—";

  const playerCode = normalizeTeamCode(p.teamCode);
  if (!playerCode) return "BYE";

  const f = normalizedFixtures.find((x) => {
    if (x.week !== displayRealRound) return false;

    const homeCode = normalizeTeamCode(x.homeTeam ?? "");
    const awayCode = normalizeTeamCode(x.awayTeam ?? "");

    return homeCode === playerCode || awayCode === playerCode;
  });

  if (!f) return "BYE";

  const homeCode = normalizeTeamCode(f.homeTeam ?? "");
  const awayCode = normalizeTeamCode(f.awayTeam ?? "");

  const isHome = homeCode === playerCode;
  const oppCode = isHome ? awayCode : homeCode;

  if (!oppCode) return "BYE";
  return `${oppCode} (${isHome ? "H" : "A"})`;
};

function openPlayerCard(p: Player, owned: boolean, side: "left" | "right") {
  setSelectedPlayer(p);
  setSelectedOwned(owned);
  setSelectedSide(side);
  setCardOpen(true);
}

function openPointsBreakdown(p: Player, owned: boolean, side: "left" | "right") {
  setSelectedPlayer(p);
  setSelectedOwned(owned);
  setSelectedSide(side);
  setSelectedFixtureLabel(fixtureTagForPlayer(p));

  // ✅ Find the correct sheet row for THIS displayed round + player
  const pid = getPlayerSheetId(p);

  const row =
    (roundRows ?? []).find((r: any) => {
      if (rowRound(r) !== displayRealRound) return false;
      const rid = rowPlayerId(r);
      return rid && normaliseId(rid) === pid;
    }) ?? null;

  setSelectedRows(row ? buildBreakdownRows(row) : []);
  setPointsOpen(true);
}


  // --- Styling (match your app vibe) ---
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const listBox: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    color: "#0f172a",
  };

  function Hamburger() {
    return (
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "white",
          fontSize: 30,
          fontWeight: 900,
          lineHeight: "30px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }



  


  
  // Row order (matches your design)
  const ROWS: Array<{ slot: SlotId; label: string }> = [
    { slot: "prop1", label: "PR" },
    { slot: "hooker1", label: "HO" },
    { slot: "prop2", label: "PR" },
    { slot: "lock1", label: "LK" },
    { slot: "lock2", label: "LK" },
    { slot: "looseforward1", label: "LF" },
    { slot: "looseforward2", label: "LF" },
    { slot: "looseforward3", label: "LF" },
    { slot: "halfback1", label: "HB" },
    { slot: "flyhalf1", label: "FH" },
    { slot: "centre1", label: "CE" },
    { slot: "centre2", label: "CE" },
    { slot: "outsideback1", label: "OB" },
    { slot: "outsideback2", label: "OB" },
    { slot: "outsideback3", label: "OB" },
  ];

  

  const BENCH_ROWS: Array<{ slot: SlotId; label: string }> = [
  { slot: "bench1", label: "1" },
  { slot: "bench2", label: "2" },
  { slot: "bench3", label: "3" },
  { slot: "bench4", label: "4" },
  { slot: "bench5", label: "5" },
];


  const canGo = matchupsThisWeek.length > 1;

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        {/* Header */}
        <div
  style={{
    ...card35,
    padding: 14,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    position: "relative",   // ✅ allows bottom-right positioning
    minHeight: 92,          // ✅ ensures space for arrows
  }}
>


          {/* Top row (just hamburger) */}
<div style={{ display: "flex", alignItems: "center" }}>
  <Hamburger />
</div>
{/* Large page title */}
<div
  style={{
    marginTop: 10,
    fontSize: 20,
    fontWeight: 900,
    lineHeight: "20px",
  }}
>
  Match Up
</div>

{/* Matchup navigation – bottom right */}
<div
  style={{
    position: "absolute",
    right: 12,
    bottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 4,
  }}
>
  <button
    disabled={!canGo}
    onClick={() =>
      setMatchupIdx((i) => (i - 1 + matchupsThisWeek.length) % matchupsThisWeek.length)
    }
    style={{
      width: 22,
      height: 22,
      border: "none",
      background: "transparent",
      color: "rgb(255, 255, 255)",
      fontSize: 22,
      fontWeight: 900,
      cursor: canGo ? "pointer" : "not-allowed",
     
      padding: 0,
      lineHeight: "22px",
    }}
    aria-label="Previous matchup"
  >
    ‹
  </button>

  <div
    style={{
      fontSize: 13,
      fontWeight: 950,
      color: "rgba(255,255,255,0.9)",
      whiteSpace: "nowrap",
    }}
  >
    Match Up
  </div>

  <button
    disabled={!canGo}
    onClick={() => setMatchupIdx((i) => (i + 1) % matchupsThisWeek.length)}
    style={{
      width: 22,
      height: 22,
      border: "none",
      background: "transparent",
      color: "rgba(255,255,255,0.9)",
      fontSize: 22,
      fontWeight: 900,
      cursor: canGo ? "pointer" : "not-allowed",
      
      padding: 0,
      lineHeight: "22px",
    }}
    aria-label="Next matchup"
  >
    ›
  </button>
</div>

<div style={{ marginTop: 10, fontSize: 16, fontWeight: 950, opacity: 0.95 }}>
  {!mounted
    ? "Loading…"
    : (displayWeek <= 0 ? "Pre-season" : `Week ${displayWeek} • Round ${displayRealRound}`)}
</div>

        </div>

        {/* Scoreboard */}
        <div style={{ marginTop: 10, ...listBox, padding: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{leftName}</div>

<div style={{ fontSize: 13, fontWeight: 900, opacity: 0.75 }}>
  {recordText(leftRecord)}{" "}
  <span style={{ color: streakColor(leftStreak), fontWeight: 950 }}>
    {streakText(leftStreak)}
  </span>
</div>


            </div>

            <div style={{ fontSize: 18, fontWeight: 900, opacity: 0.85 }}>—</div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 18, fontWeight: 950 }}>{rightName}</div>

<div style={{ fontSize: 13, fontWeight: 900, opacity: 0.75 }}>
  {recordText(rightRecord)}{" "}
  <span style={{ color: streakColor(rightStreak), fontWeight: 950 }}>
    {streakText(rightStreak)}
  </span>
</div>


            </div>
          </div>

          <div
  style={{
    marginTop: 8,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
  }}
>
  {/* Left total pulled inward */}
  <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 20 }}>
    <div style={{ fontSize: 26, fontWeight: 900 }}>{leftScore}</div>
  </div>

  <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.7 }}>vs</div>

  {/* Right total pulled inward */}
  <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: 20 }}>
    <div style={{ fontSize: 26, fontWeight: 900 }}>{rightScore}</div>
  </div>
</div>

        </div>

        {/* Lineups */}
        <div style={{ marginTop: 10, ...listBox }}>
          {ROWS.map((r) => {
            const lp = effectiveLeftLineup ? effectiveLeftLineup[r.slot] : null;
const rp = effectiveRightLineup ? effectiveRightLineup[r.slot] : null;




            return (
              <div
                key={r.slot}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 34px 1fr",
                  gap: 10,
                  padding: "7px 10px",
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  alignItems: "center",
                }}
              >
                {/* Left player */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", minWidth: 0 }}>
                  <button
  onClick={() => lp && openPlayerCard(lp, leftTeamId === yourLeagueTeamId, "left")
}
  style={{ background: "transparent", border: "none", padding: 0, margin: 0, cursor: lp ? "pointer" : "default" }}
  aria-label="Open player card"
>
  {lp ? (() => {
  const src = jerseySrcForPlayer(lp, "angle");
  return src ? (
    <img
      src={src}
      alt=""
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        objectFit: "contain",
        display: "block",
      }}
    />
  ) : (
    <div style={{ width: 28, height: 28 }} />
  );
})() : (
  <div style={{ width: 28, height: 28 }} />
)}
</button>



                  <div style={{ minWidth: 0 }}>
                    <div
  onClick={() => lp && openPlayerCard(lp, leftTeamId === yourLeagueTeamId, "left")
}
  style={{
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: lp ? "pointer" : "default",
  }}
>
  {lp ? lp.lastName : "—"}
</div>


                    <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.55 }}>
                      {lp ? fixtureTagForPlayer(lp) : "—"}

                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  

  {/* Score pill */}
  {(() => {
  const isVice = !!lp?.id && leftV === lp.id;
  const isActiveCaptain = !!lp?.id && leftEffC === lp.id; // captain OR activated vice

  const pillBg = isActiveCaptain ? "rgba(168,85,247,0.95)" : "rgba(15,23,42,0.08)";
  const pillColor = isActiveCaptain ? "white" : "#0f172a";
  const pillBorder = isActiveCaptain
    ? "0px solid rgba(255,255,255,0.9)" // captain style outline
    : isVice
      ? "2px solid rgba(168,85,247,0.95)" // vice thin purple border
      : "1px solid transparent";

  return (
  <div
    onClick={() => lp && openPointsBreakdown(lp, leftTeamId === yourLeagueTeamId, "left")
}
    style={{
      minWidth: 30,
      height: 18,
      padding: "0 6px",
      borderRadius: 999,
      background: pillBg,
      border: pillBorder,
      display: "grid",
      placeItems: "center",
      fontSize: 11,
      fontWeight: 900,
      color: pillColor,
      cursor: lp ? "pointer" : "default",
    }}
    title={
      isActiveCaptain
        ? `Captain x${CAP_MULT}${isVice && leftC !== leftV ? " (VC activated)" : ""}`
        : isVice
          ? "Vice Captain"
          : "Player points"
    }
  >
    {lp ? pointsWithCaptain(lp, leftEffC) : "—"}
  </div>
);

})()}

</div>

                </div>

                {/* Middle position */}
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 900, opacity: 0.7 }}>
                  {r.label}
                </div>

                {/* Right player */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
  {/* Score pill */}
  {(() => {
  const isVice = !!rp?.id && rightV === rp.id;
  const isActiveCaptain = !!rp?.id && rightEffC === rp.id;

  const pillBg = isActiveCaptain ? "rgba(168,85,247,0.95)" : "rgba(15,23,42,0.08)";
  const pillColor = isActiveCaptain ? "white" : "#0f172a";
  const pillBorder = isActiveCaptain
    ? "0px solid rgba(255,255,255,0.9)"
    : isVice
      ? "2px solid rgba(168,85,247,0.95)"
      : "1px solid transparent";

  return (
    <div
  onClick={() => rp && openPointsBreakdown(rp, rightTeamId === yourLeagueTeamId, "right")
}
  style={{
    minWidth: 30,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: pillBg,
    border: pillBorder,
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 900,
    color: pillColor,
    cursor: rp ? "pointer" : "default",
  }}

      title={
        isActiveCaptain
          ? `Captain x${CAP_MULT}${isVice && rightC !== rightV ? " (VC activated)" : ""}`
          : isVice
            ? "Vice Captain"
            : "Player points"
      }
    >
      {rp ? pointsWithCaptain(rp, rightEffC) : "—"}
    </div>
  );
})()}


</div>


                  <div style={{ minWidth: 0, textAlign: "right" }}>
                    <div
  onClick={() => rp && openPlayerCard(rp, rightTeamId === yourLeagueTeamId, "right")
}
  style={{
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: rp ? "pointer" : "default",
  }}
>
  {rp ? rp.lastName : "—"}
</div>


                    <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.55 }}>
                      {rp ? fixtureTagForPlayer(rp) : "—"}

                    </div>
                  </div>

                  <button
  onClick={() => rp && openPlayerCard(rp, rightTeamId === yourLeagueTeamId, "right")
}
  style={{
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: rp ? "pointer" : "default",
    justifySelf: "end",
  }}
  aria-label="Open player card"
>
  {rp ? (() => {
  const src = jerseySrcForPlayer(rp, "angle");
  return src ? (
    <img
      src={src}
      alt=""
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        objectFit: "contain",
        display: "block",
      }}
    />
  ) : (
    <div style={{ width: 28, height: 28 }} />
  );
})() : (
  <div style={{ width: 28, height: 28 }} />
)}
</button>



                </div>
              </div>
            );
          })}

          {/* Bench header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              padding: "8px 10px",
              borderTop: "2px solid rgba(0,0,0,0.08)",
              background: "rgba(15,23,42,0.06)",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            <div>Bench</div>
            <div style={{ opacity: 0.7 }}>{leftBenchScore} • {rightBenchScore}</div>
            <div style={{ textAlign: "right" }}>Bench</div>
          </div>

          {BENCH_ROWS.map((r) => {
  const lp = effectiveLeftLineup ? effectiveLeftLineup[r.slot] : null;
const rp = effectiveRightLineup ? effectiveRightLineup[r.slot] : null;

  // (captain/vice badges technically don’t apply on bench, but leaving the logic harmless)
  const lIsC = !!lp?.id && leftC === lp.id;
  const lIsV = !!lp?.id && leftV === lp.id;
  const rIsC = !!rp?.id && rightC === rp.id;
  const rIsV = !!rp?.id && rightV === rp.id;

  return (
    <div
      key={r.slot}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 34px 1fr",
        gap: 10,
        padding: "7px 10px", // same as starters
        borderTop: "1px solid rgba(0,0,0,0.08)",
        alignItems: "center",
      }}
    >
      {/* Left bench player (same format as starters) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 8,
          alignItems: "center",
          minWidth: 0,
        }}
      >
        <button
  onClick={() => lp && openPlayerCard(lp, leftTeamId === yourLeagueTeamId, "left")
}
  style={{ background: "transparent", border: "none", padding: 0, margin: 0, cursor: lp ? "pointer" : "default" }}
  aria-label="Open player card"
>
  {lp ? (() => {
  const src = jerseySrcForPlayer(lp, "angle");
  return src ? (
    <img
      src={src}
      alt=""
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        objectFit: "contain",
        display: "block",
      }}
    />
  ) : (
    <div style={{ width: 28, height: 28 }} />
  );
})() : (
  <div style={{ width: 28, height: 28 }} />
)}
</button>


        <div style={{ minWidth: 0 }}>
          <div
  onClick={() => lp && openPlayerCard(lp, leftTeamId === yourLeagueTeamId, "left")
}
  style={{
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: lp ? "pointer" : "default",
  }}
>
  {lp ? lp.lastName : "—"}
</div>

          <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.55 }}>
            {lp ? fixtureTagForPlayer(lp) : "—"}
          </div>
        </div>

        {/* MOVE pill closer to centre:
            keep this column, but align it to the right edge of the left side,
            which is closest to the middle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
          {/* Bench score pill */}
          <div
  onClick={() => lp && openPointsBreakdown(lp, leftTeamId === yourLeagueTeamId, "left")
}
  style={{
    minWidth: 30,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 900,
    color: "#0f172a",
    cursor: lp ? "pointer" : "default",
  }}
  title={lIsC ? `Captain x${CAP_MULT}` : "Player points"}
>
  {lp?.id ? pointsWithCaptain(lp, leftEffC) : "—"}
</div>


          
        </div>
      </div>

      {/* Middle bench number (1–5) */}
      <div style={{ textAlign: "center", fontSize: 11, fontWeight: 900, opacity: 0.7 }}>
        {r.label}
      </div>

      {/* Right bench player (same format as starters) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 8,
          alignItems: "center",
          minWidth: 0,
        }}
      >
        {/* MOVE pill closer to centre:
            this column sits on the left of the right side, which is closest to middle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6 }}>
          

          {/* Bench score pill */}
          <div
  onClick={() => rp && openPointsBreakdown(rp, rightTeamId === yourLeagueTeamId, "right")
}
  style={{
    minWidth: 30,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: "rgba(15,23,42,0.08)",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 900,
    color: "#0f172a",
    cursor: rp ? "pointer" : "default",
  }}
  title={rIsC ? `Captain x${CAP_MULT}` : "Player points"}
>
  {rp?.id ? pointsWithCaptain(rp, rightEffC) : "—"}
</div>

        </div>

        <div style={{ minWidth: 0, textAlign: "right" }}>
          <div
  onClick={() => rp && openPlayerCard(rp, rightTeamId === yourLeagueTeamId, "right")
}
  style={{
    fontSize: 12,
    fontWeight: 900,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    cursor: rp ? "pointer" : "default",
  }}
>
  {rp ? rp.lastName : "—"}
</div>

          <div style={{ fontSize: 10, fontWeight: 800, opacity: 0.55 }}>
            {rp ? fixtureTagForPlayer(rp) : "—"}
          </div>
        </div>

        <button
  onClick={() => rp && openPlayerCard(rp, rightTeamId === yourLeagueTeamId, "right")
}
  style={{
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: rp ? "pointer" : "default",
    justifySelf: "end",
  }}
  aria-label="Open player card"
>
  {rp ? (() => {
  const src = jerseySrcForPlayer(rp, "angle");
  return src ? (
    <img
      src={src}
      alt=""
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        objectFit: "contain",
        display: "block",
      }}
    />
  ) : (
    <div style={{ width: 28, height: 28 }} />
  );
})() : (
  <div style={{ width: 28, height: 28 }} />
)}
</button>

      </div>
    </div>
  );
})}
{isLeagueCreator && displayWeek > 0 ? (
  <div style={{ marginTop: 12, ...listBox, padding: 10 }}>
    <button
      onClick={lockScoresAndFinalize}
      disabled={scoresLocked || !displayLocked || !srWeekComplete}
      style={{
        width: "100%",
        border: "none",
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 14,
        fontWeight: 950,
        cursor: scoresLocked || !displayLocked ? "not-allowed" : "pointer",
        background: scoresLocked ? "rgba(15,23,42,0.15)" : "rgba(15,23,42,0.95)",
        color: scoresLocked ? "rgba(15,23,42,0.6)" : "white",
      }}
    >
      {scoresLocked ? "Scores locked • Auto-subs applied" : "Lock scores & run auto-subs"}
    </button>

    {/* ✅ SECOND BUTTON GOES EXACTLY HERE */}
    {scoresLocked ? (
      <button
        onClick={unlockScoresForWeek}
        style={{
          marginTop: 8,
          width: "100%",
          border: "none",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: 950,
          cursor: "pointer",
          background: "rgba(220,38,38,0.92)",
          color: "white",
        }}
      >
        Undo lock (admin)
      </button>
    ) : null}

    {scoresLocked ? (
  <button
    onClick={unlockScoresForWeek}
    style={{
      width: "100%",
      marginTop: 8,
      border: "none",
      borderRadius: 12,
      padding: "12px 14px",
      fontSize: 14,
      fontWeight: 950,
      cursor: "pointer",
      background: "rgba(220,38,38,0.95)",
      color: "white",
    }}
  >
    Undo lock (delete finalized lineups)
  </button>
) : null}

    {!displayLocked ? (
      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
        Lineups aren’t locked yet for this week (deadline not passed).
      </div>
    ) : null}

    {!srWeekComplete ? (
  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
    Round isn’t complete yet — wait until all matches are final before locking scores.
  </div>
) : null}

  </div>
) : null}
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeague?.id ?? null}
        setActiveLeague={setActiveLeague}
        activeItem="Matchup"
      />
{cardOpen && selectedPlayerForCard ? (
  <PlayerCardModal
    open={cardOpen}
    onClose={() => setCardOpen(false)}
    player={selectedPlayerForCard}
    stats={selectedStats ?? {}}
    teamLabel=""
    initialTab="Stats"
    actions={[]}
    hideActions={selectedOwned}
  />
) : null}


{pointsOpen ? (
  <PointsBreakdownModal
    open={pointsOpen}
    onClose={() => setPointsOpen(false)}
    playerName={selectedPlayer ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : "Player"}
    jerseySrc={jerseySrcForPlayer(selectedPlayer, "angle") ?? undefined}
    teamCode={selectedPlayer?.teamCode ?? null}
    weekLabel={`Week ${displayWeek}`}
    fixtureLabel={selectedFixtureLabel ? `v ${selectedFixtureLabel}` : "—"}
    rows={selectedRows}
    totalPoints={
      selectedPlayer
        ? (() => {
            const lineup = selectedSide === "left" ? effectiveLeftLineup : effectiveRightLineup;
            const c = selectedSide === "left" ? leftC : rightC;
            const v = selectedSide === "left" ? leftV : rightV;
            const effC = effectiveCaptainId(lineup, c, v);

            const base = pointsForPlayer(selectedPlayer);
            return selectedPlayer.id === effC ? base * CAP_MULT : base;
          })()
        : 0
    }
  />
) : null}



    </main>
  );
}
