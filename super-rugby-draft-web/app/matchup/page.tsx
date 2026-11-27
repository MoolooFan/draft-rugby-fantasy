"use client";

import { useIsClient } from "@/lib/hooks/useIsClient";
import { benchOf, startersOf } from "@/lib/scoring/week";
import { slotShortLabel, STANDARD_SQUAD } from "@/lib/league/squad";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getActiveUsername } from "@/lib/session";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";

import { useFixturesWithScores } from "@/lib/fixtures/useScores";
import { currentSeasonYear, fixturesByFantasyWeek, getSeason, roundLabel, SEASONS, teamListsReadAtMs } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();

import { AppMenu } from "@/components/AppMenu";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";

import { PlayerCardModal } from "@/components/PlayerCardModal";
import { PointsBreakdownModal } from "@/components/PointsBreakdownModal";
import { usePlayersStore } from "@/lib/players/store";
import { CAPTAIN_MULTIPLIER, roundPoints, statCountsFromRow } from "@/lib/scoring";
import { useIsDesktop } from "@/lib/ui/useIsDesktop";
import { statLineText } from "@/components/matchup/helpers";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { toMs, pickValue } from "@/lib/league/weekHelpers";
import { formatProjection, projectionFor, useProjections } from "@/lib/projections/useProjections";
import { remainingShare, teamOutlook, winProbability, type PlayerWeekState } from "@/lib/projections/live";
import { irIdsOf } from "@/lib/league/ir";
import type { Lineup as ScoringLineup } from "@/lib/scoring/week";
import { MatchupHeader } from "@/components/matchup/MatchupHeader";
import { Scoreboard, type ScoreboardSide } from "@/components/matchup/Scoreboard";
import { BenchHeader, LineupRow, type CellPill, type LineupCell } from "@/components/matchup/LineupRow";
import {
  buildBreakdownRows,
  calcFantasyPoints,
  currentWeekFromSheet,
  exactId,
  fixtureTagFor,
  isFixtureComplete,
  isSheetPlayableRow,
  jerseySrcForPlayer,
  latestCompletedWeekFromSheet,
  listBox,
  matchupSnapshotKey,
  normaliseId,
  rosterContainsPlayer,
  rosterDataToLineup,
  rowPlayerId,
  rowRound,
  teamRecords,
  teamSelectionFallbackSnapshot,
  teamStreaks,
  useNowTick,
  type AnyFixture,
  type Lineup,
  type LockedSnapshot,
  type Player,
  type SheetFixtureRow,
  type SlotId,
  type Streak,
  type TeamRecord,
} from "@/components/matchup/helpers";

export default function MatchupPage() {
  useRequireSession();
  // computers: a wider page with full names and each player's key stats (Ethan, 27 Nov 2026)
  const isDesktop = useIsDesktop();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
const [pointsOpen, setPointsOpen] = useState(false);
const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
  const mounted = useIsClient();

const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
const [selectedOwned, setSelectedOwned] = useState(false);
const [selectedSide, setSelectedSide] = useState<"left" | "right">("left");
const [selectedFixtureLabel, setSelectedFixtureLabel] = useState<string>("—");
const [selectedRows, setSelectedRows] = useState<Array<{ label: string; right?: string; count?: string }>>([]);

  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useLeagueStore((s) => s.activeLeague());
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  const userId = useMemo(() => getActiveUsername(), []);
  
const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

useEffect(() => {
  if (!activeLeague?.id) return;
  if (typeof window === "undefined") return;

  fetch(`/api/watchlist?leagueId=${encodeURIComponent(activeLeague.id)}`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) {
        console.error("watchlist GET failed", j?.error);
        setWatchlistSet(new Set());
        return;
      }
      const ids = Array.isArray(j.data) ? j.data : [];
      setWatchlistSet(new Set(ids.map((x: any) => normaliseId(x))));
    })
    .catch((e) => console.error("watchlist GET error", e));
}, [activeLeague?.id]);

const selectedPlayerId = selectedPlayer?.id;
const selectedIsWatched = useMemo(() => {
  if (!selectedPlayerId) return false;
  return watchlistSet.has(normaliseId(selectedPlayerId));
}, [watchlistSet, selectedPlayerId]);

useEffect(() => {
  if (!activeLeague?.id) return;

  const season = currentSeasonYear();
  fetch(`/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(activeLeague.id)}`)
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id]);

const lastCompletedWeek = useMemo(() => {
  if (!sheetFixtures.length) return (activeLeague?.currentWeek ?? 1) - 1;
  return latestCompletedWeekFromSheet(sheetFixtures);
}, [sheetFixtures, activeLeague?.currentWeek]);

const recordByTeamId = useMemo(() => teamRecords(sheetFixtures, lastCompletedWeek), [sheetFixtures, lastCompletedWeek]);

const streakByTeamId = useMemo(() => teamStreaks(sheetFixtures, lastCompletedWeek), [sheetFixtures, lastCompletedWeek]);

  // Your team id (league team)
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();

