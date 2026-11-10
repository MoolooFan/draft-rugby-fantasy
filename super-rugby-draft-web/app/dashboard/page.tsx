"use client";

import React, { useEffect, useMemo, useState } from "react";
import { leagueRefreshMs, usePoll } from "@/lib/hooks/usePoll";
import { useRouter } from "next/navigation";

import { PlayerCardModal, type PlayerStatus } from "@/components/PlayerCardModal";
import { AppMenu } from "@/components/AppMenu";
import { loadMyLeagues, useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";

import { currentSeasonYear, fixturesByFantasyWeek, getSeason, roundLabel, totalFantasyWeeks } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import { getActiveTimezone } from "@/lib/session";

import { usePlayersStore } from "@/lib/players/store";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";
import { getActiveUsername } from "@/lib/session";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { CAPTAIN_MULTIPLIER, pointsFromRow, roundPoints } from "@/lib/scoring";
import { useStableComponent } from "@/lib/hooks/useStableComponent";
import { toMs, getWeekFirstKickoffMs, getSelectionDeadlineMs, getWeeksSorted, type SheetFixtureRow, isSheetLabelRow, isSheetPlayableRow, currentWeekFromSheet, latestCompletedWeekFromSheet } from "@/lib/league/weekHelpers";
import { STARTER_SLOTS } from "@/lib/scoring/week";

type PositionInfo = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null } | null;

type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Fixtures"
  | "Team Details";

type DashboardState = "noLeague" | "preDraft" | "postDraft";

type Movement = "same" | "up" | "down";
type StandingRow = {
  rank: number;
  team: string;
  pts: number;
  movement: Movement;
};

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string; // e.g. CHI
  posAbbrev: string; // e.g. FH
  posName: string; // e.g. Flyhalf
  form: number;
  points?: number;
};

type Modal =
  | null
  | {
      type: "playerCard";
      player: Player;
      ownerTeamId?: string | null;
      teamLabel?: string;
    };

  type AnyFixture = {
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
};

function singularPosLabel(pos: string) {
  const p = String(pos ?? "").trim();

  const map: Record<string, string> = {
    Hookers: "Hooker",
    Prop: "Prop",
    Lock: "Lock",
    Halfback: "Halfback",
    Flyhalf: "Flyhalf",
    "Loose Forward": "Loose Forward",
    Centre: "Centre",
    "Outside Backs": "Outside Back",
  };

  return map[p] ?? p;
}

function getLiveWeekFromNow(fixtures: AnyFixture[], nowMs: number) {
  if (!fixtures.length) return 1;

  // next fixture that hasn't kicked off yet
  const next = fixtures.find((f) => (f.kickoffMs ?? toMs(f.kickoffAt)) >= nowMs);

  if (next) return next.week;

  // season finished: use last week in fixtures
  const weeks = getWeeksSorted(fixtures);
  return weeks[weeks.length - 1] ?? 1;
}

function formatDeadline(dtMs: number, timeZone?: string) {
  const d = new Date(dtMs);
  return d.toLocaleString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function isSheetRegularRow(r: SheetFixtureRow) {
  const k = String(r.kind ?? "").toLowerCase();
  return !k || k === "regular";
}

function isSheetMatchRow(r: SheetFixtureRow) {
  // non-label row and has at least one team id (includes BYE)
  if (isSheetLabelRow(r)) return false;
  const home = (r.homeTeamId ?? "").trim();
  const away = (r.awayTeamId ?? "").trim();
  return home !== "" || away !== "";
}

type TeamRecord = { w: number; l: number; d: number };

function buildRecordsUpToWeek(rows: SheetFixtureRow[], upToWeek: number) {
  const map = new Map<string, TeamRecord>();
  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, { w: 0, l: 0, d: 0 });
    return map.get(id)!;
  };

  const playable = rows
    .filter(isSheetPlayableRow)
    .filter((r) => String(r.status ?? "").toLowerCase() === "complete")
    .filter((r) => Number(r.weekFantasy) <= upToWeek)
    .filter((r) => r.homeTeamId && r.awayTeamId && r.homeScore != null && r.awayScore != null);

  for (const m of playable) {
    const home = ensure(m.homeTeamId!);
    const away = ensure(m.awayTeamId!);

    const hs = m.homeScore!;
    const as = m.awayScore!;

    if (hs > as) { home.w += 1; away.l += 1; }
    else if (as > hs) { away.w += 1; home.l += 1; }
    else { home.d += 1; away.d += 1; }
  }

  return map;
}

