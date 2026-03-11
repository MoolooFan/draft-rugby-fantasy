"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore } from "@/lib/league/store";
import type { PlayoffFormat } from "@/lib/league/types";
import { buildLeagueSchedule } from "@/lib/league/schedule";
import { AppMenu } from "@/components/AppMenu";
import { usePlayersStore } from "@/lib/players/store";
import { fantasyWeekToRealRound } from "@/lib/league/week";
import fixturesData from "@/data/fixtures-2026.json";
import type { Fixture } from "@/lib/fixtures/types";

type LeagueTab = "Standings" | "Fixtures" | "Results";
type Modal =
  | null
  | { type: "join" }
  | { type: "create" }
  | { type: "settings" };

  type FixtureRow = {
  weekNo: number;

  home: string;
  away: string;

  homeTeamId?: string | null;
  awayTeamId?: string | null;

  homeScore: number | null;
  awayScore: number | null;

  // ✅ ADD THESE (for playoff label rows)
  label?: string | null;
  kind?: "regular" | "playoffs" | "consolation" | string | null;
};


type FixtureWeek = {
  weekNo: number;
  rows: FixtureRow[];
};

type AnyFixture = Fixture & {
  id: string;
  week: number; // real round
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
  const st = String(f.status ?? "").toLowerCase();
  if (st === "final" || st === "complete") return true;
  if (f.homeScore != null && f.awayScore != null) return true;
  return false;
}

function resultsKey(leagueId: string | null) {
  return `league_results_${leagueId ?? "no-league"}`;
}

type StoredMatchResult = {
  weekNo: number;             // fantasy week
  kind: "match" | "bye";
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;          // fantasy score
  awayScore: number;          // fantasy score
  finalizedAtMs: number;
};

type RemoteMatchResult = {
  league_id: string;
  week_no: number;
  kind: "match" | "bye";
  home_team_id: string;
  away_team_id: string; // '__BYE__' for byes
  home_score: number;
  away_score: number;
  finalized_at_ms: number;
};

const BYE_SENTINEL = "__BYE__";

function rrKey(r: Pick<RemoteMatchResult, "week_no" | "kind" | "home_team_id" | "away_team_id">) {
  return `${r.week_no}|${r.kind}|${r.home_team_id}|${r.away_team_id}`;
}

function readLeagueResults(leagueId: string | null): StoredMatchResult[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(resultsKey(leagueId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredMatchResult[]) : [];
  } catch {
    return [];
  }
}