const yourLeagueTeamId = useMemo(() => {
  const l = activeLeague;
  const teams = Array.isArray(l?.teams) ? l!.teams : [];
  if (!teams.length) return null;

  if (userId) {
    const me = norm(userId);
    const t = teams.find((x: any) => norm(x?.userId) === me);
    if (t?.id) return t.id;
  }

  return teams[0]?.id ?? null;
}, [activeLeague, userId]);

  // Draft teams for name lookup
  const draftTeams = useDraftStore((s) => s.teams);
const getLivePlayerById = useDraftStore((s) => (s as any).getLivePlayerById ?? null);

  // team picture (E5) and initials for the scoreboard
  const teamPicture = (id: string | null) => (activeLeague?.teams?.find((t) => t.id === id) as any)?.pictureUrl ?? null;
  const teamStars = (id: string | null) => (activeLeague?.teams?.find((t) => t.id === id) as any)?.stars ?? 0;
  const teamInitials = (id: string | null) => {
    const t: any = activeLeague?.teams?.find((x) => x.id === id);
    return t?.userInitials ?? t?.initials ?? null;
  };

  const nameByTeamId = (id: string | null) => {
    if (!id) return "BYE";
    return draftTeams.find((t) => t.id === id)?.name
      ?? activeLeague?.teams?.find((t) => t.id === id)?.name
      ?? "TBC";
  };

  // --- Determine "current week" and deadline from fixtures JSON ---
  // with the real final scores (lib/fixtures/useScores.ts), so finished games count as finished
  const fixtures = useFixturesWithScores(fixturesData as AnyFixture[]);
  const normalizedFixtures = useMemo(() => {
    return fixtures
      .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
      .sort((a, b) => (a as any).kickoffMs - (b as any).kickoffMs);
  }, [fixtures]);

  const nowMs = useNowTick(10_000);