type SlotId =
  | "prop1" | "hooker1" | "prop2"
  | "lock1" | "lock2"
  | "looseforward1" | "looseforward2" | "looseforward3"
  | "halfback1" | "flyhalf1"
  | "centre1" | "centre2"
  | "outsideback1" | "outsideback2" | "outsideback3"
  | "bench1" | "bench2" | "bench3" | "bench4" | "bench5";

type Lineup = Record<SlotId, any | null>;

const CAP_MULT = CAPTAIN_MULTIPLIER;

function effectiveCaptainId(lineup: Lineup | null, captainId: string | null, viceId: string | null) {
  if (!lineup) return null;
  const cap = Object.values(lineup).find((x: any) => x?.id === captainId) ?? null;
  const vice = Object.values(lineup).find((x: any) => x?.id === viceId) ?? null;

  // dashboard doesn’t have minutes logic; we keep it simple:
  // if captain exists in lineup, use captain, else use vice if exists
  if (cap?.id) return cap.id;
  if (vice?.id) return vice.id;
  return captainId;
}

// ✅ Stable fallbacks for Zustand selectors (avoid new refs each render)
const EMPTY_ARR: any[] = [];
const NOOP = () => {};

function normaliseId(x: any) {
  return String(x ?? "")
    .trim()
    .toLowerCase();
}

// Fantasy points for one stat row, using the shared scoring rules (lib/scoring).
// Pass the player so props/hookers get their scrum points.
function getRoundPointsFromRow(row: any, player?: PositionInfo): number | null {
  if (!row) return null;
  return pointsFromRow(row, player ?? null);
}