function writeLeagueResults(leagueId: string | null, rows: StoredMatchResult[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(resultsKey(leagueId), JSON.stringify(rows));
}

function upsertResult(leagueId: string | null, next: StoredMatchResult) {
  if (typeof window === "undefined") return;
  const existing = readLeagueResults(leagueId);
  const idx = existing.findIndex(
    (r) =>
      r.weekNo === next.weekNo &&
      r.kind === next.kind &&
      r.homeTeamId === next.homeTeamId &&
      r.awayTeamId === next.awayTeamId
  );

  if (idx >= 0) return; // ✅ already finalized — don’t change it

  writeLeagueResults(leagueId, [...existing, next]);
}

// ---------- Live scoring helpers (same logic as Matchup page) ----------
type SlotId =
  | "prop1" | "hooker1" | "prop2"
  | "lock1" | "lock2"
  | "looseforward1" | "looseforward2" | "looseforward3"
  | "halfback1" | "flyhalf1"
  | "centre1" | "centre2"
  | "outsideback1" | "outsideback2" | "outsideback3"
  | "bench1" | "bench2" | "bench3" | "bench4" | "bench5";

type PlayerLite = {
  id: string;
  firstName?: string;
  lastName?: string;
  teamCode?: string;
  posAbbrev?: string;
  secondaryPosAbbrev?: string | null;
  posName?: string;
  secondaryPosName?: string | null;
};

type Lineup = Record<SlotId, PlayerLite | null>;

type LockedSnapshot = {
  week: number;
  teamId: string;
  lockedAtMs: number;
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
};

const STARTER_SLOTS: SlotId[] = [
  "prop1","hooker1","prop2",
  "lock1","lock2",
  "looseforward1","looseforward2","looseforward3",
  "halfback1","flyhalf1",
  "centre1","centre2",
  "outsideback1","outsideback2","outsideback3",
];

const CAP_MULT = 2;

function normaliseId(x: any) {
  return String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

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

function rowPlayerId(row: any) {
  return pickValue(row, ["playerId", "Player ID", "player_id", "id"]);
}

function rowRound(row: any) {
  const v = pickValue(row, ["round", "Round", "week", "Week"]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Sheet already contains POINTS per column → sum them
function calcFantasyPoints(row: any): number {
  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const POINT_COLUMNS = [
    "Minutes played","Tries","Try Assists","Linebreaks","Linebreak assists","Defenders beaten",
    "Carries (m)","Offloads","Tackles","Missed tackles","Turnover Forced","Interceptions",
    "50:22 Kicks","Penalties Conceded","Errors","Lineouts won","Lineout steals","Lineout errors",
    "Scrums won outright","Conversions","Conversions missed","Penalty scored","Penalty missed",
    "Drop goal scored","Drop goal missed","Yellow cards","Red cards",
  ];

  let pts = 0;
  for (const col of POINT_COLUMNS) pts += toNumber(pickValue(row, [col]));
  return pts;
}


function matchupSnapshotKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_snapshot_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

function finalizedLineupKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_final_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

function effectiveCaptainId(
  lineup: Lineup | null,
  captainId: string | null,
  viceId: string | null,
  pointsForPlayer: (p: PlayerLite | null) => number
) {
  if (!lineup) return null;

  const cap = Object.values(lineup).find((x) => x?.id === captainId) ?? null;
  const vice = Object.values(lineup).find((x) => x?.id === viceId) ?? null;

  const capPts = cap ? pointsForPlayer(cap) : 0;
  if (cap && capPts > 0) return cap.id;

  const vicePts = vice ? pointsForPlayer(vice) : 0;
  if (vice && vicePts > 0) return vice.id;

  return captainId;
}



function toDatetimeLocal(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Accepts "YYYY-MM-DDTHH:mm" from <input type="datetime-local" />
// Returns ms timestamp or null if invalid/empty
function parseDatetimeLocal(value: string) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export default function LeaguePage() {
 useRequireSession();
  // --- prevent "bounce" before zustand persist hydrates ---
  const [leagueHydrated, setLeagueHydrated] = useState(() =>
    // @ts-ignore - persist is added by zustand middleware at runtime
    useLeagueStore.persist?.hasHydrated?.() ?? true
  );

  useEffect(() => {
    // @ts-ignore
    const persistApi = useLeagueStore.persist;
    if (!persistApi?.onFinishHydration) {
      setLeagueHydrated(true);
      return;
    }

    // set immediately in case it hydrated between renders
    setLeagueHydrated(persistApi.hasHydrated());

    const unsub = persistApi.onFinishHydration(() => setLeagueHydrated(true));
    return () => {
      // onFinishHydration returns an unsubscribe in zustand v4
      try { unsub?.(); } catch {}
    };
  }, []);

const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);


    // ---- Live sheet feed (MUST be inside component) ----
  const livePlayersLoaded = usePlayersStore((s) => s.loaded);
  const refreshLivePlayers = usePlayersStore((s) => s.refresh);
  const sheetPlayers = usePlayersStore((s) => s.players);
  const roundRows = usePlayersStore((s) => s.roundRows);

  useEffect(() => {
    if (!livePlayersLoaded) refreshLivePlayers();
  }, [livePlayersLoaded, refreshLivePlayers]);

  // Map draftId/playerId → sheet row lookup (handles mismatched ids)
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

  function getPlayerSheetId(p: PlayerLite | null) {
    if (!p) return null;
    const sheetPlayer = sheetPlayerById.get(normaliseId(p.id));
    const sheetPid =
      pickValue(sheetPlayer, ["playerId", "player_id", "player id", "Player ID", "id"]) ?? null;
    return sheetPid != null ? normaliseId(sheetPid) : normaliseId(p.id);
  }

  // Build: REAL round -> (playerId -> points)
const pointsByRealRound = useMemo(() => {
  const byRound = new Map<number, Map<string, number>>();
  for (const row of roundRows ?? []) {
    const rr = rowRound(row); // this is REAL round from the sheet
    if (!rr) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = normaliseId(pidRaw);
    const pts = calcFantasyPoints(row);

    if (!byRound.has(rr)) byRound.set(rr, new Map());
    byRound.get(rr)!.set(pid, pts);
  }
  return byRound;
}, [roundRows]);

function pointsForPlayerWeek(weekNo: number, p: PlayerLite | null) {
  const pid = getPlayerSheetId(p);
  if (!pid) return 0;

  const startRound = league?.startRound ?? 1;
  const realRound = fantasyWeekToRealRound(startRound, weekNo);

  return pointsByRealRound.get(realRound)?.get(pid) ?? 0;
}

  const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s: any) => s.activeLeagueId ?? null);


const refreshLeague = useLeagueStore((s) => s.refreshLeague);
const startLeagueRealtime = useLeagueStore((s) => s.startLeagueRealtime);


useEffect(() => {
  if (!mounted) return;
  if (!leagueHydrated) return;
  if (!activeLeagueId) return;

  const run = () => refreshLeague(activeLeagueId);
  run();

  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", run);

  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", run);
  };
}, [mounted, leagueHydrated, activeLeagueId, refreshLeague]);

useEffect(() => {
  if (!mounted) return;
  if (!leagueHydrated) return;
  if (!activeLeagueId) return;

  const stop = startLeagueRealtime(activeLeagueId);
  return () => stop();
}, [mounted, leagueHydrated, activeLeagueId, startLeagueRealtime]);

const league = useMemo(() => {
  return leagues.find((l) => l.id === activeLeagueId) ?? null;
}, [leagues, activeLeagueId]);

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
  if (!league?.id) return;

  const season = 2026; // or league.season if you have it
  fetch(`/api/fixtures/leagueMatches?season=${season}`)
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [league?.id]);


function isSheetLabelRow(r: SheetFixtureRow) {
  return !!(r.label && String(r.label).trim());
}

function isSheetMatchRow(r: SheetFixtureRow) {
  // Anything that isn't a label row and has at least one team (includes BYEs and TBC placeholders)
  if (isSheetLabelRow(r)) return false;
  const home = (r.homeTeamId ?? "").trim();
  const away = (r.awayTeamId ?? "").trim();
  return home !== "" || away !== "";
}

function isSheetRegularRow(r: SheetFixtureRow) {
  const k = String(r.kind ?? "").toLowerCase();
  return !k || k === "regular";
}

function isPlayoffsKind(kind: string | null) {
  return String(kind ?? "").toLowerCase() === "playoffs";
}

function labelText(r: FixtureRow) {
  return String(r.home ?? "").trim().toLowerCase();
}

function isGrandFinalHeader(r: FixtureRow) {
  return labelText(r) === "grand final";
}

function shouldInjectPlaceholder(r: FixtureRow) {
  if (!isPlayoffsKind(r.kind ?? null)) return false;

  const text = labelText(r);

  // Do NOT inject if sheet already contains a real matchup row
  if (
    text === "consolation final" ||
    text === "consolation playoff"
  ) {
    return false;
  }

  return true;
}

function isLabelOnlyRow(r: FixtureRow) {
  return !!r.label; // your label rows are rendered as r.home = label text
}

// Week is "complete" only when ALL non-label regular rows are complete
function isFantasyWeekComplete(weekNo: number) {
  const rows = sheetFixtures.filter((r) => Number(r.weekFantasy) === weekNo);

  // playable = any non-label matchup row (regular OR playoffs)
  const playable = rows.filter(isSheetMatchRow);

  if (playable.length === 0) return false;

  return playable.every((r) => String(r.status ?? "").toLowerCase() === "complete");
}

function latestCompletedRegularWeek(): number {
  // Only regular (non-label) weeks count for standings movement.
  const weeks = Array.from(
    new Set(
      sheetFixtures
        .filter((r) => !isSheetLabelRow(r) && isSheetRegularRow(r))
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  let latest = 0;
  for (const w of weeks) {
    if (isFantasyWeekComplete(w)) latest = w;
  }
  return latest;
}

function rowPlayed(r: FixtureRow, weekNo: number) {
  if (r.label) return false;

  const hit = sheetFixtures.find((x) =>
    Number(x.weekFantasy) === weekNo &&
    (x.homeTeamId ?? null) === (r.homeTeamId ?? null) &&
    (x.awayTeamId ?? null) === (r.awayTeamId ?? null)
  );

  return String(hit?.status ?? "").toLowerCase() === "complete";
}

function scoreFromSheet(weekNo: number, teamId: string | null): number | null {
  if (!teamId) return null;

  const hit = sheetFixtures.find((x) => {
    if (Number(x.weekFantasy) !== weekNo) return false;
    if (String(x.status ?? "").toLowerCase() !== "complete") return false;
    return x.homeTeamId === teamId || x.awayTeamId === teamId;
  });

  if (!hit) return null;
  if (hit.homeTeamId === teamId) return hit.homeScore ?? null;
  return hit.awayScore ?? null;
}

const realFixtures = useMemo(() => fixturesData as AnyFixture[], []);

const normalizedFixtures = useMemo(() => {
  return realFixtures
    .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
    .sort((a, b) => (a as any).kickoffMs - (b as any).kickoffMs);
}, [realFixtures]);

function isRealRoundComplete(realRound: number) {
  const wk = normalizedFixtures.filter((f) => f.week === realRound);
  return wk.length ? wk.every(isFixtureComplete) : false;
}

  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const getIsCreator = useLeagueStore((s) => s.isActiveLeagueCreator);
const isCreator = getIsCreator();

useEffect(() => {
  if (!mounted) return;
  if (!leagueHydrated) return;

  // If we have leagues but no activeLeagueId yet, pick the first one
  if (!activeLeagueId && leagues?.length) {
    setActiveLeague(leagues[0].id);
  }
}, [mounted, leagueHydrated, activeLeagueId, leagues, setActiveLeague]);

  const updateLeagueSettings = useLeagueStore((s) => s.updateLeagueSettings);
  const setDraftOrder = useLeagueStore((s) => s.setDraftOrder);
  const joinLeagueByCode = useLeagueStore((s) => s.joinLeagueByCode);
  const createLeague = useLeagueStore((s) => s.createLeague);

  const [tab, setTab] = useState<LeagueTab>("Standings");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);



  const leagueName = league?.name ?? "League";
  const leagueCode = league?.code ?? "—";

type StandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pf: number;
  pa: number;
  pd: number;
  pts: number;
  movement: "same" | "up" | "down";
};

const currentWeek = league?.currentWeek ?? 1;

const playoffWeeks =
  league?.playoffFormat === "final4" ? 2 :
  league?.playoffFormat === "final3" ? 2 :
  league?.playoffFormat === "final2" ? 1 :
  0;

// ✅ Real Super Rugby rounds (full season)
const REAL_REGULAR_ROUNDS = league?.realRegularSeasonRounds ?? 16;

// ✅ Start round must be within 1..REAL_REGULAR_ROUNDS
const START_ROUND_RAW = league?.startRound ?? 1;
const START_ROUND = Math.min(
  REAL_REGULAR_ROUNDS,
  Math.max(1, START_ROUND_RAW)
);

// ✅ Fantasy regular season is FIXED to 14 weeks (or less if startRound is late)
const FANTASY_REGULAR_WEEKS_CAP = 14;
const regularWeeks = Math.max(
  1,
  Math.min(FANTASY_REGULAR_WEEKS_CAP, REAL_REGULAR_ROUNDS - START_ROUND + 1)
);

// ✅ Total season weeks = regular + playoffs
const totalWeeks = regularWeeks + playoffWeeks;


function buildStandingsFromResults(uptoWeekInclusive: number): Omit<StandingRow, "rank" | "movement">[] {
  const teams = league?.teams ?? [];
  const base = new Map<string, Omit<StandingRow, "rank" | "movement">>();

  for (const t of teams) {
    base.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      pd: 0,
      pts: 0,
    });
  }

  // Only completed REGULAR rows up to the requested week.
  const rows = sheetFixtures.filter((r) => {
    const w = Number(r.weekFantasy);
    if (!w || w > uptoWeekInclusive) return false;
    if (isSheetLabelRow(r)) return false;
    if (!isSheetRegularRow(r)) return false;
    if (String(r.status ?? "").toLowerCase() !== "complete") return false;
    return true;
  });

  for (const m of rows) {
    const homeId = m.homeTeamId ?? null;
    const awayId = m.awayTeamId ?? null;

    // BYE (one side null) -> ignore in standings
    if (!homeId || !awayId) continue;

    const hs = m.homeScore;
    const as = m.awayScore;
    if (hs == null || as == null) continue;

    const home = base.get(homeId);
    const away = base.get(awayId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;

    home.pf += hs; home.pa += as;
    away.pf += as; away.pa += hs;

    if (hs > as) {
      home.wins += 1; home.pts += 4;
      away.losses += 1;
    } else if (as > hs) {
      away.wins += 1; away.pts += 4;
      home.losses += 1;
    } else {
      home.draws += 1; away.draws += 1;
      home.pts += 2; away.pts += 2;
    }

    home.pd = home.pf - home.pa;
    away.pd = away.pf - away.pa;
  }

  return Array.from(base.values());
}

