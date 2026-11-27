"use client";

import { lineupWarnings, warningSummary } from "@/lib/league/lineupWarnings";
import React, { useEffect, useMemo, useState } from "react";
import { leagueRefreshMs, usePoll } from "@/lib/hooks/usePoll";
import { useRouter } from "next/navigation";

import { PlayerCardModal, type PlayerStatus } from "@/components/PlayerCardModal";
import { CoachFeed } from "@/components/CoachFeed";
import { AppMenu } from "@/components/AppMenu";
import { loadMyLeagues, useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";

import { currentSeasonYear, fixturesByFantasyWeek, getSeason, realRoundsForWeek, roundLabel, totalFantasyWeeks, weekDeadlineMs } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import { getActiveTimezone } from "@/lib/session";

import { usePlayersStore } from "@/lib/players/store";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";
import { getActiveUsername } from "@/lib/session";
import { roundPoints } from "@/lib/scoring";
import { toMs, getWeekFirstKickoffMs, getSelectionDeadlineMs, getWeeksSorted, type SheetFixtureRow, isSheetPlayableRow, currentWeekFromSheet, latestCompletedWeekFromSheet } from "@/lib/league/weekHelpers";
import { startersOf } from "@/lib/scoring/week";
import { WeeklyRecapModal } from "@/components/WeeklyRecapModal";
import { ShieldSecuredModal } from "@/components/ShieldSecuredModal";
import { SeasonRecapModal } from "@/components/SeasonRecapModal";
import { statusKind } from "@/lib/status/kind";
import { useProjections } from "@/lib/projections/useProjections";
import { teamOutlook, winProbability } from "@/lib/projections/live";
import type { Lineup as ScoringLineup } from "@/lib/scoring/week";
import type { PowerTable } from "@/lib/league/powerServer";
import { WeekGamesCard } from "@/components/WeekGamesCard";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PreDraftDashboard } from "@/components/dashboard/PreDraftDashboard";
import { PushPromptCard } from "@/components/PushSettings";
import { NoLeague } from "@/components/dashboard/NoLeague";
import { MatchupCard } from "@/components/dashboard/MatchupCard";
import { UpcomingFixtureCard } from "@/components/dashboard/UpcomingFixtureCard";
import { PowerCard, StandingsCard } from "@/components/dashboard/StandingsCard";
import { PlayerOfWeekCard } from "@/components/dashboard/PlayerOfWeekCard";
import { BestAvailableCard } from "@/components/dashboard/BestAvailableCard";
import { useIsDesktop, useIsWide } from "@/lib/ui/useIsDesktop";
import {
  bestAvailable,
  buildRecordsUpToWeek,
  buildStandings,
  calcFantasyPoints,
  CAP_MULT,
  cardStyle,
  collectPlayerIdsDeep,
  collectPlayerIdsFromRoster,
  effectiveCaptainId,
  EMPTY_ARR,
  findPlayerMetaById,
  formatDeadline,
  getLiveWeekFromNow,
  isSheetMatchRow,
  normaliseId,
  playersOfTheWeek,
  rosterDataToLineup,
  rowPlayerId,
  rowRound,
  type ActiveMenu,
  type AnyFixture,
  type DashboardState,
  type Lineup,
  type Modal,
  type Player,
  type SlotId,
  type StandingRow,
  type PositionInfo,
} from "@/components/dashboard/helpers";

export default function DashboardPage() {
  const router = useRouter();
  // computers: the cards in 2 or 3 columns (Ethan, 27 Nov 2026)
  const isDesktop = useIsDesktop();
  const isWide = useIsWide();
  const [modal, setModal] = useState<Modal>(null);

    // ✅ keep league + draft store hydrated (same idea as Draft Room)
  const refreshLeague = useLeagueStore((s) => s.refreshLeague);
  const refreshFromServer = useDraftStore((s) => s.refreshFromServer);
  const hydrateRostersFromDb = useDraftStore((s) => s.hydrateRostersFromDb);

  // timezone for consistent deadline display
const userTz = useMemo(() => getActiveTimezone(), []);

// live "now" (set after mount to avoid hydration mismatch)
const [nowMs, setNowMs] = useState(0);

useEffect(() => {
  setNowMs(Date.now());
  const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
  return () => window.clearInterval(t);
}, []);

// ✅ Route protection
useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      // 1) must be signed in
      const me = await fetch("/api/session/me", { cache: "no-store" });
      if (!me.ok) {
        if (!cancelled) router.replace("/");
        return;
      }

      // 2) this player's leagues and the active one (shared with every page: LeagueSync)
      // (if it fails the store stays as it was; the dashboard shows No League Joined)
      await loadMyLeagues();
    } catch (e) {
      if (!cancelled) router.replace("/");
    }
  })();

  return () => {
    cancelled = true;
  };
}, [router]);

  const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);

// Keep the league, draft and rosters fresh: every few seconds around the draft, once a
// minute otherwise, and not at all while the tab is hidden (lib/hooks/usePoll).
usePoll(
  activeLeagueId
    ? async () => {
        refreshLeague(activeLeagueId);
        await refreshFromServer(activeLeagueId);
        hydrateRostersFromDb(activeLeagueId);
      }
    : null,
  () => leagueRefreshMs(useLeagueStore.getState().leagues.find((l) => l.id === activeLeagueId)),
  activeLeagueId,
);

const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
const maybeAutoStartDraft = useLeagueStore((s) => s.maybeAutoStartDraft);

// Active league (object)
const activeLeague = useMemo(() => {
  return leagues.find((l) => l.id === activeLeagueId) ?? null;
}, [leagues, activeLeagueId]);

// --- Deadline banner (real) ---
const fixtures = useMemo(() => {
  const raw = fixturesData as AnyFixture[];
  return raw
    .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
    .sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0));
}, []);