function rowRound(row: any) {
  const v = row?.round ?? row?.Round ?? row?.week ?? row?.Week ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Points mapping for this displayed round
function rowPlayerId(row: any) {
  return (
    row?.playerId ??
    row?.internalPlayerId ??
    row?.internal_player_id ??
    row?.["Player ID"] ??
    row?.player_id ??
    row?.id ??
    null
  );
}

function getLatest3FormFromRoundRows(playerId: string, roundRows: any[], player?: PositionInfo): number {
  const want = normaliseId(playerId);

  const rows = (roundRows ?? [])
    .filter((r: any) => normaliseId(rowPlayerId(r)) === want)
    .map((r: any) => ({
      round: rowRound(r),
      points: getRoundPointsFromRow(r, player) ?? 0,
    }))
    .filter((x: any) => Number.isFinite(x.round) && x.round > 0 && Number.isFinite(x.points))
    .sort((a: any, b: any) => b.round - a.round);

  const latest3: Array<{ round: number; points: number }> = [];
  const seenRounds = new Set<number>();

  for (const r of rows) {
    if (seenRounds.has(r.round)) continue;
    seenRounds.add(r.round);
    latest3.push(r);
    if (latest3.length === 3) break;
  }

  if (!latest3.length) return 0;

  const sum = latest3.reduce((acc, r) => acc + r.points, 0);
  return sum / latest3.length;
}

export default function DashboardPage() {
  const router = useRouter();
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
  let wasWatchedSnapshot = false;

  // optimistic UI + snapshot
  setWatchlistSet((prev) => {
    wasWatchedSnapshot = prev.has(pid);
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

// force your team to be left side
// ✅ Always: YOUR team on left, opponent on right
const leftTeamId = useMemo(() => {
  if (!activeMatchup) return null;

  const h = activeMatchup.homeTeamId ?? null;
  const a = activeMatchup.awayTeamId ?? null;

  // only force "you left" if you're actually in this matchup row
  if (yourLeagueTeamId && (h === yourLeagueTeamId || a === yourLeagueTeamId)) {
    return yourLeagueTeamId;
  }

  // fallback: home on left
  return h;
}, [activeMatchup, yourLeagueTeamId]);

const rightTeamId = useMemo(() => {
  if (!activeMatchup) return null;

  const h = activeMatchup.homeTeamId ?? null;
  const a = activeMatchup.awayTeamId ?? null;

  if (yourLeagueTeamId && (h === yourLeagueTeamId || a === yourLeagueTeamId)) {
    return h === yourLeagueTeamId ? a : h;
  }

  // fallback: away on right
  return a;
}, [activeMatchup, yourLeagueTeamId]);

const leftName = nameByTeamId(leftTeamId);
const rightName = nameByTeamId(rightTeamId);

// Fetch team selections for displayWeek + rosters fallback
const leagueId = activeLeague?.id ?? null;

const [selectionByTeamId, setSelectionByTeamId] = useState<Map<string, any>>(new Map());
const [rosterByTeamId, setRosterByTeamId] = useState<Map<string, any>>(new Map());

function collectPlayerIdsDeep(x: any, out: Set<string>) {
  if (!x) return;

  // id string/number
  if (typeof x === "string" || typeof x === "number") {
    // ignore obvious non-player ids if you have them; otherwise keep simple:
    const s = String(x).trim();
    if (s) out.add(s.toLowerCase());
    return;
  }

  // array
  if (Array.isArray(x)) {
    for (const it of x) collectPlayerIdsDeep(it, out);
    return;
  }

  // object
  if (typeof x === "object") {
    // common shapes
    const pid = x.id ?? x.playerId ?? x.player_id;
    if (pid != null) {
      const s = String(pid).trim();
      if (s) out.add(s.toLowerCase());
    }

    for (const v of Object.values(x)) collectPlayerIdsDeep(v, out);
  }
}

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

  function collectPlayerIdsFromRoster(raw: any): Set<string> {
  const out = new Set<string>();

  // preferred: slot-lineup shape
  const lineup =
    rosterDataToLineup(raw) ??
    rosterDataToLineup(raw?.data) ??
    rosterDataToLineup(raw?.lineup) ??
    null;

  if (lineup) {
    for (const p of Object.values(lineup) as any[]) {
      if (p?.id) out.add(normaliseId(p.id));
    }
    return out;
  }

  // fallback: deep scan any other structure
  collectPlayerIdsDeep(raw, out);
  return out;
}

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

  const sl = text.toLowerCase();
  if (sl === "starting") return "starting";
  if (sl === "benched") return "benched";

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

function rosterDataToLineup(data: any): Lineup | null {
  if (!data) return null;
  if (data.prop1 || data.hooker1 || data.bench1) return data as Lineup;
  if (data.lineup && (data.lineup.prop1 || data.lineup.bench1)) return data.lineup as Lineup;
  return null;
}

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

function calcFantasyPoints(row: any, player?: PositionInfo): number {
  return getRoundPointsFromRow(row, player) ?? 0;
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

function findPlayerMetaById(allPlayersAny: any[], playerId: string) {
  const want = normaliseId(playerId);
  if (!want) return null;

  return (
    (allPlayersAny ?? []).find((p: any) => {
      const pid = p?.id ?? p?.playerId ?? p?.player_id ?? p?.["Player ID"] ?? null;
      return pid != null && normaliseId(pid) === want;
    }) ?? null
  );
}

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
  () => totalForSlots(leftSel.lineup, leftEffC, STARTER_SLOTS),
  [leftSel.lineup, leftEffC, weekPointsByPlayerId]
);
const oppScoreLive = useMemo(
  () => totalForSlots(rightSel.lineup, rightEffC, STARTER_SLOTS),
  [rightSel.lineup, rightEffC, weekPointsByPlayerId]
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

// We only run one league and it is post-draft.
// If there is no league, show NoLeague. Otherwise always show PostDraft.
const effectiveDashState: DashboardState = activeLeague ? "postDraft" : "noLeague";

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

  // Force "you" on the left if possible
  let leftId = homeId;
  let rightId = awayId;

  if (yourLeagueTeamId && (homeId === yourLeagueTeamId || awayId === yourLeagueTeamId)) {
    leftId = yourLeagueTeamId;
    rightId = homeId === yourLeagueTeamId ? awayId : homeId;
  }

  return {
    weekNo: upcomingWeekNo,
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

  // -----------------------
// Standings (LIVE from sheetFixtures + activeLeague teams)
// -----------------------
type StandingCalc = {
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
};

function buildStandingsFromResults(uptoWeekInclusive: number): StandingCalc[] {
  const teams = activeLeague?.teams ?? [];
  const base = new Map<string, StandingCalc>();

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

  const rows = sheetFixtures
    .filter((r) => isSheetMatchRow(r))
    .filter((r) => isSheetRegularRow(r))
    .filter((r) => String(r.status ?? "").toLowerCase() === "complete")
    .filter((r) => Number(r.weekFantasy) <= uptoWeekInclusive);

  for (const m of rows) {
    const homeId = m.homeTeamId ?? null;
    const awayId = m.awayTeamId ?? null;

    const hs = m.homeScore;
    const as = m.awayScore;

    // BYE row: include the real team's score in PF only
    if (!homeId || !awayId) {
      const realTeamId = homeId ?? awayId;
      const realScore = homeId ? hs : as;

      if (!realTeamId || realScore == null) continue;

      const team = base.get(realTeamId);
      if (!team) continue;

      team.pf += realScore;
      team.pd = team.pf - team.pa;
      continue;
    }

    if (hs == null || as == null) continue;

    const home = base.get(homeId);
    const away = base.get(awayId);
    if (!home || !away) continue;

    home.played += 1;
    away.played += 1;

    home.pf += hs;
    home.pa += as;
    away.pf += as;
    away.pa += hs;

    if (hs > as) {
      home.wins += 1;
      home.pts += 4;
      away.losses += 1;
    } else if (as > hs) {
      away.wins += 1;
      away.pts += 4;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.pts += 2;
      away.pts += 2;
    }

    home.pd = home.pf - home.pa;
    away.pd = away.pf - away.pa;
  }

  return Array.from(base.values());
}

const standings: StandingRow[] = useMemo(() => {
  if (!activeLeague?.teams?.length) return [];

  // standings should advance only based on completed REGULAR weeks
  const playedNow = sheetFixtures.length ? latestCompletedWeekFromSheet(
    sheetFixtures.filter(isSheetRegularRow)
  ) : 0;

  const playedPrev = Math.max(0, playedNow - 1);

  const curr = buildStandingsFromResults(playedNow);
  const prev = buildStandingsFromResults(playedPrev);

  const sortRows = (arr: StandingCalc[]) =>
    arr.slice().sort((a, b) => b.pts - a.pts || b.pf - a.pf || b.pd - a.pd);

  const currSorted = sortRows(curr);
  const prevSorted = sortRows(prev);

  const prevRankById = new Map(prevSorted.map((r, i) => [r.teamId, i + 1]));

  // Dashboard StandingRow is { rank, team, pts, movement }
  return currSorted
    .map((r, i) => {
      const rank = i + 1;
      const prevRank = prevRankById.get(r.teamId);

      let movement: Movement = "same";
      if (prevRank != null) {
        if (rank < prevRank) movement = "up";
        else if (rank > prevRank) movement = "down";
      }

      return {
        rank,
        team: r.teamName,
        pts: r.pts,
        movement,
      };
    })
    .slice(0, 10); // safety cap for dashboard
}, [activeLeague?.teams, sheetFixtures]);

const bestAvailablePlayers: Player[] = useMemo(() => {
  const src = Array.isArray(allPlayers) ? allPlayers : [];

  const mapped: Player[] = src
    .map((p: any) => {
      const id = String(p.id ?? p.playerId ?? "").trim();
      if (!id) return null;

      const firstName = String(p.firstName ?? p.first_name ?? "").trim();
      const lastName = String(p.lastName ?? p.last_name ?? "").trim();

      const teamCode = String(p.teamCode ?? p.team ?? p.team_code ?? "").trim() || "TBC";
      const posAbbrev = String(p.posAbbrev ?? p.pos ?? p.position ?? "").trim() || "—";
const posNamePrimary = String(p.posName ?? p.positionName ?? "").trim() || posAbbrev;

// try common secondary fields
const pos2 =
  String(
    p.pos2 ?? p.secondaryPos ?? p.secondary_position ?? p.secondaryPosition ?? ""
  ).trim();

const posName = pos2 ? `${posNamePrimary} / ${pos2}` : posNamePrimary;

      const form = getLatest3FormFromRoundRows(id, roundRows, p);

      return {
        id,
        firstName: firstName || "?",
        lastName: lastName || "?",
        teamCode,
        posAbbrev,
        posName,
        form: Number.isFinite(form) ? form : 0,
      } as Player;
    })
    .filter(Boolean) as Player[];

  // "Available" = not currently rostered by ANY team in the league
  const available = mapped.filter((p) => !rosteredIds.has(String(p.id).toLowerCase()));

  // Sort by form desc, then name as tie-break
  available.sort((a, b) => {
    if (b.form !== a.form) return b.form - a.form;
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return available.slice(0, 10);
}, [allPlayers, rosteredIds, roundRows]);

  const playersOfWeek: Player[] = useMemo(() => {
  if (!displayWeek) return [];
  if (!weekPointsByPlayerId || weekPointsByPlayerId.size === 0) return [];

  // find max points this round
  let maxPts = -Infinity;
  for (const pts of weekPointsByPlayerId.values()) {
    if (typeof pts === "number" && pts > maxPts) maxPts = pts;
  }
  if (!Number.isFinite(maxPts) || maxPts <= 0) return [];

  // all playerIds with maxPts
  const topIds: string[] = [];
  for (const [pid, pts] of weekPointsByPlayerId.entries()) {
    if (pts === maxPts) topIds.push(pid);
  }
  if (!topIds.length) return [];

  const src = Array.isArray(allPlayers) ? allPlayers : [];

  const mapped: Player[] = topIds
    .map((pidLower) => {
      const meta = findPlayerMetaById(src, pidLower);
      // if we can't find metadata, still show something sane
      const firstName = String(meta?.firstName ?? meta?.first_name ?? "?").trim() || "?";
      const lastName = String(meta?.lastName ?? meta?.last_name ?? "?").trim() || "?";
      const teamCode = String(meta?.teamCode ?? meta?.team ?? meta?.team_code ?? "TBC").trim() || "TBC";
      const posAbbrev = String(meta?.posAbbrev ?? meta?.pos ?? meta?.position ?? "—").trim() || "—";
      const posName = String(meta?.posName ?? meta?.positionName ?? posAbbrev).trim() || posAbbrev;

      return {
        id: String(meta?.id ?? meta?.playerId ?? meta?.player_id ?? pidLower),
        firstName,
        lastName,
        teamCode,
        posAbbrev,
        posName,
        form: 0,
        points: maxPts,
      } as Player;
    })
    .filter(Boolean);

  // stable ordering for ties
  mapped.sort((a, b) => {
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return mapped;
}, [allPlayers, weekPointsByPlayerId, displayWeek]);

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

  // -----------------------
  // Styles
  // -----------------------
  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    padding: 14,
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const primaryButton: React.CSSProperties = {
    height: 36,
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
    color: "white",
    fontSize: 13,
    fontWeight: 800,
    border: "2px solid rgba(255,255,255,0.85)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    cursor: "pointer",
  };

  const secondaryButton: React.CSSProperties = {
    height: 36,
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
    border: "2px solid rgba(255,255,255,0.85)",
    cursor: "pointer",
  };

  // Small square icon buttons (match Transactions look/feel)
const iconBtnBase: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.18)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

const iconGlyphStyle: React.CSSProperties = {
  lineHeight: "1",
  transform: "translateY(-1px)", // <-- the key: fixes “looks low” on ★ and +
  display: "block",
};

async function handleLogout() {
  try {
    await fetch("/api/session/logout", { method: "POST" });
  } catch {
    // ignore
  }

  // Optional: clear local UI caches so you see a “clean” state after logout
  try {
    localStorage.removeItem("sr-user-profile-v1"); // if you use this key in lib/session
    localStorage.removeItem("sr-leagues-v3");      // your league zustand persist key
  } catch {}

  // Full page load so the whole app forgets the signed-in player.
  window.location.assign("/");
}
  function MovementCircle__render({ movement }: { movement: Movement }) {
  const isUp = movement === "up";
  const isDown = movement === "down";
  const isSame = movement === "same";

  const bg = isUp ? "#22C55E" : isDown ? "#EF4444" : "rgba(255,255,255,0.22)";
  const symbol = isUp ? "▲" : isDown ? "▼" : "=";

  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        color: "white",
        fontWeight: 900,
        fontSize: isSame ? 12 : 11,
        lineHeight: "12px",
      }}
    >
      <span
        style={{
          display: "block",
          transform: isDown ? "translateY(1px)" : "translateY(0)",
        }}
      >
        {symbol}
      </span>
    </span>
  );
}
const MovementCircle = useStableComponent(MovementCircle__render);

const JERSEYS: Record<string, { angle?: string; front?: string; single?: string }> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.webp", front: "/images/jerseys/BLUJerseyFront.webp" },
  BRU: { single: "/images/jerseys/BRUJersey.webp" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.webp", front: "/images/jerseys/CHIJerseyFront.webp" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.webp", front: "/images/jerseys/CRUJerseyFront.webp" },
  DRU: { single: "/images/jerseys/DRUJersey.webp" },
  FOR: { single: "/images/jerseys/FORJersey.webp" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.webp", front: "/images/jerseys/HIGJerseyFront.webp" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.webp", front: "/images/jerseys/HURJerseyFront.webp" },
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.webp", front: "/images/jerseys/MOPJerseyFront.webp" },
  RED: { single: "/images/jerseys/REDJersey.webp" },
  WAR: { single: "/images/jerseys/WARJersey.webp" },
};

const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.webp";

function jerseySrcForTeamCode(teamCode: string | null | undefined, prefer: "angle" | "front" = "angle") {
  const code = normalizeTeamCode(teamCode);
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

function fullTeamNameFromCode(teamCode: string | null | undefined) {
  const code = normalizeTeamCode(teamCode);

  const MAP: Record<string, string> = {
    BLU: "Blues",
    BRU: "Brumbies",
    CHI: "Chiefs",
    CRU: "Crusaders",
    DRU: "Drua",
    FOR: "Force",
    HIG: "Highlanders",
    HUR: "Hurricanes",
    MOA: "Moana",
    RED: "Reds",
    WAR: "Waratahs",
  };

  return MAP[code] ?? (teamCode ? String(teamCode) : "TBC");
}

function JerseyTile__render({
  size = 36,
  teamCode,
}: {
  size?: number;
  teamCode?: string;
}) {
  const src = jerseySrcForTeamCode(teamCode, "angle");

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        objectFit: "contain",
        display: "block",
      }}
      draggable={false}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = JERSEY_PLACEHOLDER;
      }}
    />
  );
}
const JerseyTile = useStableComponent(JerseyTile__render);

  // -----------------------
  // Layout blocks
  // -----------------------
  function Header__render() {
    return (
      <>

        {/* Hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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

  <div style={{ flex: 1 }} />

  <button
    onClick={handleLogout}
    style={{
      height: 30,
      padding: "0 14px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.75)",
      background: "rgba(0,0,0,0.18)",
      color: "white",
      fontSize: 11,
      fontWeight: 900,
      cursor: "pointer",
    }}
  >
    Logout
  </button>
</div>

        {/* Deadline banner */}
        <div
          style={{
            marginTop: 10,
            borderRadius: 999,
            overflow: "hidden",
            boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
          }}
        >
          <div
            style={{
              background: "#FACC15",
              color: "#0f172a",
              textAlign: "center",
              padding: "6px 12px",
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            {bannerTitle}
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.88)",
              color: "#0f172a",
              textAlign: "center",
              padding: "6px 12px",
              fontWeight: 700,
              fontSize: 11,
              borderTop: "1px solid rgba(15,23,42,0.12)",
            }}
          >
            {bannerTime}
          </div>
        </div>
      </>
    );
  }