const standings = useMemo<StandingRow[]>(() => {
  // ✅ Sheet-driven “current standings week”
  const playedNow = latestCompletedRegularWeek();      // e.g. 1, 2, 3...
  const playedPrev = Math.max(0, playedNow - 1);

  const curr = buildStandingsFromResults(playedNow);
  const prev = buildStandingsFromResults(playedPrev);

    const sortRows = (arr: any[]) =>
    arr.slice().sort((a, b) => b.pts - a.pts || b.pf - a.pf || b.pd - a.pd);

  const currSorted = sortRows(curr);
  const prevSorted = sortRows(prev);

  const prevRankById = new Map(prevSorted.map((r, i) => [r.teamId, i + 1]));

  return currSorted.map((r, i) => {
    const rank = i + 1;
    const prevRank = prevRankById.get(r.teamId);

    let movement: "same" | "up" | "down" = "same";
    if (prevRank != null) {
      if (rank < prevRank) movement = "up";
      else if (rank > prevRank) movement = "down";
    }

    return { rank, ...r, movement };
  });
}, [sheetFixtures, league?.teams]);

function readSnapshot(leagueId: string | null, teamId: string | null, weekNo: number): LockedSnapshot | null {
  if (typeof window === "undefined") return null;
  if (!teamId) return null;
  const raw = window.localStorage.getItem(matchupSnapshotKey(leagueId, weekNo, teamId));
  if (!raw) return null;
  try { return JSON.parse(raw) as LockedSnapshot; } catch { return null; }
}