// 1) The week we are currently selecting for (drives the deadline)
const selectionWeek = useMemo(() => {
  if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
  return currentWeekFromSheet(sheetFixtures); // first non-complete week from sheet
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

// The upcoming round's team lists are read at 4:30pm NZ time on the Wednesday before it
// (lib/season). From then the page shows the upcoming matchup (Ethan, 12 Nov 2026): both
// lineups as saved so far, projections and win probability based on the real team lists.
const listsOutMs = useMemo(() => {
  const yr = currentSeasonYear();
  return SEASONS[yr] && selectionRealRound > 0 ? teamListsReadAtMs(getSeason(yr), selectionRealRound) : null;
}, [selectionRealRound]);
const upcomingShown = deadlineLocked || (listsOutMs != null && nowMs >= listsOutMs);

// 2) The week the Matchup page should DISPLAY
// - until the team lists come out (Wednesday 4:30pm NZ): the previous week's result
// - from then: the selection week (before the deadline: "UPCOMING", lineups can still change)
// - the arrows beside the round name go back to earlier rounds (Ethan, 19 Nov 2026), or ?week=N
const latestWeek = upcomingShown ? selectionWeek : selectionWeek - 1; // can be 0 (pre-season)
const [weekPick, setWeekPick] = useState<number | null>(null);
useEffect(() => {
  const w = Number(new URLSearchParams(window.location.search).get("week"));
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if (Number.isInteger(w) && w > 0) setWeekPick(w);
}, []);
const displayWeek = useMemo(() => {
  if (weekPick == null || latestWeek <= 0) return latestWeek;
  return Math.min(Math.max(1, weekPick), latestWeek);
}, [weekPick, latestWeek]);
const goWeek = (w: number) => setWeekPick(w >= latestWeek ? null : Math.max(1, w));

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

const playersByInternalId = useMemo(() => {
  const m = new Map<string, any>();

  for (const p of sheetPlayers ?? []) {
    const internalId =
      pickValue(p, ["id", "draftId", "draft_id", "Draft ID", "playerKey"]) ?? null;

    if (internalId != null) {
      const exact = exactId(internalId);
      const norm = normaliseId(internalId);

      if (exact) m.set(exact, p);
      if (norm) m.set(norm, p);
    }
  }

  return m;
}, [sheetPlayers]);

function getPlayerInternalIds(p: Player | null) {
  if (!p?.id) return { exact: null as string | null, norm: null as string | null };

  return {
    exact: exactId(p.id),
    norm: normaliseId(p.id),
  };
}

const weekPointsByPlayerId = useMemo(() => {
  const m = new Map<string, number>();

  for (const row of roundRows ?? []) {
    if (rowRound(row) !== displayRealRound) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const exact = exactId(pidRaw);
    const norm = normaliseId(pidRaw);

    const playerMeta =
      playersByInternalId.get(exact) ??
      playersByInternalId.get(norm) ??
      null;

    const pts = calcFantasyPoints(row, playerMeta);

    if (exact) m.set(exact, pts);
    if (norm) m.set(norm, pts);
  }

  return m;
}, [roundRows, displayRealRound, playersByInternalId]);

const weekMinutesByPlayerId = useMemo(() => {
  const m = new Map<string, number>();

  for (const row of roundRows ?? []) {
    if (rowRound(row) !== displayRealRound) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const exact = exactId(pidRaw);
    const norm = normaliseId(pidRaw);

    const minRaw = pickValue(row, ["Minutes played", "minutes played", "Minutes Played", "minutes"]);
    const mins = Number(minRaw);
    const val = Number.isFinite(mins) ? mins : 0;

    if (exact) m.set(exact, val);
    if (norm) m.set(norm, val);
  }

  return m;
}, [roundRows, displayRealRound]);

// computers: each player's stat line this round
const weekStatLineByPlayerId = useMemo(() => {
  const m = new Map<string, string>();
  if (!isDesktop) return m;
  for (const row of roundRows ?? []) {
    if (rowRound(row) !== displayRealRound) continue;
    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;
    const line = statLineText(statCountsFromRow(row));
    if (!line) continue;
    const exact = exactId(pidRaw), norm = normaliseId(pidRaw);
    if (exact) m.set(exact, line);
    if (norm) m.set(norm, line);
  }
  return m;
}, [roundRows, displayRealRound, isDesktop]);

function pointsForPlayer(p: Player | null) {
  const { exact, norm } = getPlayerInternalIds(p);

  if (exact && weekPointsByPlayerId.has(exact)) {
    return weekPointsByPlayerId.get(exact) ?? 0;
  }

  if (norm && weekPointsByPlayerId.has(norm)) {
    return weekPointsByPlayerId.get(norm) ?? 0;
  }

  return 0;
}

function hasScoreForPlayer(p: Player | null) {
  const { exact, norm } = getPlayerInternalIds(p);

  if (exact && weekPointsByPlayerId.has(exact)) return true;
  if (norm && weekPointsByPlayerId.has(norm)) return true;

  return false;
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

  const [matchupIdxPicked, setMatchupIdx] = useState(0);

  const [tsTick, setTsTick] = useState(0);

useEffect(() => {
  // refresh when tab gains focus (covers "save in another page then come back")
  const onFocus = () => setTsTick((x) => x + 1);
  window.addEventListener("focus", onFocus);
  return () => window.removeEventListener("focus", onFocus);
}, []);

  // back to your own matchup when the round changes (set while drawing, not in an effect)
  const [defaultFor, setDefaultFor] = useState(defaultIndex);
  if (defaultFor !== defaultIndex) {
    setDefaultFor(defaultIndex);
    setMatchupIdx(defaultIndex);
  }
  // a matchup that no longer exists (fewer games this round): the first one
  const matchupIdx = matchupIdxPicked < matchupsThisWeek.length ? matchupIdxPicked : 0;

  const matchup = matchupsThisWeek[matchupIdx] ?? null;

// Home team on the left, away team on the right, always (Ethan, 23 Nov 2026), even when you're away
const leftTeamId = matchup?.homeTeamId ?? null;
const rightTeamId = matchup?.awayTeamId ?? null;

// the league's squad (lib/league/squad.ts): its starting slots, bench and IR spots
const squad = activeLeague?.squadFormat ?? STANDARD_SQUAD;
const STARTER_SLOTS: SlotId[] = startersOf(squad);
const BENCH_SLOTS: SlotId[] = benchOf(squad);

const leftName = nameByTeamId(leftTeamId);
const rightName = nameByTeamId(rightTeamId);

  // --- Read locked snapshots for both teams (or blank) ---
const leagueId = activeLeague?.id ?? null;
const hasLeagueId = !!leagueId; // ✅ safeguard

type RosterApiRow = { team_id: string; data: any };

const [rosterByTeamId, setRosterByTeamId] = useState<Map<string, any>>(new Map());
const [selectionByTeamId, setSelectionByTeamId] = useState<Map<string, any>>(new Map());

const ownerTeamIdForSelected = useMemo(() => {
  if (!selectedPlayerId) return null;

  for (const [teamId, roster] of rosterByTeamId.entries()) {
    if (rosterContainsPlayer(roster, selectedPlayerId)) return teamId;
  }
  return null;
}, [selectedPlayerId, rosterByTeamId]);

const ownerTeamLabelForSelected = useMemo(() => {
  if (!selectedPlayer?.id) return "";
  if (!ownerTeamIdForSelected) return "Available";
  return nameByTeamId(ownerTeamIdForSelected);
}, [selectedPlayer?.id, ownerTeamIdForSelected, draftTeams, activeLeague?.teams]);

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

function serverSelectionSnapshot(
  leagueId: string | null,
  displayWeek: number,
  teamId: string | null
): LockedSnapshot | null {
  if (!leagueId || !teamId) return null;
  if (displayWeek <= 0) return null;

  const row = selectionByTeamId.get(teamId);
  if (!row) return null;

  const lineup =
    row.lineup ??
    row.data?.lineup ??
    row.selection?.lineup ??
    row.snapshot?.lineup ??
    null;

  if (!lineup) return null;

  return {
    week: displayWeek,
    teamId,
    lockedAtMs: 0,
    lineup: lineup as Lineup,
    captainId: row.captain_id ?? row.captainId ?? row.data?.captainId ?? null,
    viceId: row.vice_id ?? row.viceId ?? row.data?.viceId ?? null,
  };
}

useEffect(() => {
  if (!leagueId) return;
  if (displayWeek <= 0) return;

  fetch(`/api/team-selection/get?leagueId=${encodeURIComponent(leagueId)}&week=${displayWeek}`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) {
        console.error("team selection fetch failed", j?.error);
        return;
      }

      const m = new Map<string, any>();
      for (const row of (j.rows ?? [])) {
        const tid = String(row.team_id ?? row.teamId ?? "");
        if (tid) m.set(tid, row);
      }
      setSelectionByTeamId(m);
    })
    .catch((e) => console.error(e));
}, [leagueId, displayWeek]);

// Finalised results for the week (saved by the server when the round is finalised).
type WeekResultRow = { team_id: string; final_lineup: Lineup | null; picked_lineup?: Lineup | null; captain_used_id: string | null; score: number; tries: number };
const [weekResults, setWeekResults] = useState<{ week: number; finalised: boolean; byTeam: Map<string, WeekResultRow> }>({
  week: 0,
  finalised: false,
  byTeam: new Map(),
});

useEffect(() => {
  if (!hasLeagueId || displayWeek <= 0) return;
  let cancelled = false;
  fetch(`/api/matchups/week-results?leagueId=${encodeURIComponent(leagueId)}&week=${displayWeek}`, { cache: "no-store", credentials: "include" })
    .then((r) => r.json())
    .then((j) => {
      if (cancelled || !j?.ok) return;
      const byTeam = new Map<string, WeekResultRow>();
      for (const row of (j.rows ?? []) as WeekResultRow[]) byTeam.set(String(row.team_id), row);
      setWeekResults({ week: displayWeek, finalised: !!j.finalised, byTeam });
    })
    .catch((e) => console.error(e));
  return () => {
    cancelled = true;
  };
}, [hasLeagueId, leagueId, displayWeek]);

// The week is final once the server has finalised it (auto-subs done, scores locked in).
const scoresLocked = weekResults.week === displayWeek && weekResults.finalised;

function readFinalized(teamId: string | null): Lineup | null {
  if (!scoresLocked || !teamId) return null;
  return weekResults.byTeam.get(teamId)?.final_lineup ?? null;
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
const readSnapshot = (teamId: string | null): LockedSnapshot | null => {
  if (!mounted) return null;            // ✅ ADD
  if (typeof window === "undefined") return null;
  if (!hasLeagueId) return null;
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
  // 1) the lineup saved on the server (locked by the server at the deadline)
  const supa = serverSelectionSnapshot(leagueId, displayWeek, leftTeamId);
  if (supa) return supa;

  // 2) this browser's saved copy (older seasons)
  const snap = readSnapshot(leftTeamId);
  if (snap) return snap;

  // 3) local TS (legacy / convenience)
  const ts = teamSelectionFallbackSnapshot(leagueId, displayWeek, leftTeamId, mounted);
  if (ts) return ts;

  // 4) fallback to Supabase roster (only for current selection week)
  if (displayWeek === selectionWeek) return rosterFallbackSnapshot(leftTeamId);

  return null;
}, [
  leagueId,
  displayWeek,
  leftTeamId,
  selectionWeek,
  rosterByTeamId,
  selectionByTeamId,
  tsTick,
]);

const rightSnap = useMemo(() => {
  const supa = serverSelectionSnapshot(leagueId, displayWeek, rightTeamId);
  if (supa) return supa;

  const snap = readSnapshot(rightTeamId);
  if (snap) return snap;

  const ts = teamSelectionFallbackSnapshot(leagueId, displayWeek, rightTeamId, mounted);
  if (ts) return ts;

  if (displayWeek === selectionWeek) return rosterFallbackSnapshot(rightTeamId);

  return null;
}, [
  leagueId,
  displayWeek,
  rightTeamId,
  selectionWeek,
  rosterByTeamId,
  selectionByTeamId,
  tsTick,
]);

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
const CAP_MULT = CAPTAIN_MULTIPLIER;

const leftBase = leftLineup;
const rightBase = rightLineup;

const leftFinal = readFinalized(leftTeamId);
const rightFinal = readFinalized(rightTeamId);

const effectiveLeftLineup = leftFinal ?? leftBase;
const effectiveRightLineup = rightFinal ?? rightBase;

function pointsWithCaptain(p: Player | null, effCaptainId: string | null) {
  if (!p?.id) return 0;
  const base = pointsForPlayer(p);
  return p.id === effCaptainId ? base * CAP_MULT : base;
}

const selectedLive = useMemo(() => {
  if (!selectedPlayerId) return null;
  return typeof getLivePlayerById === "function"
    ? getLivePlayerById(selectedPlayerId)
    : null;
}, [getLivePlayerById, selectedPlayerId]);

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
    secondaryPosAbbrev: selectedPlayer.secondaryPosAbbrev ?? "",
    secondaryPosName: selectedPlayer.secondaryPosName ?? "",
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

async function addSelectedToWatchlist() {
  if (!activeLeague?.id) {
    alert("No active league.");
    return;
  }
  if (!selectedPlayer?.id) return;

  const payload = { leagueId: activeLeague.id, playerId: selectedPlayer.id };

  const res = await fetch("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    console.error("watchlist POST failed", j?.error);
    alert("Failed to add to watchlist.");
    return;
  }

  setWatchlistSet((prev) => {
    const next = new Set(prev);
    next.add(normaliseId(selectedPlayer.id));
    return next;
  });
}

async function removeSelectedFromWatchlist() {
  if (!activeLeague?.id) {
    alert("No active league.");
    return;
  }
  if (!selectedPlayer?.id) return;

  const qs = new URLSearchParams();
  qs.set("leagueId", activeLeague.id);
  qs.set("playerId", selectedPlayer.id);

  const res = await fetch(`/api/watchlist?${qs.toString()}`, {
    method: "DELETE",
    credentials: "include",
  });

  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) {
    console.error("watchlist DELETE failed", j?.error);
    alert("Failed to remove from watchlist.");
    return;
  }

  setWatchlistSet((prev) => {
    const next = new Set(prev);
    next.delete(normaliseId(selectedPlayer.id));
    return next;
  });
}