const Header = useStableComponent(Header__render);

  function NoLeague__render() {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900 }}>
            No League Joined
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <button style={primaryButton} onClick={() => router.push("/league")}>
  Join League
</button>
<button style={primaryButton} onClick={() => router.push("/league")}>
  Create New League
</button>

          </div>
        </div>
      </div>
    );
  }
const NoLeague = useStableComponent(NoLeague__render);

  function PostDraft__render() {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        {/* League / matchup card */}
        <div style={cardStyle}>
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: 24 }}>
            {leagueName}
          </div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 18, fontWeight: 800 }}>
            {weekLabel}
          </div>

          <div
            style={{
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.28)",
              paddingTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <ScoreBlock score={userScore} team={leftName} record={userRecord} align="left" />
<ScoreBlock score={oppScore} team={rightName} record={oppRecord} align="right" />
          </div>

          <button style={{ ...primaryButton, marginTop: 12 }} onClick={() => router.push("/matchup")}>
  View Matchup
</button>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button style={secondaryButton} onClick={() => router.push("/team-selection")}>
  Select Team
</button>
<button
  style={{ ...secondaryButton, position: "relative" }}
  onClick={() => router.push("/transactions")}
>
  Make Transfers

  {pendingTradeCount > 0 ? (
    <span
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        minWidth: 18,
        height: 18,
        padding: "0 6px",
        borderRadius: 999,
        background: "#EF4444",
        color: "white",
        fontSize: 11,
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: "18px",
        border: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 10px 18px rgba(0,0,0,0.25)",
      }}
      aria-label={`${pendingTradeCount} pending trade offers`}
    >
      {pendingTradeCount > 99 ? "99+" : pendingTradeCount}
    </span>
  ) : null}