// -----------------------
// Matchup-card live data (same sources as Matchup page)
// -----------------------
const userId = useMemo(() => getActiveUsername(), []);

// Draft teams for name lookup (same as Matchup)
const draftTeams = useDraftStore((s) => s.teams ?? EMPTY_ARR);

const nameByTeamId = React.useCallback((id: string | null) => {
  if (!id) return "BYE";

  const dt = Array.isArray(draftTeams) ? draftTeams : [];
  const lt = Array.isArray(activeLeague?.teams) ? activeLeague.teams : [];

  return (
    dt.find((t: any) => t.id === id)?.name ??
    lt.find((t: any) => t.id === id)?.name ??
    "TBC"
  );
}, [draftTeams, activeLeague?.teams]);

// Sheet fixtures (league matchups / results)
const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

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

// players store so we can compute fantasy totals for the displayed round
const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
const roundRows = usePlayersStore((s) => s.roundRows);
// form for the top available players uses the browsing stats (last season's until the first kickoff)
const statRows = usePlayersStore((s) => s.statRows);
const allPlayers = usePlayersStore((s: any) => s.players ?? s.allPlayers ?? EMPTY_ARR);

// --- Watchlist (Supabase via /api/watchlist; same as Transactions) ---
const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
const [pendingTradeCount, setPendingTradeCount] = useState<number>(0);