function goToTradeWithSelected(e?: any) {
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopPropagation) e.stopPropagation();

  const pid = selectedPlayer?.id;
  if (!pid) return;

  // Your team must exist (trade page refuses to guess)
  if (!yourLeagueTeamId) {
    alert("Could not determine your team.");
    return;
  }

  // ✅ In Matchup, the “partner” is the team you’re requesting the player FROM.
  // Since the player was clicked from a specific side, we can trust that side’s teamId.
  const ownerTeamId =
    selectedSide === "left" ? leftTeamId : rightTeamId;

  if (!ownerTeamId) {
    alert("Could not determine the owning team for this player.");
    return;
  }

  // Don’t allow trading with yourself (just in case)
  if (ownerTeamId === yourLeagueTeamId) {
    alert("You can’t trade for your own player.");
    return;
  }

  setCardOpen(false);

  // Optional but useful: make the X button return to this exact matchup page
  const returnTo =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "";

  const qs = new URLSearchParams();
  qs.set("partnerTeamId", ownerTeamId);
  qs.set("prefillRequestPlayerId", pid);
  if (returnTo) qs.set("returnTo", returnTo);

  router.push(`/trade/propose?${qs.toString()}`, { scroll: false });
}

// Who gets the captain's x2: the captain while the round is live; once final, the server's
// record (the vice-captain only if the captain didn't play).
// (Imported history weeks have no per-team record, so they keep the picked captain.)
const leftRes = scoresLocked && leftTeamId ? weekResults.byTeam.get(leftTeamId) : undefined;
const rightRes = scoresLocked && rightTeamId ? weekResults.byTeam.get(rightTeamId) : undefined;
const leftEffC = leftRes ? leftRes.captain_used_id : leftC;
const rightEffC = rightRes ? rightRes.captain_used_id : rightC;