</button>
          </div>
        </div>

        {/* Upcoming fixture */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Upcoming Fixture</div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(0,0,0,0.10)",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: 12,
            }}
          >
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, opacity: 0.85 }}>
              {upcomingWeek}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              <div style={{ textAlign: "left" }}>{upcomingHome}</div>
              <div style={{ opacity: 0.85 }}>v</div>
              <div style={{ textAlign: "right" }}>{upcomingAway}</div>
            </div>
          </div>
        </div>

        <StandingsCard />

        {/* Player of the week */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Player of the Week</div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              minHeight: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#0f172a",
            }}
          >
            {playersOfWeek.length ? (
  <div style={{ display: "grid", gap: 8, width: "100%" }}>
    {playersOfWeek.map((p) => (
      <button
        key={p.id}
        onClick={() => {
  const ownerTeamId = ownerTeamIdByPlayerId.get(normaliseId(p.id)) ?? null;

  setModal({
  type: "playerCard",
  player: p,
  ownerTeamId,
});
}}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <JerseyTile size={44} teamCode={p.teamCode} />
            <div>
              <div style={{ fontWeight: 900, fontSize: 12 }}>
                {p.firstName} {p.lastName}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {fullTeamNameFromCode(p.teamCode)} — {singularPosLabel(p.posName)}
              </div>
            </div>
          </div>

          <div style={{ fontWeight: 900, whiteSpace: "nowrap" }}>
            {(p.points ?? 0)} pts
          </div>
        </div>
      </button>
    ))}
  </div>
) : (
  <div style={{ opacity: 0.35, fontWeight: 800, fontSize: 12 }}>
    No scores yet this week
  </div>
)}
          </div>

          <button
            style={{ ...primaryButton, marginTop: 10, height: 34, fontSize: 12 }}
            onClick={() => router.push("/team-of-the-week")}
          >
            Team of the Week
          </button>
        </div>

        {/* Best available players */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
            Best Available Players
          </div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
              color: "#0f172a",
            }}
          >
            <div style={{ padding: 5, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 73px", gap: 10 }}>
                <div />
                <div style={{ textAlign: "right", paddingRight: -0 }}>Form</div>
                <div />
              </div>
            </div>

            <div style={{ display: "grid" }}>
              {bestAvailablePlayers.map((p, idx) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  // (a clickable block, not a <button>: it holds the star and add buttons)
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.currentTarget as HTMLDivElement).click();
                  }}
onClick={() => {
  const ownerTeamId = ownerTeamIdByPlayerId.get(normaliseId(p.id)) ?? null;

  setModal({
    type: "playerCard",
    player: p,
    ownerTeamId,
    teamLabel: ownerTeamId ? nameByTeamId(ownerTeamId) : "Available",
  });
}}                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 64px 66px",
                      gap: 10,
                      alignItems: "center",
                      padding: "5px 10px",
                      borderTop: idx === 0 ? "1px solid rgba(0,0,0,0.08)" : undefined,
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <JerseyTile size={34} teamCode={p.teamCode} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {p.firstName[0]}. {p.lastName}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
  {fullTeamNameFromCode(p.teamCode)} — {singularPosLabel(p.posName)}
</div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 800, fontSize: 12 }}>
                      {p.form.toFixed(1)}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
{/* Watchlist */}
<button
  onClick={(e) => {
    e.stopPropagation();
    toggleWatchlistForDashboard(p.id);
  }}
  aria-label={isWatched(p.id) ? "Remove from watchlist" : "Add to watchlist"}
  style={{
    width: 28,
    height: 28,
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.22)",
    background: isWatched(p.id) ? "#F6E7A6" : "rgba(15,23,42,0.10)",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  }}