function readFinalLineup(leagueId: string | null, teamId: string | null, weekNo: number): Lineup | null {
  if (typeof window === "undefined") return null;
  if (!teamId) return null;
  const raw = window.localStorage.getItem(finalizedLineupKey(leagueId, weekNo, teamId));
  if (!raw) return null;
  try { return JSON.parse(raw) as Lineup; } catch { return null; }
}

function teamWeekScore(leagueId: string | null, teamId: string | null, weekNo: number): number | null {
  const snap = readSnapshot(leagueId, teamId, weekNo);
  if (!snap) return null;

  const lineup = readFinalLineup(leagueId, teamId, weekNo) ?? snap.lineup;
  const pointsFor = (p: PlayerLite | null) => pointsForPlayerWeek(weekNo, p);

  const effC = effectiveCaptainId(lineup, snap.captainId, snap.viceId, pointsFor);

  let sum = 0;
  for (const slot of STARTER_SLOTS) {
    const p = lineup[slot];
    if (!p?.id) continue;
    const base = pointsFor(p);
    sum += (p.id === effC ? base * CAP_MULT : base);
  }
  return sum;
}



  // ------- fixtures/results (generated placeholder) -------

    const teamNameById = (id: string | null | undefined, opts?: { tbcIfMissing?: boolean }) => {
  if (!id) return opts?.tbcIfMissing ? "TBC" : "BYE";
  return league?.teams.find((t) => t.id === id)?.name ?? "TBC";
};

const fixtures = useMemo<FixtureWeek[]>(() => {
  if (!league?.teams?.length) return [];

  const teamNameById = (id: string | null | undefined, opts?: { tbcIfMissing?: boolean }) => {
    if (!id) return opts?.tbcIfMissing ? "TBC" : "BYE";
    return league.teams.find((t) => t.id === id)?.name ?? "TBC";
  };

  const byWeek = new Map<number, FixtureRow[]>();

  // Keep CSV order. (So your sheet order controls display order)
  for (const r of sheetFixtures) {
    const weekNo = Number(r.weekFantasy);
    if (!weekNo) continue;

    const label = r.label ?? null;
const kind = r.kind ? String(r.kind).toLowerCase() : null;
    const isLabel = !!label || String(kind ?? "").toLowerCase() === "label";
    const isNonRegular = !!kind && String(kind).toLowerCase() !== "regular";

    const homeTeamId = r.homeTeamId ?? null;
    const awayTeamId = r.awayTeamId ?? null;

    const row: FixtureRow = {
      weekNo,
      label,
      kind,
      homeTeamId,
      awayTeamId,

      home: isLabel ? (label ?? "") : teamNameById(homeTeamId, { tbcIfMissing: isNonRegular }),
      away: isLabel ? "" : teamNameById(awayTeamId, { tbcIfMissing: isNonRegular }),

      // Scores now come from the sheet
      homeScore: r.homeScore ?? null,
      awayScore: r.awayScore ?? null,
    };

    if (!byWeek.has(weekNo)) byWeek.set(weekNo, []);
    byWeek.get(weekNo)!.push(row);
  }

  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  return weeks.map((w) => ({ weekNo: w, rows: byWeek.get(w)! }));
}, [league?.teams, sheetFixtures]);




  // ------- styles (match your vibe) -------
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };
  

  const finalsLabelStyle: React.CSSProperties = {
  padding: "2px 10px",
  borderTop: "1px solid rgba(0,0,0,0.08)",
  fontSize: 11,          // smaller
  fontWeight: 700,
  textAlign: "center",
  background: "rgba(15,23,42,0.14)", // darker than normal label strip
  color: "#0f172a",
};