function totalForSlots(lineup: Lineup | null, effCaptain: string | null, slots: SlotId[]) {
  if (!lineup) return 0;
  return roundPoints(slots.reduce((sum, sid) => sum + pointsWithCaptain(lineup[sid], effCaptain), 0));
}

const leftScore = totalForSlots(effectiveLeftLineup, leftEffC, STARTER_SLOTS);
const rightScore = totalForSlots(effectiveRightLineup, rightEffC, STARTER_SLOTS);

const leftBenchScore = totalForSlots(effectiveLeftLineup, leftEffC, BENCH_SLOTS);
const rightBenchScore = totalForSlots(effectiveRightLineup, rightEffC, BENCH_SLOTS);

// ---- The Shield: the holder's icon, and whether this matchup is a shield game (holder at home)
const shieldInfo = activeLeague?.shield?.enabled ? activeLeague.shield : null;
const pairIs = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && ((a === leftTeamId && b === rightTeamId) || (a === rightTeamId && b === leftTeamId));
// the team defending it in this game (the holder at home); the other team is challenging
const shieldDefender: string | null = (() => {
  if (!shieldInfo || displayWeek <= 0) return null;
  const g = shieldInfo.games.find((x) => x.week === displayWeek && pairIs(x.holderTeamId, x.otherTeamId));
  if (g) return g.kind === "defended" ? g.holderTeamId : g.otherTeamId;
  const n = shieldInfo.next;
  return n && n.week === displayWeek && pairIs(n.homeTeamId, n.awayTeamId) ? n.homeTeamId : null;
})();
const shieldTag = (teamId: string | null) =>
  !shieldDefender || !teamId ? null : teamId === shieldDefender ? "SHIELD DEFENCE" : "SHIELD CHALLENGE";