useEffect(() => {
  if (!activeLeagueId) {
    setWatchlistSet(new Set());
    return;
  }

  let cancelled = false;

  (async () => {
    try {
      const res = await fetch(
        `/api/watchlist?leagueId=${encodeURIComponent(activeLeagueId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const j = await res.json().catch(() => null);

      if (cancelled) return;

      if (!res.ok || !j?.ok) {
        console.error("watchlist GET failed", j?.error ?? res.statusText);
        setWatchlistSet(new Set());
        return;
      }

      const ids = Array.isArray(j.data) ? j.data : [];
      setWatchlistSet(new Set(ids.map((x: any) => String(x))));
    } catch (e) {
      if (!cancelled) setWatchlistSet(new Set());
      console.error(e);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeagueId]);

const isWatched = (playerId: string) => watchlistSet.has(String(playerId));

async function toggleWatchlistForDashboard(playerId: string) {
  if (!activeLeagueId) return;

  const pid = String(playerId);
  // Add or remove depends on the list as shown when tapped. (It used to be read inside the
  // update below, which React runs later, so a second tap added the player again instead of
  // removing him: fixed 20 Nov 2026.)
  const wasWatchedSnapshot = watchlistSet.has(pid);

  // optimistic UI
  setWatchlistSet((prev) => {
    const next = new Set(prev);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    return next;
  });

  try {
    if (!wasWatchedSnapshot) {
      // ADD (POST)
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leagueId: activeLeagueId, playerId: pid }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "watchlist POST failed");
    } else {
      // REMOVE (DELETE)
      const res = await fetch(
        `/api/watchlist?leagueId=${encodeURIComponent(activeLeagueId)}&playerId=${encodeURIComponent(pid)}`,
        { method: "DELETE", cache: "no-store", credentials: "include" }
      );
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "watchlist DELETE failed");
    }
  } catch (e) {
    console.error(e);

    // revert UI on failure
    setWatchlistSet((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }
}

useEffect(() => {
  refreshLivePlayers();
}, [refreshLivePlayers]);

// Determine YOUR leagueTeamId (same logic as Matchup page)
const norm = (s: any) => String(s ?? "").trim().toLowerCase();

const yourLeagueTeamId = useMemo(() => {
  const teams = Array.isArray(activeLeague?.teams) ? activeLeague!.teams : [];
  if (!teams.length) return null;

  if (userId) {
    const me = norm(userId);
    const t = teams.find((x: any) => norm(x?.userId) === me);
    if (t?.id) return t.id;
  }

  return teams[0]?.id ?? null;
}, [activeLeague, userId]);

useEffect(() => {
  if (!activeLeagueId || !yourLeagueTeamId) {
    setPendingTradeCount(0);
    return;
  }

  let cancelled = false;

  (async () => {
    try {
      const res = await fetch(
        `/api/trades/pending-count?leagueId=${encodeURIComponent(activeLeagueId)}&teamId=${encodeURIComponent(
          String(yourLeagueTeamId)
        )}`,
        { cache: "no-store", credentials: "include" }
      );
      const j = await res.json().catch(() => null);

      if (cancelled) return;

      if (!res.ok || !j?.ok) {
        console.error("pending trade count fetch failed", j?.error ?? res.statusText);
        setPendingTradeCount(0);
        return;
      }

      setPendingTradeCount(Number(j.count ?? 0) || 0);
    } catch (e) {
      if (!cancelled) setPendingTradeCount(0);
      console.error(e);
    }
  })();

  // refresh occasionally so the badge updates (not while the tab is hidden)
  const t = window.setInterval(() => {
    if (document.hidden) return;
    fetch(
      `/api/trades/pending-count?leagueId=${encodeURIComponent(activeLeagueId)}&teamId=${encodeURIComponent(
        String(yourLeagueTeamId)
      )}`,
      { cache: "no-store", credentials: "include" }
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setPendingTradeCount(Number(j.count ?? 0) || 0);
      })
      .catch(() => {});
  }, 30_000);

  return () => {
    cancelled = true;
    window.clearInterval(t);
  };
}, [activeLeagueId, yourLeagueTeamId]);

// selectionWeek/displayWeek logic (match Matchup page)
const selectionWeek = useMemo(() => {
  if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
  return currentWeekFromSheet(sheetFixtures);
}, [sheetFixtures, activeLeague?.currentWeek]);

const startRound = activeLeague?.startRound ?? 1;

const selectionRealRound = useMemo(
  () => fantasyWeekToRealRound(startRound, selectionWeek),
  [startRound, selectionWeek]
);

const deadlineMs2 = useMemo(() => {
  const wk = fixtures.filter((f) => f.week === selectionRealRound);
  if (!wk.length) return 0;

  const firstKickoff = Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
  if (!Number.isFinite(firstKickoff) || firstKickoff <= 0) return 0;

  return selectionDeadlineFromFirstKickoff(firstKickoff);
}, [fixtures, selectionRealRound]);

const deadlineLocked2 = deadlineMs2 ? nowMs >= deadlineMs2 : false;

const displayWeek = useMemo(() => {
  return deadlineLocked2 ? selectionWeek : selectionWeek - 1;
}, [deadlineLocked2, selectionWeek]);

const displayRealRound = useMemo(() => {
  if (displayWeek <= 0) return 0;
  return fantasyWeekToRealRound(startRound, displayWeek);
}, [startRound, displayWeek]);

// Find the matchup row for your team for the displayWeek
const matchupsThisWeek = useMemo(() => {
  if (!sheetFixtures.length) return [];
  if (displayWeek <= 0) return [];
  return sheetFixtures
    .filter((r) => Number(r.weekFantasy) === displayWeek)
    .filter(isSheetPlayableRow)
    .map((r) => ({
      homeTeamId: r.homeTeamId ?? null,
      awayTeamId: r.awayTeamId ?? null,
    }));
}, [sheetFixtures, displayWeek]);

const activeMatchup = useMemo(() => {
  if (!matchupsThisWeek.length) return null;
  if (!yourLeagueTeamId) return matchupsThisWeek[0];

  const idx = matchupsThisWeek.findIndex(
    (m) => m.homeTeamId === yourLeagueTeamId || m.awayTeamId === yourLeagueTeamId
  );
  return matchupsThisWeek[idx >= 0 ? idx : 0];
}, [matchupsThisWeek, yourLeagueTeamId]);

// Home team on the left, away on the right, always (Ethan, 23 Nov 2026), even when you're away
const leftTeamId = activeMatchup?.homeTeamId ?? null;
const rightTeamId = activeMatchup?.awayTeamId ?? null;

const leftName = nameByTeamId(leftTeamId);
const rightName = nameByTeamId(rightTeamId);

// Fetch team selections for displayWeek + rosters fallback
const leagueId = activeLeague?.id ?? null;

const [selectionByTeamId, setSelectionByTeamId] = useState<Map<string, any>>(new Map());
const [rosterByTeamId, setRosterByTeamId] = useState<Map<string, any>>(new Map());

const rosteredIds = useMemo(() => {
  const ids = new Set<string>();

  for (const raw of rosterByTeamId.values()) {
    // Try “lineup” first (your slot-based roster)
    const lineup =
      rosterDataToLineup(raw) ??
      rosterDataToLineup(raw?.data) ??
      rosterDataToLineup(raw?.lineup) ??
      null;

    if (lineup) {
      for (const p of Object.values(lineup) as any[]) {
        if (p?.id) ids.add(String(p.id).toLowerCase());
      }
      continue;
    }

    // Fallback: any other roster structure (players[], playerIds[], nested, etc)
    collectPlayerIdsDeep(raw, ids);
  }

  return ids;
}, [rosterByTeamId]);

const ownerTeamIdByPlayerId = useMemo(() => {
  const m = new Map<string, string>(); // pidLower -> teamId

  for (const [teamId, rawRoster] of rosterByTeamId.entries()) {
    const ids = collectPlayerIdsFromRoster(rawRoster);
    for (const pidLower of ids) {
      if (!m.has(pidLower)) m.set(pidLower, String(teamId));
    }
  }

  return m;
}, [rosterByTeamId]);

const modalStatus = useMemo<PlayerStatus | undefined>(() => {
  if (modal?.type !== "playerCard") return undefined;

  const meta = findPlayerMetaById(allPlayers as any[], modal.player.id);
  const raw =
    meta?.status ??
    meta?.Status ??
    meta?.playerStatus ??
    meta?.["Player Status"] ??
    "";

  const text = String(raw ?? "").trim();
  if (!text) return null;

  const k = statusKind(text);
  if (k === "starting") return "starting";
  if (k === "bench") return "benched";

  // IMPORTANT:
  // For ANY other text (e.g. "Hamstring", "Suspended"), do NOT force "out" here.
  // Pass null so PlayerCardModal uses its own sheet status + outReason (full text).
  return null;
}, [modal, allPlayers]);

const modalOwnerTeamId = useMemo(() => {
  if (modal?.type !== "playerCard") return null;

  if (modal.ownerTeamId !== undefined) {
    return modal.ownerTeamId ?? null;
  }

  return ownerTeamIdByPlayerId.get(normaliseId(modal.player.id)) ?? null;
}, [modal, ownerTeamIdByPlayerId]);

const modalTeamLabel = useMemo(() => {
  if (modal?.type !== "playerCard") return "Available";

  const pidLower = normaliseId(modal.player.id);

  const ownerTeamId =
    modal.ownerTeamId !== undefined
      ? (modal.ownerTeamId ?? null)
      : (ownerTeamIdByPlayerId.get(pidLower) ?? null);

  if (ownerTeamId) return nameByTeamId(ownerTeamId);

  // only use the saved label as a fallback when it is something real
  if (modal.teamLabel && modal.teamLabel !== "Available") return modal.teamLabel;

  return "Available";
}, [modal, ownerTeamIdByPlayerId, nameByTeamId]);

const modalIsOwned = !!modalOwnerTeamId;
const modalIsOwnedByYou = !!modalOwnerTeamId && modalOwnerTeamId === yourLeagueTeamId;

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
      for (const row of (j.data ?? j.rows ?? [])) {
        const tid = row.team_id ?? row.teamId;
        if (tid) m.set(String(tid), row.data ?? row);
      }
      setRosterByTeamId(m);
    })
    .catch((e) => console.error(e));
}, [leagueId]);

function selectionLineupForTeam(teamId: string | null) {
  if (!teamId) return { lineup: null as Lineup | null, captainId: null as string | null, viceId: null as string | null };

  const row = selectionByTeamId.get(teamId);
  const lineup =
    row?.lineup ??
    row?.data?.lineup ??
    row?.selection?.lineup ??
    row?.snapshot?.lineup ??
    null;

  if (lineup) {
    return {
      lineup: lineup as Lineup,
      captainId: row.captain_id ?? row.captainId ?? row.data?.captainId ?? null,
      viceId: row.vice_id ?? row.viceId ?? row.data?.viceId ?? null,
    };
  }

  const roster = rosterByTeamId.get(teamId);
  const rLineup = rosterDataToLineup(roster);
  return {
    lineup: rLineup,
    captainId: roster?.captainId ?? null,
    viceId: roster?.viceId ?? null,
  };
}

const weekPointsByPlayerId = useMemo(() => {
  const m = new Map<string, number>();
  const metaById = new Map<string, any>();
  for (const p of (Array.isArray(allPlayers) ? allPlayers : []) as any[]) {
    const id = p?.id ?? p?.playerId ?? p?.player_id;
    if (id != null) metaById.set(normaliseId(id), p);
  }

  for (const row of roundRows ?? []) {
    if (rowRound(row) !== displayRealRound) continue;

    const pid = rowPlayerId(row);
    if (!pid) continue;

    m.set(normaliseId(pid), calcFantasyPoints(row, metaById.get(normaliseId(pid)) ?? null));
  }

  return m;
}, [roundRows, displayRealRound, allPlayers]);

function pointsForPlayer(p: any | null) {
  if (!p?.id) return 0;
  return weekPointsByPlayerId.get(normaliseId(p.id)) ?? 0;
}

function pointsWithCaptain(p: any | null, effCaptainId: string | null) {
  if (!p?.id) return 0;
  const base = pointsForPlayer(p);
  return p.id === effCaptainId ? base * CAP_MULT : base;
}

function totalForSlots(lineup: Lineup | null, effCaptain: string | null, slots: SlotId[]) {
  if (!lineup) return 0;
  return roundPoints(slots.reduce((sum, sid) => sum + pointsWithCaptain(lineup[sid], effCaptain), 0));
}

// Live values to replace the placeholders
const weekLabelLive = displayWeek > 0 ? roundLabel(displayWeek) : "Pre-season";

const leftSel = useMemo(() => selectionLineupForTeam(leftTeamId), [leftTeamId, selectionByTeamId, rosterByTeamId]);
const rightSel = useMemo(() => selectionLineupForTeam(rightTeamId), [rightTeamId, selectionByTeamId, rosterByTeamId]);

const leftEffC = useMemo(
  () => effectiveCaptainId(leftSel.lineup, leftSel.captainId, leftSel.viceId),
  [leftSel.lineup, leftSel.captainId, leftSel.viceId]
);
const rightEffC = useMemo(
  () => effectiveCaptainId(rightSel.lineup, rightSel.captainId, rightSel.viceId),
  [rightSel.lineup, rightSel.captainId, rightSel.viceId]
);

const userScoreLive = useMemo(
  () => totalForSlots(leftSel.lineup, leftEffC, startersOf(activeLeague?.squadFormat)),
  [leftSel.lineup, leftEffC, weekPointsByPlayerId, activeLeague?.squadFormat]
);
const oppScoreLive = useMemo(
  () => totalForSlots(rightSel.lineup, rightEffC, startersOf(activeLeague?.squadFormat)),
  [rightSel.lineup, rightEffC, weekPointsByPlayerId, activeLeague?.squadFormat]
);

const lastCompletedWeek = useMemo(() => {
  if (!sheetFixtures.length) return Math.max(0, selectionWeek - 1);
  return latestCompletedWeekFromSheet(sheetFixtures);
}, [sheetFixtures, selectionWeek]);

const recordMap = useMemo(
  () => buildRecordsUpToWeek(sheetFixtures, lastCompletedWeek),
  [sheetFixtures, lastCompletedWeek]
);

const leftRecordObj = recordMap.get(leftTeamId ?? "") ?? { w: 0, l: 0, d: 0 };
const rightRecordObj = recordMap.get(rightTeamId ?? "") ?? { w: 0, l: 0, d: 0 };

const userRecordLive = `(${leftRecordObj.w}-${leftRecordObj.l}-${leftRecordObj.d})`;
const oppRecordLive = `(${rightRecordObj.w}-${rightRecordObj.l}-${rightRecordObj.d})`;

 useEffect(() => {
  if (!activeLeagueId) return;

  // run immediately (covers "already past" cases)
  maybeAutoStartDraft(activeLeagueId);

  // keep checking while on dashboard (only changes anything at the draft time)
  const t = setInterval(() => {
    maybeAutoStartDraft(activeLeagueId);
  }, 5000);

  return () => clearInterval(t);
}, [activeLeagueId, maybeAutoStartDraft]);

useEffect(() => {
  if (!activeLeagueId) return;

  // ✅ Pull rosters from Supabase into Zustand when league becomes active
  void useDraftStore.getState().hydrateRostersFromDb(activeLeagueId);
}, [activeLeagueId]);

const dashState: DashboardState = useMemo(() => {
  if (!activeLeague) return "noLeague";
  if (activeLeague.draftStatus === "complete") return "postDraft";
  return "preDraft";
}, [activeLeague]);

// Before the league's draft is finished: the pre-draft dashboard (components/dashboard/PreDraftDashboard)
const effectiveDashState: DashboardState = dashState;

// The season's latest round whose lineups have locked (0 = the season hasn't started). Before the
// draft the league has no weeks of its own yet, so this comes from the season's fixtures: a league
// that starts mid-season shows that round's games and Player of the Week (Ethan, 26 Nov 2026).
const leagueSeason = activeLeague?.season ?? currentSeasonYear();
const seasonWeekNow = useMemo(() => {
  if (!nowMs) return 0;
  const s = getSeason(leagueSeason);
  let w = 0;
  for (let i = 1; i <= totalFantasyWeeks(s); i++) {
    const d = weekDeadlineMs(s, i);
    if (d != null && d <= nowMs) w = i;
  }
  return w;
}, [nowMs, leagueSeason]);

  // DEV: switch dashboards while we build

  const teams = useMemo(() => ["Team", "Stouty's Studs", "Stouty's Studs 2"], []);
  const [currentTeam, setCurrentTeam] = useState("Stouty's Studs");

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>("Dashboard");

  

  // -----------------------
  // Mock / placeholder data
  // -----------------------
  const leagueName = activeLeague?.name ?? "League";
const draftText = activeLeague?.draftDateTimeText ?? "TBC";

const weeksSorted = useMemo(() => getWeeksSorted(fixtures), [fixtures]);

// Live week is derived from fixtures + time (prevents "flash then fallback" when league object changes)
const liveWeek = useMemo(() => {
  if (!nowMs) return weeksSorted[0] ?? 1; // before mount; harmless placeholder
  return getLiveWeekFromNow(fixtures, nowMs);
}, [fixtures, nowMs, weeksSorted]);

const liveWeekFirstKickoffMs = useMemo(() => {
  return getWeekFirstKickoffMs(fixtures, liveWeek);
}, [fixtures, liveWeek]);

const liveWeekSelectionDeadlineMs = useMemo(() => {
  return liveWeekFirstKickoffMs ? getSelectionDeadlineMs(liveWeekFirstKickoffMs) : 0;
}, [liveWeekFirstKickoffMs]);

// If we've passed this week's selection deadline, show next week's deadlines
const bannerWeek = useMemo(() => {
  if (!nowMs || !liveWeekSelectionDeadlineMs) return liveWeek;

  if (nowMs < liveWeekSelectionDeadlineMs) return liveWeek;

  const idx = weeksSorted.indexOf(liveWeek);
  return weeksSorted[idx + 1] ?? liveWeek + 1;
}, [nowMs, liveWeek, liveWeekSelectionDeadlineMs, weeksSorted]);

const bannerWeekFirstKickoffMs = useMemo(() => {
  return getWeekFirstKickoffMs(fixtures, bannerWeek);
}, [fixtures, bannerWeek]);

const teamSelectionDeadlineMs = useMemo(() => {
  return bannerWeekFirstKickoffMs ? getSelectionDeadlineMs(bannerWeekFirstKickoffMs) : 0;
}, [bannerWeekFirstKickoffMs]);

// Waivers close 24 hours before selection deadline (same concept as Transactions)
const waiverDeadlineMs = useMemo(() => {
  return teamSelectionDeadlineMs ? teamSelectionDeadlineMs - 24 * 60 * 60 * 1000 : 0;
}, [teamSelectionDeadlineMs]);

const windowMode = useMemo<"WAIVERS" | "TEAM_SELECTION">(() => {
  if (!nowMs || !waiverDeadlineMs || !teamSelectionDeadlineMs) return "WAIVERS";
  if (nowMs < waiverDeadlineMs) return "WAIVERS";
  if (nowMs < teamSelectionDeadlineMs) return "TEAM_SELECTION";
  return "WAIVERS";
}, [nowMs, waiverDeadlineMs, teamSelectionDeadlineMs]);

const bannerTitle = useMemo(() => {
  if (!nowMs) return "Loading Deadline…";
  const label = windowMode === "WAIVERS" ? "Waiver Deadline" : "Team Selection Deadline";
  return `${roundLabel(bannerWeek)} • ${label}`;
}, [windowMode, bannerWeek, nowMs]);

const bannerTime = useMemo(() => {
  const ms = windowMode === "WAIVERS" ? waiverDeadlineMs : teamSelectionDeadlineMs;
  if (!nowMs) return "—";          // before mount
  if (!ms) return "TBC";           // if fixtures missing
  return formatDeadline(ms, userTz);
}, [nowMs, windowMode, waiverDeadlineMs, teamSelectionDeadlineMs, userTz]);

// Waivers vs Free Agency button colour should follow the window mode
const isWaivers = windowMode === "WAIVERS";
const addBtnBg = isWaivers ? "#FACC15" : "#22C55E";

const modalPrimaryAction = useMemo(() => {
  if (modal?.type !== "playerCard") return null;

  // Owned by another team -> trade
  if (modalIsOwned && modalOwnerTeamId && !modalIsOwnedByYou) {
    return {
      label: "Propose Trade",
      onClick: () => goToTradeProposal(modalOwnerTeamId, modal.player.id),
    };
  }

  // Owned by you -> no trade action
  if (modalIsOwnedByYou) {
    return null;
  }

  // Unowned -> waiver or free agency action
  return {
    label: isWaivers ? "Submit Claim" : "Sign Player",
    onClick: () => goToTransactionsForAdd(modal.player.id),
  };
}, [
  modal,
  modalIsOwned,
  modalIsOwnedByYou,
  modalOwnerTeamId,
  isWaivers,
]);

// Post-draft score card (LIVE from matchup logic)
const weekLabel = weekLabelLive;
const userScore = userScoreLive;
const oppScore = oppScoreLive;
const userRecord = userRecordLive;
const oppRecord = oppRecordLive;

// -----------------------
// Upcoming fixture (LIVE) = user's matchup for the week AFTER the week shown above
// "week shown above" on dashboard = displayWeek
// -----------------------
const upcomingWeekNo = useMemo(() => {
  if (!displayWeek || displayWeek <= 0) return 1;
  return displayWeek + 1;
}, [displayWeek]);

const upcomingMatch = useMemo(() => {
  if (!sheetFixtures.length) return null;

  const rows = sheetFixtures
    .filter((r) => Number(r.weekFantasy) === upcomingWeekNo)
    .filter((r) => isSheetMatchRow(r));

  if (!rows.length) return null;

  // Find YOUR matchup row; otherwise fallback to first row
  const hit =
    (yourLeagueTeamId
      ? rows.find((r) => r.homeTeamId === yourLeagueTeamId || r.awayTeamId === yourLeagueTeamId)
      : null) ?? rows[0];

  const homeId = hit.homeTeamId ?? null;
  const awayId = hit.awayTeamId ?? null;

  // home on the left, away on the right (Ethan, 23 Nov 2026)
  const leftId = homeId;
  const rightId = awayId;

  return {
    weekNo: upcomingWeekNo,
    leftId,
    rightId,
    leftName: nameByTeamId(leftId),
    rightName: nameByTeamId(rightId),
  };
}, [sheetFixtures, upcomingWeekNo, yourLeagueTeamId, nameByTeamId]);

// These are what your JSX already expects
// After the last round there is nothing upcoming.
const seasonOver = upcomingWeekNo > totalFantasyWeeks(getSeason(currentSeasonYear()));
const upcomingWeek = seasonOver ? "Season complete" : upcomingMatch ? roundLabel(upcomingMatch.weekNo) : roundLabel(upcomingWeekNo);
const upcomingHome = seasonOver ? "—" : upcomingMatch ? upcomingMatch.leftName : "Loading…";
const upcomingAway = seasonOver ? "—" : upcomingMatch ? upcomingMatch.rightName : "Loading…";

// The Shield: whether the upcoming matchup is a shield game
const upcomingShield: "defending" | "challenging" | "other" | null = (() => {
  const s = activeLeague?.shield;
  const n = s?.enabled ? s.next : null;
  if (!n || !upcomingMatch || n.week !== upcomingWeekNo) return null;
  const ids = [upcomingMatch.leftId, upcomingMatch.rightId];
  if (!ids.includes(n.homeTeamId) || !ids.includes(n.awayTeamId)) return null;
  return yourLeagueTeamId === n.homeTeamId ? "defending" : yourLeagueTeamId === n.awayTeamId ? "challenging" : "other";
})();

// F2: projected scores and win chance for the upcoming matchup (both teams' saved lineups -
// a team that hasn't saved one for that round uses its latest, the one that would lock)
const [recapsOpen, setRecapsOpen] = useState(false);
const upcomingProj = useProjections(leagueId, !seasonOver && upcomingMatch ? upcomingWeekNo : null);
const [upcomingSel, setUpcomingSel] = useState<{ week: number; rows: Array<{ team_id: string; lineup: unknown; captain_id: string | null; vice_id: string | null }> } | null>(null);
useEffect(() => {
  if (!leagueId || seasonOver || !upcomingMatch) return;
  let cancelled = false;
  fetch(`/api/team-selection/get?leagueId=${encodeURIComponent(leagueId)}&week=${upcomingWeekNo}`, { cache: "no-store", credentials: "include" })
    .then((r) => r.json())
    .then((j) => {
      if (!cancelled && j?.ok) setUpcomingSel({ week: upcomingWeekNo, rows: j.rows ?? [] });
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [leagueId, seasonOver, upcomingMatch, upcomingWeekNo]);

const upcomingOutlook = useMemo(() => {
  if (!upcomingProj || upcomingProj.week !== upcomingWeekNo || !upcomingSel || upcomingSel.week !== upcomingWeekNo || !upcomingMatch) return null;
  const forTeam = (teamId: string | null) => {
    const row = upcomingSel.rows.find((r) => r.team_id === teamId);
    if (!row?.lineup) return null;
    return teamOutlook({
      lineup: row.lineup as ScoringLineup,
      captainId: row.captain_id,
      viceId: row.vice_id,
      nowMs: 0, // before any games: the full projections
      format: activeLeague?.squadFormat,
      state: (id) => {
        const pr = upcomingProj.players[id] ?? upcomingProj.players[id.toLowerCase()];
        return pr ? { projected: pr.pts, spread: pr.spread, actual: null, minutes: 0, kickoffMs: pr.kickoffMs, ruledOut: pr.role === "out" } : null;
      },
    });
  };
  const a = forTeam(upcomingMatch.leftId ?? null), b = forTeam(upcomingMatch.rightId ?? null);
  if (!a || !b) return null;
  return { left: a.expected, right: b.expected, leftWin: Math.round(winProbability(a, b) * 100) };
}, [upcomingProj, upcomingSel, upcomingMatch, upcomingWeekNo, activeLeague?.squadFormat]);

// Lineup check for your next lineup (Ethan, 19 Nov 2026): starters who won't play or might not
// (lib/league/lineupWarnings.ts); the details are on Team Selection
const myLineupCheck = useMemo(() => {
  if (seasonOver || !yourLeagueTeamId || !upcomingProj || upcomingProj.week !== upcomingWeekNo || !upcomingSel || upcomingSel.week !== upcomingWeekNo) return null;
  const row = upcomingSel.rows.find((r) => r.team_id === yourLeagueTeamId);
  if (!row?.lineup) return null;
  return warningSummary(
    lineupWarnings(row.lineup as never, (id) => upcomingProj.players[id] ?? upcomingProj.players[id.toLowerCase()] ?? null, activeLeague?.squadFormat)
  );
}, [seasonOver, yourLeagueTeamId, upcomingProj, upcomingSel, upcomingWeekNo, activeLeague?.squadFormat]);

  // Before the league's first round kicks off, the dashboard shows the power rankings instead of
  // the standings (Ethan, 20 Nov 2026: the standings are all 0 until then)
  const [power, setPower] = useState<{ leagueId: string; table: PowerTable } | null>(null);
  useEffect(() => {
    if (!activeLeagueId) return;
    let cancelled = false;
    fetch(`/api/leagues/power?leagueId=${encodeURIComponent(activeLeagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setPower({ leagueId: activeLeagueId, table: j.power as PowerTable });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId]);
  const preseasonPower = power && power.leagueId === activeLeagueId && power.table.simulated && !power.table.started ? power.table : null;

const standings: StandingRow[] = useMemo(() => {
  if (!activeLeague?.teams?.length) return [];
  return buildStandings(activeLeague.teams, sheetFixtures);
}, [activeLeague?.teams, sheetFixtures]);

const bestAvailablePlayers: Player[] = useMemo(() => bestAvailable(allPlayers, rosteredIds, statRows), [allPlayers, rosteredIds, statRows]);

const playersOfWeek: Player[] = useMemo(() => playersOfTheWeek(allPlayers, weekPointsByPlayerId, displayWeek), [allPlayers, weekPointsByPlayerId, displayWeek]);

// before the draft: Player of the Week for the season's latest round (see seasonWeekNow)
const preDraftPlayersOfWeek: Player[] = useMemo(() => {
  if (effectiveDashState !== "preDraft" || !seasonWeekNow) return [];
  const rounds = new Set(realRoundsForWeek(getSeason(leagueSeason), seasonWeekNow));
  const metaById = new Map<string, PositionInfo>();
  for (const p of (Array.isArray(allPlayers) ? allPlayers : []) as Array<{ id?: string } & NonNullable<PositionInfo>>) {
    if (p?.id != null) metaById.set(normaliseId(p.id), p);
  }
  // one score per player per real round (the same row can come more than once), then added up
  // over the week's rounds
  const perRound = new Map<string, number>();
  for (const row of roundRows ?? []) {
    const round = rowRound(row);
    if (!rounds.has(round)) continue;
    const pid = rowPlayerId(row);
    if (!pid) continue;
    const id = normaliseId(pid);
    perRound.set(`${id}|${round}`, calcFantasyPoints(row, metaById.get(id) ?? null));
  }
  const m = new Map<string, number>();
  for (const [k, pts] of perRound) {
    const id = k.slice(0, k.lastIndexOf("|"));
    m.set(id, (m.get(id) ?? 0) + pts);
  }
  return playersOfTheWeek(allPlayers, m, seasonWeekNow);
}, [effectiveDashState, seasonWeekNow, roundRows, allPlayers, leagueSeason]);

function goToTransactionsForAdd(playerId: string) {
  router.push(`/transactions?addPlayerId=${encodeURIComponent(playerId)}`);
}

function goToTradeProposal(partnerTeamId: string, requestPlayerId: string) {
  const url =
    `/trade/propose` +
    `?partnerTeamId=${encodeURIComponent(partnerTeamId)}` +
    `&prefillRequestPlayerId=${encodeURIComponent(requestPlayerId)}` +
    `&returnTo=${encodeURIComponent("/dashboard")}`;

  router.push(url);
}

  // a player in Player of the Week or Best Available: his player card
  const openPlayerOfWeek = (p: Player) => {
    const ownerTeamId = ownerTeamIdByPlayerId.get(normaliseId(p.id)) ?? null;
    setModal({ type: "playerCard", player: p, ownerTeamId });
  };
  const openAvailablePlayer = (p: Player) => {
    const ownerTeamId = ownerTeamIdByPlayerId.get(normaliseId(p.id)) ?? null;
    setModal({ type: "playerCard", player: p, ownerTeamId, teamLabel: ownerTeamId ? nameByTeamId(ownerTeamId) : "Available" });
  };
  const shieldHolderTeamId = activeLeague?.shield?.enabled ? (activeLeague.shield.holderTeamId ?? null) : null;

  // -----------------------
  // Render
  // -----------------------
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Full-viewport gradient background */}
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

      <div
        style={{
          // computers: wider once the league's on (columns); before the draft it stays narrow
          maxWidth: isDesktop && effectiveDashState === "postDraft" ? (isWide ? 1400 : 980) : 420,
          margin: "0 auto",
          paddingTop: 16, paddingLeft: isDesktop ? 24 : 18, paddingRight: isDesktop ? 24 : 18,
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <DashboardHeader onOpenMenu={() => setMenuOpen(true)} bannerTitle={effectiveDashState === "postDraft" ? bannerTitle : null} bannerTime={bannerTime} />
        {/* "Get notifications" once, until they're on or "Not now" (components/PushSettings.tsx) */}
        {activeLeague ? <PushPromptCard cardStyle={{ ...cardStyle, marginTop: 14 }} /> : null}
        {effectiveDashState === "noLeague" && <NoLeague />}
        {effectiveDashState === "preDraft" && activeLeague ? (
          <PreDraftDashboard
            leagueId={activeLeague.id}
            leagueName={leagueName}
            roundText={seasonWeekNow > 0 ? roundLabel(seasonWeekNow, leagueSeason) : "Pre-season"}
            draftAt={activeLeague.draftAt ?? null}
            draftLive={activeLeague.draftStatus === "live"}
            timeZone={userTz}
            after={
              seasonWeekNow > 0 ? (
                <>
                  <WeekGamesCard leagueId={activeLeague.id} week={seasonWeekNow} noTable />
                  <PlayerOfWeekCard playersOfWeek={preDraftPlayersOfWeek} onOpenPlayer={openPlayerOfWeek} />
                </>
              ) : null
            }
          />
        ) : null}
        {effectiveDashState === "postDraft" && (() => {
          const cards = {
            matchup: (
            <MatchupCard
              leagueName={leagueName}
              weekLabel={weekLabel}
              left={{ score: userScore, team: leftName, record: userRecord, teamId: leftTeamId }}
              right={{ score: oppScore, team: rightName, record: oppRecord, teamId: rightTeamId }}
              teams={activeLeague?.teams ?? []}
              shieldHolderTeamId={shieldHolderTeamId}
              shieldName={activeLeague?.shield?.name}
              pendingTradeCount={pendingTradeCount}
            />

            ),
            upcoming: (
            <UpcomingFixtureCard
              upcomingWeek={upcomingWeek}
              upcomingHome={upcomingHome}
              upcomingAway={upcomingAway}
              upcomingOutlook={upcomingOutlook}
              upcomingShield={upcomingShield}
              shieldName={activeLeague?.shield?.name}
              myLineupCheck={myLineupCheck}
            />

            ),
            games: (
              <>
            {/* this round's Super Rugby games and where their points stand (before round 1: round 1's) */}
            <WeekGamesCard leagueId={activeLeague?.id ?? null} week={displayWeek > 0 ? displayWeek : selectionWeek} />

              </>
            ),
            table: (
              <>
            {preseasonPower ? (
              <PowerCard leagueName={leagueName} rows={preseasonPower.rows ?? []} teams={activeLeague?.teams ?? []} />
            ) : (
              <StandingsCard leagueName={leagueName} standings={standings} />
            )}

              </>
            ),
            potw: (
            <PlayerOfWeekCard playersOfWeek={playersOfWeek} onOpenPlayer={openPlayerOfWeek} />

            ),
            coach: (
              <>
            {/* AI coach: the latest notes about your players (lib/coach) */}
            {activeLeague?.id ? (
              <CoachFeed
                leagueId={activeLeague.id}
                style={cardStyle}
                nameOf={(id) => {
                  const p = (allPlayers as Player[]).find((x) => normaliseId(x.id) === normaliseId(id));
                  return p ? `${p.firstName} ${p.lastName}` : null;
                }}
                onOpen={(id) => {
                  const p = (allPlayers as Player[]).find((x) => normaliseId(x.id) === normaliseId(id));
                  if (p) setModal({ type: "playerCard", player: p, ownerTeamId: ownerTeamIdByPlayerId.get(normaliseId(p.id)) ?? null, tab: "AI Coach" });
                }}
              />
            ) : null}

              </>
            ),
            best: (
            <BestAvailableCard
              players={bestAvailablePlayers}
              onOpenPlayer={openAvailablePlayer}
              isWatched={isWatched}
              onToggleWatch={toggleWatchlistForDashboard}
              onAdd={goToTransactionsForAdd}
              addBtnBg={addBtnBg}
            />
            ),
          };
          const stack: React.CSSProperties = { display: "grid", gap: 14, alignContent: "start", minWidth: 0 };
          // computers: your matchup and this round in the first column, the league in the
          // second, coach news and best available in the third (or under the second)
          if (isDesktop) {
            return (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: isWide ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))", gap: 14, alignItems: "start" }}>
                <div style={stack}>
                  {cards.matchup}
                  {cards.upcoming}
                  {cards.games}
                </div>
                <div style={stack}>
                  {cards.table}
                  {cards.potw}
                  {isWide ? null : cards.coach}
                  {isWide ? null : cards.best}
                </div>
                {isWide ? (
                  <div style={stack}>
                    {cards.coach}
                    {cards.best}
                  </div>
                ) : null}
              </div>
            );
          }
          return (
            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              {cards.matchup}
              {cards.upcoming}
              {cards.games}
              {cards.table}
              {cards.potw}
              {cards.coach}
              {cards.best}
            </div>
          );
        })()}

      </div>

      {/* weekly recap pop-up (E7): once per league per finalised round */}
      <WeeklyRecapModal leagueId={activeLeague?.id} leagueName={activeLeague?.name} />
      {recapsOpen ? <WeeklyRecapModal leagueId={activeLeague?.id} leagueName={activeLeague?.name} week={999} onClose={() => setRecapsOpen(false)} /> : null}
      <SeasonRecapModal leagueId={activeLeague?.id} />
      <ShieldSecuredModal leagueId={activeLeague?.id} />

      <AppMenu
  open={menuOpen}
  onClose={() => setMenuOpen(false)}
  leagues={leagues}
  activeLeagueId={activeLeagueId}
  setActiveLeague={setActiveLeague}
  activeItem="Dashboard"
/>

      {/* MODALS */}

      {modal?.type === "playerCard" && (
        <PlayerCardModal
          player={{
            id: modal.player.id,
            firstName: modal.player.firstName,
            lastName: modal.player.lastName,
            posAbbrev: modal.player.posAbbrev,
            posName: modal.player.posName,
            teamCode: modal.player.teamCode,
          }}
          status={modalStatus}
teamLabel={modalTeamLabel}
          initialTab={modal.tab}
                    actions={[
            {
              label: isWatched(modal.player.id) ? "Remove from Watchlist" : "Add to Watchlist",
              onClick: () => toggleWatchlistForDashboard(modal.player.id),
            },
            ...(modalPrimaryAction ? [modalPrimaryAction] : []),
          ]}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