>
  {isWatched(p.id) ? "★" : "☆"}
</button>

  {/* Add -> Transactions prefill */}
  <button
    onClick={(e) => {
      e.stopPropagation();
      goToTransactionsForAdd(p.id);
    }}
    aria-label="Add player"
    style={{
      width: 28,
      height: 28,
      borderRadius: 10,
      border: "none",
      background: addBtnBg,
      color: "white",
      fontWeight: 900,
      fontSize: 24,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
    }}
  >
    +
  </button>
</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => router.push("/transactions")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#0f172a",
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                  opacity: 0.75,
                }}
              >
                View All Players
              </button>
            </div>
          </div>
        </div>

      </div>
    );
  }
const PostDraft = useStableComponent(PostDraft__render);

  function ScoreBlock__render({
    score,
    team,
    record,
    align,
  }: {
    score: number;
    team: string;
    record: string;
    align: "left" | "right";
  }) {
    return (
      <div style={{ textAlign: align as any }}>
        <div style={{ fontSize: 34, fontWeight: 900, lineHeight: "34px" }}>{score}</div>
        <div style={{ marginTop: 6, fontSize: 17, fontWeight: 900 }}>{team}</div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, opacity: 0.9 }}>{record}</div>
      </div>
    );
  }
const ScoreBlock = useStableComponent(ScoreBlock__render);

  function StandingsCard__render() {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>{leagueName}</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr 44px",
            gap: 8,
            fontSize: 11,
            fontWeight: 900,
            opacity: 0.9,
            padding: "0 6px 6px 6px",
          }}
        >
          <div>Rank</div>
          <div>Team</div>
          <div style={{ textAlign: "right" }}>Pts</div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {standings.map((r) => (
            <div
              key={r.rank}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr 44px",
                gap: 8,
                alignItems: "center",
                borderRadius: 10,
                background: "rgba(0,0,0,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
                padding: "6px 6px",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 16, textAlign: "right", fontWeight: 900 }}>{r.rank}</span>
                <MovementCircle movement={r.movement} />
              </div>

              <div style={{ fontWeight: 600 }}>{r.team}</div>

              <div style={{ textAlign: "right", fontWeight: 900 }}>{r.pts}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => router.push("/league")}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.95)",
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
            }}
          >
            View Full Standings
          </button>
        </div>
      </div>
    );
  }
const StandingsCard = useStableComponent(StandingsCard__render);

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
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <Header />
        {effectiveDashState === "noLeague" && <NoLeague />}
{effectiveDashState === "postDraft" && <PostDraft />}

      </div>

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