const holdsShield = (teamId: string | null) => !!shieldInfo && !!teamId && shieldInfo.holderTeamId === teamId;

// ---- Expected points + win probability (F2, ESPN-style; Ethan 19 Nov 2026):
// - Every week shows them, finished ones too (so you can see who beat their projection).
// - A player's projection is his pre-game one, except while his game is being played: then his
//   points so far + the rest of his projection. Once his game is over it's the pre-game one again.
// - The team totals: during the week, real points for games that are over, points so far + the
//   rest for games being played, projections for games to come (auto-subs for players ruled out
//   or who didn't get on). Once the week is final: the pre-game totals again.
// - Win probability from those; once the scores are final, 100% for the winner (50/50 a draw).
// Projections for a week only use stats from before it (lib/projections/server), so a finished
// week's are what they were before its games.
const weekProj = useProjections(hasLeagueId ? leagueId : null, mounted && displayWeek > 0 ? displayWeek : null);
const showProj = !!weekProj && weekProj.week === displayWeek;

function weekStateFor(id: string): PlayerWeekState | null {
  const pr = projectionFor(weekProj, id);
  if (!pr) return null;
  const ref = { id } as Player;
  const { exact, norm } = getPlayerInternalIds(ref);
  const minutes = (exact != null ? weekMinutesByPlayerId.get(exact) : undefined) ?? (norm != null ? weekMinutesByPlayerId.get(norm) : undefined) ?? 0;
  return {
    projected: pr.pts,
    spread: pr.spread,
    actual: hasScoreForPlayer(ref) ? pointsForPlayer(ref) : null,
    minutes,
    kickoffMs: pr.kickoffMs,
    ruledOut: pr.role === "out",
  };
}
/** The same, as it was before any games: no points yet. */
function preGameStateFor(id: string): PlayerWeekState | null {
  const st = weekStateFor(id);
  return st ? { ...st, actual: null, minutes: 0 } : null;
}

function outlookFor(lineup: Lineup | null, captainId: string | null, viceId: string | null, preGame = false) {
  if (!showProj || !lineup) return null;
  return teamOutlook({
    lineup: lineup as unknown as ScoringLineup,
    captainId,
    viceId,
    state: preGame ? preGameStateFor : weekStateFor,
    nowMs: preGame ? 0 : nowMs,
    format: squad,
  });
}
// the lineups as picked (before auto-subs) for a finished week's pre-game totals
const pickedLineupOf = (teamId: string | null): Lineup | null =>
  (teamId ? (weekResults.byTeam.get(teamId) as { picked_lineup?: Lineup | null } | undefined)?.picked_lineup : null) ?? null;
const leftOutlook = scoresLocked
  ? outlookFor(pickedLineupOf(leftTeamId) ?? effectiveLeftLineup, leftC, leftV, true)
  : outlookFor(effectiveLeftLineup, leftC, leftV);
const rightOutlook = scoresLocked
  ? outlookFor(pickedLineupOf(rightTeamId) ?? effectiveRightLineup, rightC, rightV, true)
  : outlookFor(effectiveRightLineup, rightC, rightV);
const leftWinPct = (() => {
  if (scoresLocked) {
    // final: all or nothing
    const l = Number(leftRes?.score ?? leftScore) || 0;
    const r = Number(rightRes?.score ?? rightScore) || 0;
    if (!leftTeamId || !rightTeamId) return null;
    return l > r ? 100 : l < r ? 0 : 50;
  }
  return leftOutlook && rightOutlook ? Math.round(winProbability(leftOutlook, rightOutlook) * 100) : null;
})();

/** A player's projection for the row (x2 for the captain, like his points): live while his game is on. */
function projText(p: Player | null, captainId: string | null): string | null {
  if (!showProj || !p?.id) return null;
  const st = weekStateFor(p.id);
  if (!st) return null;
  const share = st.ruledOut ? 0 : remainingShare(st, nowMs);
  const live = !scoresLocked && share > 0 && share < 1; // his game is being played
  const pts = live ? (st.actual ?? 0) + st.projected * share : st.projected;
  return formatProjection(p.id === captainId ? pts * CAP_MULT : pts);
}

// TEMP placeholders until you wire real data
const leftRecord = (leftTeamId ? recordByTeamId.get(leftTeamId) : null) ?? { w: 0, l: 0, d: 0 };
const rightRecord = (rightTeamId ? recordByTeamId.get(rightTeamId) : null) ?? { w: 0, l: 0, d: 0 };