const grandFinalLabelStyle: React.CSSProperties = {
  ...finalsLabelStyle,
  background: "rgba(245, 158, 11, 0.28)", // amber/gold tint
  borderTop: "1px solid rgba(245, 158, 11, 0.45)",
  borderBottom: "1px solid rgba(245, 158, 11, 0.45)",
};

const finalsPlaceholderRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 10,
  padding: "7px 10px",
  borderTop: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 600,
  alignItems: "center",
  opacity: 0.85,
  background: "rgba(15,23,42,0.03)",
};

  const tabBarStyle: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    height: 30,
    border: "none",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  });

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
          fontSize: 36,
          fontWeight: 900,
          lineHeight: "36px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }

  function Header() {
    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
        </div>

        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>{leagueName}</div>
      </div>
    );
  }

  function Tabs() {
    const tabs: LeagueTab[] = ["Standings", "Fixtures", "Results"];
    return (
      <div style={tabBarStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(t === tab)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function MovementCircle({ movement }: { movement: "same" | "up" | "down" }) {
    const isUp = movement === "up";
    const isDown = movement === "down";
    const isSame = movement === "same";
    const bg = isUp ? "#22C55E" : isDown ? "#EF4444" : "rgba(0,0,0,0.12)";
    const symbol = isUp ? "▲" : isDown ? "▼" : "=";

    return (
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: "white",
          fontWeight: 900,
          fontSize: isSame ? 12 : 10,
          lineHeight: "12px",
        }}
      >
        {symbol}
      </span>
    );
  }

  function StandingsTab() {
    // horizontally scrollable table
    return (
      <>
        <div style={listBox}>
          <div style={{ padding: "10px 10px", overflowX: "auto" }}>
            <div style={{ minWidth: 560 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 40px 40px 40px 40px 50px 50px 50px 10px",

                  gap: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  opacity: 0.7,
                  paddingBottom: 8,
                }}
              >
                <div>Rk</div>
                <div>Team</div>
                <div>P</div>
                <div>W</div>
                <div>D</div>
                <div>L</div>
                <div>PF</div>
                <div>PA</div>
                <div>PD</div>
                <div style={{ textAlign: "right" }}>Pts</div>
              </div>

              {standings.map((r) => (
                <div
                  key={r.rank}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 40px 40px 40px 40px 50px 50px 50px 10px",

                    gap: 8,
                    alignItems: "center",
                    padding: "10px 0",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 14, textAlign: "right", fontWeight: 900 }}>{r.rank}</span>
                    <MovementCircle movement={r.movement} />
                  </div>
                  <div style={{ fontWeight: 500 }}>{r.teamName}</div>
                  <div>{r.played}</div>
                  <div>{r.wins}</div>
                  <div>{r.draws}</div>
                  <div>{r.losses}</div>
                  <div>{r.pf}</div>
                  <div>{r.pa}</div>
                  <div>{r.pd}</div>
                  <div style={{ textAlign: "right", fontWeight: 900 }}>{r.pts}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
          League Code: {leagueCode}
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <button
            onClick={() => setModal({ type: "join" })}
            style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
          >
            Join League
          </button>

          <button
            onClick={() => setModal({ type: "create" })}
            style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
          >
            Create New League
          </button>

          <button
            onClick={() => setModal({ type: "settings" })}
            style={outlinePillButton()}
          >
            League Settings
          </button>
        </div>
      </>
    );
  }

  function FixturesTab() {
    const future = fixtures.filter((w) => !isFantasyWeekComplete(w.weekNo));
    return (
      <div style={listBox}>
        {future.map((w: FixtureWeek, idx) => {
  const isPlayoffGroup = w.weekNo > regularWeeks;

  return (

          <div key={w.weekNo} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>
            <div
  style={{
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    background: "rgba(15,23,42,0.08)",   // darker strip
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    letterSpacing: 0.4,
  }}
>
  {`Week ${w.weekNo}`}
</div>

            {w.rows.map((r, i) => {
const isLabelRow = !!r.label;

if (isLabelRow) {
  const isFinalsHeader = isPlayoffsKind(r.kind ?? null);

  return (
    <React.Fragment key={`${w.weekNo}-${i}`}>
      {/* Finals/label header */}
      <div
  style={
    isFinalsHeader
      ? (isGrandFinalHeader(r) ? grandFinalLabelStyle : finalsLabelStyle)
      : {
          padding: "9px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 900,
          textAlign: "center",
          opacity: 0.9,
        }
  }
>
  {r.home}
</div>

      {/* If it's a finals header, show a placeholder matchup under it */}
      {shouldInjectPlaceholder(r) && (
        <div style={finalsPlaceholderRowStyle}>
          <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
          <div style={{ opacity: 0.8, fontWeight: 800 }}>v</div>
          <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
  const isHomeBye = r.home === "BYE";
  const isAwayBye = r.away === "BYE";
  const isBye = isHomeBye || isAwayBye;
  const realTeamName = isHomeBye ? r.away : r.home;
const realTeamId = isHomeBye ? (r.awayTeamId ?? null) : (r.homeTeamId ?? null);
  
if (isBye) {
  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        // background: "rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {realTeamName}
      </div>

      <div
        style={{

          padding: "2px 10px",
          borderRadius: 999,
          background: "rgba(15,23,42,0.08)",
          fontWeight: 700,
          fontSize: 10,
        }}
      >
        BYE
      </div>
    </div>
  );
}

  const realTeam = isHomeBye ? r.away : r.home;
  const played = rowPlayed(r, w.weekNo);

  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: 10,
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        alignItems: "center",
        opacity: isBye ? 0.9 : 1,
      }}
    >
      <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isHomeBye ? realTeam : r.home}
      </div>

      <div style={{ opacity: 0.8, fontWeight: 700 }}>
        {isBye ? "BYE" : "v"}
      </div>

      <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isAwayBye ? realTeam : r.away}
      </div>
    </div>
  );
})}


          </div>
        );
      })}
      </div>
    );
  }

