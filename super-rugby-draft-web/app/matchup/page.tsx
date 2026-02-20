"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getActiveUser, getActiveUsername } from "@/lib/session";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { buildLeagueSchedule } from "@/lib/league/schedule";

import fixturesData from "@/data/fixtures-2026.json";
import type { Fixture } from "@/lib/fixtures/types";

import { AppMenu } from "@/components/AppMenu";

import { PlayerCardModal } from "@/components/PlayerCardModal";
import { PointsBreakdownModal } from "@/components/PointsBreakdownModal";
import { usePlayersStore } from "@/lib/players/store";
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

    MOANA: "MOP",
    MOANA_PASIFIKA: "MOP",
    MOANAPASIFIKA: "MOP",

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
  if ((f.status ?? "").toLowerCase() === "complete") return true;
  if (f.homeScore != null && f.awayScore != null) return true;
  return false;
}

function getSelectionDeadlineMs(firstKickoffMs: number) {
  return firstKickoffMs - 0 * 60 * 60 * 1000;
}



function abbrevTeam(name: string) {
  const s = (name ?? "").trim();
  return s ? s.slice(0, 3).toUpperCase() : "TBD";
}

// Storage keys (must match Team Selection page)
function matchupSnapshotKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_snapshot_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

type LockedSnapshot = {
  week: number;
  teamId: string;
  lockedAtMs: number;
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
};

function useNowTick(ms = 1000) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return Date.now();
}

export default function MatchupPage() {
  const router = useRouter();

  useEffect(() => {
    const u = getActiveUser();
    if (!u) router.replace("/");
  }, [router]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
const [pointsOpen, setPointsOpen] = useState(false);

const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
const [selectedOwned, setSelectedOwned] = useState(false);
const [selectedSide, setSelectedSide] = useState<"left" | "right">("left");
const [selectedFixtureLabel, setSelectedFixtureLabel] = useState<string>("—");


  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useLeagueStore((s) => s.activeLeague());
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  const userId = useMemo(() => getActiveUsername(), []);
  

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

const weekNo = activeLeague?.currentWeek ?? 1;

const deadlineMs = useMemo(() => {
  const wk = normalizedFixtures.filter((f) => f.week === weekNo);
  if (!wk.length) return 0;

  const firstKickoff = Math.min(...wk.map((f) => (f as any).kickoffMs));
  if (!Number.isFinite(firstKickoff) || firstKickoff <= 0) return 0;

  return getSelectionDeadlineMs(firstKickoff);
}, [normalizedFixtures, weekNo]);

const deadlineLocked = deadlineMs ? nowMs >= deadlineMs : false;
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
    if (rowRound(row) !== weekNo) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = normaliseId(pidRaw);
    m.set(pid, calcFantasyPoints(row));
  }

  return m;
}, [roundRows, weekNo]);

function pointsForPlayer(p: Player | null) {
  const pid = getPlayerSheetId(p);
  if (!pid) return 0;
  return weekPointsByPlayerId.get(pid) ?? 0;
}




  // --- Build league matchups for this week using buildLeagueSchedule ---
  const matchupsThisWeek = useMemo(() => {
  const l = activeLeague;
  if (!l) return [];

  const totalWeeks = l.totalWeeks ?? 16;

  const rows = buildLeagueSchedule({
    teams: l.teams,
    totalWeeks,
    currentWeek: l.currentWeek ?? 1,
    playoffFormat: l.playoffFormat ?? "none",
  });

  // buildLeagueSchedule returns a flat MatchupRow[] already:
  // { weekNo, homeTeamId, awayTeamId }
  return rows
    .filter((r) => r.weekNo === weekNo)
    .map((r) => ({
      weekNo: r.weekNo,
      homeTeamId: r.homeTeamId ?? null,
      awayTeamId: r.awayTeamId ?? null,
    }));
}, [activeLeague, weekNo]);


  // Which matchup is currently being viewed (arrows)
  const defaultIndex = useMemo(() => {
    if (!yourLeagueTeamId) return 0;
    const idx = matchupsThisWeek.findIndex(
      (m) => m.homeTeamId === yourLeagueTeamId || m.awayTeamId === yourLeagueTeamId
    );
    return idx >= 0 ? idx : 0;
  }, [matchupsThisWeek, yourLeagueTeamId]);

  const [matchupIdx, setMatchupIdx] = useState(0);

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
      return pointsForPlayer(p) === 0;
    });

  for (const benchSlot of BENCH_SLOTS) {
    const benchPlayer = next[benchSlot];
    if (!benchPlayer?.id) continue;

    // bench player must have played (>0)
    if (pointsForPlayer(benchPlayer) <= 0) continue;

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



const leftName = nameByTeamId(leftTeamId);
const rightName = nameByTeamId(rightTeamId);


  // --- Read locked snapshots for both teams (or blank) ---
  const leagueId = activeLeague?.id ?? null;

  function readFinalized(teamId: string | null) {
  if (typeof window === "undefined") return null;
  if (!teamId) return null;
  const key = finalizedLineupKey(leagueId, weekNo, teamId);
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Lineup;
  } catch {
    return null;
  }
}

  const readSnapshot = (teamId: string | null): LockedSnapshot | null => {
    if (typeof window === "undefined") return null;
    if (!teamId) return null;
    const key = matchupSnapshotKey(leagueId, weekNo, teamId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LockedSnapshot;
    } catch {
      return null;
    }
  };

  const leftSnap = useMemo(() => readSnapshot(leftTeamId), [leagueId, weekNo, leftTeamId, deadlineLocked]);