const leftStreak: Streak = (leftTeamId ? streakByTeamId.get(leftTeamId) : null) ?? null;
const rightStreak: Streak = (rightTeamId ? streakByTeamId.get(rightTeamId) : null) ?? null;

// Fixture tag for player rows for THIS week
const fixtureTagForPlayer = (p: Player | null) => fixtureTagFor(p, normalizedFixtures, displayRealRound);

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
  const { exact: pidExact, norm: pidNorm } = getPlayerInternalIds(p);

  const row =
    (roundRows ?? []).find((r: any) => {
      if (rowRound(r) !== displayRealRound) return false;
      const rid = rowPlayerId(r);
      if (!rid) return false;

const ridExact = exactId(rid);
const ridNorm = normaliseId(rid);

return (
  (pidExact != null && ridExact === pidExact) ||
  (pidNorm != null && ridNorm === pidNorm)
);
    }) ?? null;

  setSelectedRows(row ? buildBreakdownRows(row, p) : []);
  setPointsOpen(true);
}

  // Row order (matches your design)
  const ROWS: Array<{ slot: SlotId; label: string }> = STARTER_SLOTS.map((slot) => ({ slot, label: slotShortLabel(slot) }));

  

  const BENCH_ROWS: Array<{ slot: SlotId; label: string; ir?: boolean; irIndex?: number }> = [
    ...BENCH_SLOTS.map((slot) => ({ slot, label: slotShortLabel(slot) })),
    // the team's injury reserve players (as the roster is now; IR players don't score)
    ...Array.from({ length: squad.ir }, (_, i) => ({ slot: `ir${i + 1}`, label: "IR", ir: true, irIndex: i })),
  ];
  const irPlayerOf = (teamId: string | null, index = 0): Player | null => {
    const id = teamId ? irIdsOf(rosterByTeamId.get(teamId))[index] : undefined;
    if (!id) return null;
    return (sheetPlayers.find((x) => String(x.id) === id) as unknown as Player | undefined) ?? null;
  };

  const canGo = matchupsThisWeek.length > 1;

  // ---- What the scoreboard and lineup rows show (components/matchup) ----
  const scoreSide = (
    teamId: string | null,
    name: string,
    record: TeamRecord,
    streak: Streak,
    score: number,
    outlook: { expected: number } | null
  ): ScoreboardSide => ({
    teamId,
    name,
    pictureUrl: teamPicture(teamId),
    initials: teamInitials(teamId),
    stars: teamStars(teamId),
    holdsShield: holdsShield(teamId),
    record,
    streak,
    shieldTag: shieldTag(teamId),
    score,
    projected: outlook ? outlook.expected : null,
  });

  const lineupCell = (p: Player | null, side: "left" | "right", pill: CellPill, proj: LineupCell["proj"]): LineupCell => {
    const teamId = side === "left" ? leftTeamId : rightTeamId;
    return {
      player: p,
      fixtureTag: p ? fixtureTagForPlayer(p) : "—",
      pill,
      proj,
      statLine: p ? weekStatLineByPlayerId.get(getPlayerInternalIds(p).exact ?? "") ?? weekStatLineByPlayerId.get(getPlayerInternalIds(p).norm ?? "") ?? null : null,
      onOpenCard: () => {
        if (p) openPlayerCard(p, teamId === yourLeagueTeamId, side);
      },
      onOpenPoints: () => {
        if (p) openPointsBreakdown(p, teamId === yourLeagueTeamId, side);
      },
    };
  };

  // a starter's points pill: purple for the captain (or the vice once activated), a purple ring for the vice
  const starterPill = (p: Player | null, effCaptainId: string | null, captainId: string | null, viceId: string | null): CellPill => {
    const isVice = !!p?.id && viceId === p.id;
    const isActiveCaptain = !!p?.id && effCaptainId === p.id; // captain OR activated vice
    return {
      text: p ? (hasScoreForPlayer(p) ? pointsWithCaptain(p, effCaptainId) : "-") : "—",
      look: isActiveCaptain ? "captain" : isVice ? "vice" : "plain",
      title: isActiveCaptain
        ? `Captain x${CAP_MULT}${isVice && captainId !== viceId ? " (VC activated)" : ""}`
        : isVice
          ? "Vice Captain"
          : "Player points",
    };
  };
  const starterProj = (p: Player | null, captainId: string | null): LineupCell["proj"] => {
    const text = projText(p, captainId);
    return text ? { text, captain: !!p?.id && p.id === captainId } : null;
  };
  // a bench (or IR) player's pill: IR players don't score
  const benchPill = (p: Player | null, ir: boolean, effCaptainId: string | null, captainId: string | null): CellPill => ({
    text: ir ? (p?.id ? "-" : "—") : p?.id ? (hasScoreForPlayer(p) ? pointsWithCaptain(p, effCaptainId) : "-") : "—",
    look: "bench",
    title: !!p?.id && captainId === p.id ? `Captain x${CAP_MULT}` : "Player points",
  });

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

      <div style={{ maxWidth: isDesktop ? 980 : 420, margin: "0 auto", paddingTop: 16, paddingLeft: isDesktop ? 24 : 18, paddingRight: isDesktop ? 24 : 18, paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <MatchupHeader
          onOpenMenu={() => setMenuOpen(true)}
          canGo={canGo}
          matchupIdx={matchupIdx}
          matchupCount={matchupsThisWeek.length}
          onPrevMatchup={() => setMatchupIdx((i) => (i - 1 + matchupsThisWeek.length) % matchupsThisWeek.length)}
          onNextMatchup={() => setMatchupIdx((i) => (i + 1) % matchupsThisWeek.length)}
          mounted={mounted}
          displayWeek={displayWeek}
          latestWeek={latestWeek}
          goWeek={goWeek}
        />

        <Scoreboard
          left={scoreSide(leftTeamId, leftName, leftRecord, leftStreak, leftScore, leftOutlook)}
          right={scoreSide(rightTeamId, rightName, rightRecord, rightStreak, rightScore, rightOutlook)}
          mounted={mounted}
          shieldName={shieldInfo?.name}
          statusLabel={
            // shown once the page has loaded in the browser (the server has no league data yet)
            mounted && (scoresLocked || displayLocked || (displayWeek > 0 && displayWeek === selectionWeek))
              ? scoresLocked ? "FINAL" : displayLocked ? "LIVE" : "UPCOMING"
              : null
          }
          leftWinPct={leftWinPct}
        />

        {/* Lineups */}
        <div style={{ marginTop: 10, ...listBox }}>
          {ROWS.map((r) => {
            const lp = effectiveLeftLineup ? effectiveLeftLineup[r.slot] : null;
            const rp = effectiveRightLineup ? effectiveRightLineup[r.slot] : null;
            return (
              <LineupRow
                key={r.slot}
                label={r.label}
                wide={isDesktop}
                left={lineupCell(lp, "left", starterPill(lp, leftEffC, leftC, leftV), starterProj(lp, leftC))}
                right={lineupCell(rp, "right", starterPill(rp, rightEffC, rightC, rightV), starterProj(rp, rightC))}
              />
            );
          })}

          <BenchHeader leftScore={leftBenchScore} rightScore={rightBenchScore} />

          {BENCH_ROWS.map((r) => {
            const lp = r.ir ? irPlayerOf(leftTeamId, r.irIndex) : effectiveLeftLineup ? effectiveLeftLineup[r.slot] : null;
            const rp = r.ir ? irPlayerOf(rightTeamId, r.irIndex) : effectiveRightLineup ? effectiveRightLineup[r.slot] : null;
            return (
              <LineupRow
                key={r.slot}
                label={r.label}
                wide={isDesktop}
                ir={!!r.ir}
                left={lineupCell(lp, "left", benchPill(lp, !!r.ir, leftEffC, leftC), r.ir ? null : starterProj(lp, null))}
                right={lineupCell(rp, "right", benchPill(rp, !!r.ir, rightEffC, rightC), r.ir ? null : starterProj(rp, null))}
              />
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

    // ✅ show owner team like dashboard
    teamLabel={ownerTeamLabelForSelected}

    initialTab="Stats"

    // ✅ only show these actions for players NOT owned by you
    actions={
  selectedOwned
    ? []
    : [
        {
          label: selectedIsWatched ? "Remove from Watchlist" : "Add to Watchlist",
onClick: selectedIsWatched ? removeSelectedFromWatchlist : addSelectedToWatchlist,
          variant: "secondary",
        },
        { label: "Trade", onClick: goToTradeWithSelected, variant: "primary" },
      ]
}

    // ✅ hide footer actions for owned players only
    hideActions={selectedOwned}
  />
) : null}

{pointsOpen ? (
  <PointsBreakdownModal
    open={pointsOpen}
    onClose={() => setPointsOpen(false)}
    playerId={selectedPlayer?.id}
    playerName={selectedPlayer ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : "Player"}
    jerseySrc={jerseySrcForPlayer(selectedPlayer, "angle") ?? undefined}
    teamCode={selectedPlayer?.teamCode ?? null}
    weekLabel={roundLabel(displayWeek)}
    fixtureLabel={selectedFixtureLabel ? `v ${selectedFixtureLabel}` : "—"}
    rows={selectedRows}
    totalPoints={
      selectedPlayer
        ? (() => {
            const lineup = selectedSide === "left" ? effectiveLeftLineup : effectiveRightLineup;
            const c = selectedSide === "left" ? leftC : rightC;
            const v = selectedSide === "left" ? leftV : rightV;
            return pointsForPlayer(selectedPlayer);
          })()
        : 0
    }
  />
) : null}

    </main>
  );
}