function hasPlayedResult(w: FixtureWeek) {
  return isFantasyWeekComplete(w.weekNo);
}



  function ResultsTab() {
    const past = fixtures
  .filter((w) => isFantasyWeekComplete(w.weekNo))
  .slice()
  .reverse();

    return (
      <div style={listBox}>
        {past.map((w, idx) => (
          <div key={w.weekNo} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>

  {/* Week heading */}
  <div
  style={{
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    background: "rgba(15,23,42,0.08)",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    letterSpacing: 0.4,
  }}
>
  Week {w.weekNo}
</div>



  {/* existing match rows below */}
{w.rows.map((r, i) => {
  const isLabelRow = !!r.label;

if (isLabelRow) {
  const isFinalsHeader = isPlayoffsKind(r.kind ?? null);

  return (
    <React.Fragment key={`${w.weekNo}-${i}`}>
      <div
  style={
    isFinalsHeader
      ? (isGrandFinalHeader(r) ? grandFinalLabelStyle : finalsLabelStyle)
      : {
          padding: "9px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 900,
          textAlign: "center",
          opacity: 0.9,
        }
  }
>
  {r.home}
</div>

      {shouldInjectPlaceholder(r) && (
        <div style={finalsPlaceholderRowStyle}>
          <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
          <div style={{ opacity: 0.8, fontWeight: 800 }}>v</div>
          <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

  const isHomeBye = r.home === "BYE";
  const isAwayBye = r.away === "BYE";
  const isBye = isHomeBye || isAwayBye;

  const played = rowPlayed(r, w.weekNo);

  const realTeamName = isHomeBye ? r.away : r.home;
  const realTeamId = isHomeBye ? (r.awayTeamId ?? null) : (r.homeTeamId ?? null);

  const byePoints =
    isBye && realTeamId ? scoreFromSheet(w.weekNo, realTeamId) : null;

      // ✅ BYE row (same format as Fixtures tab, but includes score)
  if (isBye) {
    return (
      <div
        key={`${w.weekNo}-${i}`}
        style={{
          padding: "8px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(15,23,42,0.04)",
        }}
      >
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {realTeamName}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* score chip */}
          <div
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.10)",
              fontWeight: 900,
              fontSize: 10,
            }}
            title="Your score this week"
          >
            {byePoints ?? "—"}
          </div>

          {/* BYE chip */}
          <div
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.08)",
              fontWeight: 700,
              fontSize: 10,
            }}
          >
            BYE
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: 10,
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        alignItems: "center",
      }}
    >
      {/* Left side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isHomeBye ? realTeamName : r.home}
        </div>

        <div style={{ fontWeight: 900, textAlign: "right", minWidth: 22 }}>
          {isBye ? (isHomeBye ? byePoints : "—") : (r.homeScore ?? "—")}
        </div>
      </div>

      {/* Middle */}
<div style={{ opacity: 0.8, fontWeight: 700 }}>
  {isBye ? "BYE" : "v"}
</div>

      {/* Right side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 900, textAlign: "left", minWidth: 22 }}>
          {isBye ? (isAwayBye ? byePoints : "—") : (r.awayScore ?? "—")}
        </div>

        <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isAwayBye ? realTeamName : r.away}
        </div>
      </div>

      
    </div>
  );
})}


          </div>
        ))}
      </div>
    );
  }


  function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "92%",
            maxWidth: 420,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

function JoinLeagueModal() {
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalOverlay onClose={() => setModal(null)}>
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(to bottom, #0f172a, #2563eb)",
          padding: 14,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          position: "relative",
        }}
      >
        <button
          onClick={() => setModal(null)}
          aria-label="Close"
          style={{
            position: "absolute",
            right: 10,
            top: 10,
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

        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>Join League</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle()}
            placeholder="League Code"
          />

          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={inputStyle()}
            placeholder="Team Name"
          />


          {error && (
            <div style={{ marginTop: 4, color: "#FCA5A5", fontSize: 12, fontWeight: 800 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              
                onClick={async () => {
  const res = await joinLeagueByCode({ code, teamName });
  if (!res.ok) setError(res.error);
  else setModal(null);

              }}
              style={{ ...saveButton(), height: 36, padding: "0 18px" }}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}



  function CreateLeagueModal() {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");

  const [draftLocal, setDraftLocal] = useState(() => {
  // default: today + 1 hour
  const now = Date.now();
  return toDatetimeLocal(now + 60 * 60 * 1000);
});

  const [playoffs, setPlayoffs] = useState<PlayoffFormat>("final4");
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalOverlay onClose={() => setModal(null)}>
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(to bottom, #0f172a, #2563eb)",
          padding: 14,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          position: "relative",
        }}
      >
        <button
          onClick={() => setModal(null)}
          aria-label="Close"
          style={{
            position: "absolute",
            right: 10,
            top: 10,
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

        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>Create League</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle()}
            placeholder="League Name"
          />

          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={inputStyle()}
            placeholder="Your Team Name"
          />


          <select
            value={playoffs}
            onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)}
            style={selectStyle()}
          >
            <option value="none">None</option>
            <option value="final2">2 Teams (Final only)</option>
            <option value="final3">3 Teams (Qualifying Final)</option>
            <option value="final4">4 Teams (Semi + Final)</option>
          </select>

          <input
  type="datetime-local"
  value={draftLocal}
  onChange={(e) => setDraftLocal(e.target.value)}
  style={inputStyle()}
/>


          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, lineHeight: "14px" }}>
            League Commissioner can change/set draft order in league settings prior to the draft
          </div>

          {error && <div style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 800 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              onClick={async () => {
  const draftAt = parseDatetimeLocal(draftLocal);

  const res = await createLeague({
    name,
    teamName,
    playoffFormat: playoffs,
    draftDateTimeText: draftLocal,
    draftAt,
  });

  if (!res.ok) setError(res.error);
  else setModal(null);
}}
              style={{ ...saveButton(), height: 36, padding: "0 18px" }}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}



  function LeagueSettingsModal() {
    if (!league) return null;

    const [name, setName] = useState(league.name);
    const [draftLocal, setDraftLocal] = useState(
  league.draftDateTimeText || (league.draftAt ? toDatetimeLocal(league.draftAt) : "")
);
const [startRound, setStartRound] = useState<number>(league.startRound ?? 1);
    const [playoffs, setPlayoffs] = useState<PlayoffFormat>(league.playoffFormat);
const REAL_REGULAR_ROUNDS = league.realRegularSeasonRounds ?? 16;
const FANTASY_REGULAR_WEEKS_CAP = 14;
const computedRegularWeeks = Math.max(
  1,
  Math.min(FANTASY_REGULAR_WEEKS_CAP, REAL_REGULAR_ROUNDS - startRound + 1)
);

const selectedPlayoffWeeks =
  playoffs === "final4" ? 2 :
  playoffs === "final3" ? 2 :
  playoffs === "final2" ? 1 :
  0;

const computedSeasonWeeks = computedRegularWeeks + selectedPlayoffWeeks;

    const readOnly = !isCreator;

    // Draft order (editable)
const [draftOrderIds, setDraftOrderIds] = useState<string[]>(() =>
  league.teams.map((t) => t.id)
);

// If the active league changes while modal open, reset draft order list
useEffect(() => {
  setDraftOrderIds(league.teams.map((t) => t.id));
}, [league.id, league.teams]);

function moveTeam(fromIdx: number, toIdx: number) {
  setDraftOrderIds((prev) => {
    if (toIdx < 0 || toIdx >= prev.length) return prev;
    const next = [...prev];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    return next;
  });
}



    return (
      <ModalOverlay onClose={() => setModal(null)}>
        <div
          style={{
            borderRadius: 14,
            background: "linear-gradient(to bottom, #0f172a, #2563eb)",
            padding: 14,
            color: "white",
            boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
            position: "relative",
          }}
        >
          <button
            onClick={() => setModal(null)}
            aria-label="Close"
            style={{
              position: "absolute",
              right: 10,
              top: 10,
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

          <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>League Settings</div>

          <Field label="Change League Name">
  <input
    disabled={readOnly}
    value={name}
    onChange={(e) => setName(e.target.value)}
    style={inputStyle(readOnly)}
  />
</Field>

<Field label="Change Playoff Format">
  <select
    disabled={readOnly}
    value={playoffs}
    onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)}
    style={selectStyle(readOnly)}
  >
    <option value="none">None</option>
    <option value="final2">2 Teams (Final only)</option>
    <option value="final3">3 Teams (Qualifying Final)</option>
    <option value="final4">4 Teams (Semi + Final)</option>
  </select>
</Field>

<Field label="Start Round (Real Super Rugby Round)">
  <input
    disabled={readOnly}
    type="number"
    min={1}
    max={REAL_REGULAR_ROUNDS}
    value={startRound}
    onChange={(e) => setStartRound(Number(e.target.value || 1))}
    style={inputStyle(readOnly)}
  />
    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, marginTop: 6 }}>
    Fantasy regular season weeks: {computedRegularWeeks} (of {REAL_REGULAR_ROUNDS})<br/>
    Total season weeks (incl finals): {computedSeasonWeeks}
  </div>
</Field>

<Field label="Change Draft Date & Time">
  <input
    disabled={readOnly}
    type="datetime-local"
    value={draftLocal}
    onChange={(e) => setDraftLocal(e.target.value)}
    style={inputStyle(readOnly)}
  />
</Field>




          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
            Draft Order
          </div>

          <div
            style={{
              marginTop: 8,
              borderRadius: 10,
              overflow: "hidden",
              background: "rgba(255,255,255,0.92)",
              color: "#0f172a",
              border: "1px solid rgba(0,0,0,0.10)",
            }}
          >
            {draftOrderIds.map((teamId, idx) => {
  const t = league.teams.find((x) => x.id === teamId);
  if (!t) return null;

  const upDisabled = readOnly || idx === 0;
  const downDisabled = readOnly || idx === draftOrderIds.length - 1;

  return (
    <div
      key={t.id}
      style={{
        display: "grid",
        gridTemplateColumns: "26px 1fr auto",
        gap: 10,
        padding: "10px 10px",
        borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 700,
        alignItems: "center",
      }}
    >
      <div style={{ opacity: 0.7 }}>{idx + 1}</div>

      <div>{t.name}</div>

      {/* Up/Down controls */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={upDisabled}
          onClick={() => moveTeam(idx, idx - 1)}
          style={{
            height: 28,
            width: 34,
            borderRadius: 10,
            border: "none",
            background: "#E2E8F0",
            color: "#0f172a",
            fontWeight: 900,
            cursor: upDisabled ? "not-allowed" : "pointer",
            opacity: upDisabled ? 0.45 : 1,
          }}
          aria-label="Move team up"
        >
          ▲
        </button>

        <button
          disabled={downDisabled}
          onClick={() => moveTeam(idx, idx + 1)}
          style={{
            height: 28,
            width: 34,
            borderRadius: 10,
            border: "none",
            background: "#E2E8F0",
            color: "#0f172a",
            fontWeight: 900,
            cursor: downDisabled ? "not-allowed" : "pointer",
            opacity: downDisabled ? 0.45 : 1,
          }}
          aria-label="Move team down"
        >
          ▼
        </button>
      </div>
    </div>
  );
})}

          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button
              disabled={readOnly}
              onClick={() => {
                const draftAt = parseDatetimeLocal(draftLocal);

updateLeagueSettings(league.id, {
  name,
  playoffFormat: playoffs,
  draftDateTimeText: draftLocal,
  draftAt,
  startRound,
  totalWeeks: computedSeasonWeeks, // ✅ IMPORTANT: includes finals weeks
});


                setDraftOrder(league.id, draftOrderIds);

                setModal(null);
              }}
              style={{
                ...saveButton(),
                opacity: readOnly ? 0.45 : 1,
                cursor: readOnly ? "not-allowed" : "pointer",
              }}
            >
              Save
            </button>
          </div>
        </div>
      </ModalOverlay>
    );
  }

  function ModalCard({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
      <div
        style={{
          borderRadius: 14,
          background: "rgba(255,255,255,0.20)",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          color: "white",
        }}
      >
        <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 12 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
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
        </div>
        <div style={{ padding: 12, display: "grid", gap: 10 }}>{children}</div>
      </div>
    );
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.9 }}>{label}</div>
        {children}
      </div>
    );
  }

  function pillButton(bg: string): React.CSSProperties {
    return {
      height: 40,
      width: "100%",
      borderRadius: 999,
      background: bg,
      color: "white",
      fontSize: 13,
      fontWeight: 800,
      border: "2px solid rgba(255,255,255,0.85)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      cursor: "pointer",
    };
  }

  function outlinePillButton(): React.CSSProperties {
    return {
      height: 36,
      width: "100%",
      borderRadius: 999,
      background: "rgba(255,255,255,0.12)",
      color: "white",
      fontSize: 12,
      fontWeight: 800,
      border: "2px solid rgba(255,255,255,0.85)",
      cursor: "pointer",
    };
  }

  function menuItem(active: boolean): React.CSSProperties {
    return {
      textAlign: "left",
      padding: "10px 12px",
      borderRadius: 10,
      background: active ? "rgba(255,255,255,0.25)" : "transparent",
      border: "none",
      color: "white",
      fontSize: 14,
      fontWeight: active ? 800 : 600,
      cursor: "pointer",
    };
  }

  function inputStyle(disabled = false): React.CSSProperties {
  return {
    width: "100%",
    height: 36,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    padding: "0 10px",
    fontSize: 13,
    fontWeight: 800,
    outline: "none",
    background: disabled ? "rgba(255,255,255,0.75)" : "#FFFFFF",
    color: "#0f172a",
    opacity: disabled ? 0.75 : 1,
  };
}


  function selectStyle(disabled = false): React.CSSProperties {
  return {
    width: "100%",
    height: 36,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    padding: "0 10px",
    fontSize: 13,
    fontWeight: 800,
    outline: "none",
    background: disabled ? "rgba(255,255,255,0.75)" : "#FFFFFF",
    color: "#0f172a",
    opacity: disabled ? 0.75 : 1,
  };
}


  function saveButton(): React.CSSProperties {
    return {
      height: 34,
      borderRadius: 999,
      padding: "0 18px",
      background: "#22C55E",
      border: "none",
      color: "white",
      fontWeight: 900,
      fontSize: 12,
      cursor: "pointer",
    };
  }

  // Still booting → show loading