const rightSnap = useMemo(() => readSnapshot(rightTeamId), [leagueId, weekNo, rightTeamId, deadlineLocked]);

const leftBlank = !deadlineLocked || !leftSnap;
const rightBlank = !deadlineLocked || !rightSnap;

const leftLineup: Lineup | null = leftBlank ? null : leftSnap!.lineup;
const rightLineup: Lineup | null = rightBlank ? null : rightSnap!.lineup;


const leftC = leftBlank ? null : leftSnap!.captainId;
const leftV = leftBlank ? null : leftSnap!.viceId;

const rightC = rightBlank ? null : rightSnap!.captainId;
const rightV = rightBlank ? null : rightSnap!.viceId;

const srWeekComplete = useMemo(() => {
  const wk = normalizedFixtures.filter((f) => f.week === weekNo);
  return wk.length ? wk.every(isFixtureComplete) : false;
}, [normalizedFixtures, weekNo]);

// Captain multiplier (for display + totals)
const CAP_MULT = 2;

const leftBase = leftLineup;
const rightBase = rightLineup;

const leftFinal = useMemo(() => readFinalized(leftTeamId), [leagueId, weekNo, leftTeamId]);
const rightFinal = useMemo(() => readFinalized(rightTeamId), [leagueId, weekNo, rightTeamId]);

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

  const capPts = cap ? pointsForPlayer(cap) : 0;
  if (cap && capPts > 0) return cap.id;

  const vicePts = vice ? pointsForPlayer(vice) : 0;
  if (vice && vicePts > 0) return vice.id;

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
  if (!srWeekComplete) return;

  // Only finalize if we have real locked lineups
  if (!leftBase || !rightBase) return;

  if (leftBase && leftTeamId) {
    const k = finalizedLineupKey(leagueId, weekNo, leftTeamId);
    if (!window.localStorage.getItem(k)) {
      const final = applyAutoSubs(leftBase);
      window.localStorage.setItem(k, JSON.stringify(final));
    }
  }

  if (rightBase && rightTeamId) {
    const k = finalizedLineupKey(leagueId, weekNo, rightTeamId);
    if (!window.localStorage.getItem(k)) {
      const final = applyAutoSubs(rightBase);
      window.localStorage.setItem(k, JSON.stringify(final));
    }
  }
}, [srWeekComplete, leagueId, weekNo, leftTeamId, rightTeamId, leftBase, rightBase]);

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
type Streak = { type: "W" | "L"; n: number } | null;

function streakColor(s: Streak) {
  if (!s) return "rgba(15,23,42,0.55)";
  return s.type === "W" ? "#16a34a" : "#dc2626"; // green / red
}

// TEMP placeholders until you wire real data
const leftRecord = { w: 0, l: 0, d: 0 };
const rightRecord = { w: 0, l: 0, d: 0 };

const leftStreak: Streak = null;  // e.g. { type: "W", n: 3 }
const rightStreak: Streak = null; // e.g. { type: "L", n: 2 }

function recordText(r: { w: number; l: number; d: number }) {
  return `${r.w}-${r.l}-${r.d} `;
}

function streakText(s: Streak) {
  if (!s) return "(-)";
  return `(${s.type}${s.n})`;
}

  // Fixture tag helper for player rows for THIS week
  const fixtureTagForPlayer = (p: Player | null) => {
    if (!p) return "—";
    const t = (p.teamCode ?? "").toLowerCase();
    const f = normalizedFixtures.find(
  (x) =>
    x.week === weekNo &&
    ((x.homeTeam ?? "").toLowerCase().includes(t) || (x.awayTeam ?? "").toLowerCase().includes(t))
);

    if (!f) return "BYE";

    const home = f.homeTeam ?? "";
    const away = f.awayTeam ?? "";
    const isHome = home.toLowerCase().includes(t);
    const opp = isHome ? away : home;
    return `${abbrevTeam(opp)} (${isHome ? "H" : "A"})`;
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
  Week {weekNo}
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
    weekLabel={`Week ${weekNo}`}
    fixtureLabel={selectedFixtureLabel ? `v ${selectedFixtureLabel}` : "—"}
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