if (!mounted || !leagueHydrated) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Loading…</div>
        </div>
      </div>
    </main>
  );
}

// We have leagues but activeLeagueId hasn't resolved yet → wait one tick
if (!league && (leagues?.length ?? 0) > 0) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Loading…</div>
        </div>
      </div>
    </main>
  );
}

// NOW it's truly no leagues
if (!league) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>No active league</div>
          <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12, fontWeight: 700 }}>
            Join a league with a code, or create a new league.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <button
              onClick={() => setModal({ type: "join" })}
              style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
            >
              Join League
            </button>

            <button
              onClick={() => setModal({ type: "create" })}
              style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
            >
              Create New League
            </button>
          </div>
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeagueId}
        setActiveLeague={setActiveLeague}
        activeItem="League"
      />

      {modal?.type === "join" && <JoinLeagueModal />}
      {modal?.type === "create" && <CreateLeagueModal />}
    </main>
  );
}

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <Header />
        <Tabs />

        {tab === "Standings" && <StandingsTab />}
        {tab === "Fixtures" && <FixturesTab />}
        {tab === "Results" && <ResultsTab />}
      </div>

      <AppMenu
  open={menuOpen}
  onClose={() => setMenuOpen(false)}
  leagues={leagues}
  activeLeagueId={activeLeagueId}
  setActiveLeague={setActiveLeague}
  activeItem="League"
/>



      {modal?.type === "join" && <JoinLeagueModal />}
      {modal?.type === "create" && <CreateLeagueModal />}
      {modal?.type === "settings" && <LeagueSettingsModal />}
    </main>
  );
}

function GradientBg() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        background:
          "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
      }}
    />
  );
}
