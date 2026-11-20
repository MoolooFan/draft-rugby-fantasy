"use client";

import { rosterSize, STANDARD_SQUAD } from "@/lib/league/squad";
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppMenu } from "@/components/AppMenu";
import { PlayerCardModal } from "@/components/PlayerCardModal";

import { TEAM_OPTIONS } from "@/lib/constants";
import { getActiveUsername, getActiveTimezone } from "@/lib/session";
import { useRequireSession } from "@/lib/session/useRequireSession";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { useTransactionsStore } from "@/lib/transactions/store";
import { usePlayersStore } from "@/lib/players/store";

import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";

import { usePlayerPool } from "@/lib/players/pool";
import { currentSeasonYear, fixturesByFantasyWeek, roundLabel } from "@/lib/season";

import { listBox } from "@/components/transactions/helpers";
import { TransactionsTab } from "@/components/transactions/TransactionsTab";
import { WaiverClaimsTab } from "@/components/transactions/WaiverClaimsTab";
import { DropSelectModal } from "@/components/transactions/DropSelectModal";
import { ConfirmAcceptTradeModal } from "@/components/transactions/ConfirmAcceptTradeModal";
import { createPlayerMetrics, VIEW_MODES, type InfoMode } from "@/components/transactions/playerMetrics";
import { formatDeadline, useNowTick, normUser, extractRosterIdsClient, SORT_OPTIONS, NO_DROP } from "@/components/transactions/helpers";
import type { Player, AnyFixture, TabKey } from "@/components/transactions/helpers";
import { PlayerRow } from "@/components/transactions/PlayerRow";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import { canPlayPosition } from "@/lib/players/positions";
import { useStableComponent } from "@/lib/hooks/useStableComponent";
import { toMs, getWeekDeadlineMs, getWeeksSorted, type SheetFixtureRow, currentWeekFromSheet } from "@/lib/league/weekHelpers";
import { PoolFilterBar, matchesPoolFilters, EMPTY_FILTERS, type PoolFilters } from "@/components/PoolFilters";
import { TradeReviewModal } from "@/components/TradeReviewModal";
import { STAT_VIEW_LABEL, useStatView } from "@/lib/players/statView";
import { useStatSeason, useStatSeasonRows } from "@/lib/players/useStatSeason";
import { useProjections } from "@/lib/projections/useProjections";

function TransactionsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ENABLE_TRADES = true;
  const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

  const returnTo = useMemo(() => {
    const qs = searchParams?.toString?.() ?? "";
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  // Menu + league
  const [menuOpen, setMenuOpen] = useState(false);
const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s: any) => s.activeLeagueId ?? s.activeLeague?.id ?? null);
const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
// ❌ REMOVE tradeWindowOpen here (nowMs/selectionDeadlineMs aren’t defined yet)

// ✅ derive activeLeague WITHOUT calling a store function in the selector
const activeLeague = useMemo(() => {
  if (!leagues?.length) return null;
  if (activeLeagueId) return leagues.find((l: any) => l.id === activeLeagueId) ?? leagues[0];
  return leagues[0];
}, [leagues, activeLeagueId]);

  const userId = useMemo(() => normUser(getActiveUsername()), []);
  const userTz = useMemo(() => getActiveTimezone(), []);

  // Draft store data
  const draftTeams = useDraftStore((s) => s.teams);
  const rosters = useDraftStore((s) => s.rosters);
  const applyRosterMove = useDraftStore((s) => (s as any).applyRosterMove);

const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
const [watchlistLoaded, setWatchlistLoaded] = useState(false);

const toggleWatchlist = React.useCallback(
  async (playerId: string) => {
    const leagueId = String(activeLeague?.id ?? "");
    if (!leagueId) return;

    // (TEMP) league-wide watchlist
    // Later when you make it per-team, include teamId in these API calls.
    const isStar = watchlistSet.has(playerId);

    // optimistic UI
    setWatchlistSet((prev) => {
      const next = new Set(prev);
      if (isStar) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

    try {
      if (isStar) {
        await fetch(
          `/api/watchlist?leagueId=${encodeURIComponent(leagueId)}&playerId=${encodeURIComponent(playerId)}`,
          { method: "DELETE" }
        );
      } else {
        await fetch(`/api/watchlist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leagueId, playerId }),
        });
      }
    } catch (e) {
      // rollback on failure
      setWatchlistSet((prev) => {
        const next = new Set(prev);
        if (isStar) next.add(playerId);
        else next.delete(playerId);
        return next;
      });
    }
  },
  [activeLeague?.id, watchlistSet]
);

const watchlist = useMemo(() => {
  // keep your existing "watchlist[playerId]" checks working
  const obj: Record<string, boolean> = {};
  watchlistSet.forEach((id) => (obj[id] = true));
  return obj;
}, [watchlistSet]);

useEffect(() => {
  if (!activeLeague?.id) return;

  const season = currentSeasonYear();

  fetch(
    `/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(activeLeague.id)}`,
    {
      cache: "no-store",
      credentials: "include",
    }
  )
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id]);

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  let cancelled = false;
  (async () => {
    setWatchlistLoaded(false);
    const res = await fetch(`/api/watchlist?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (cancelled) return;

    if (res.ok && json?.ok) {
      setWatchlistSet(new Set<string>((json.data ?? []).map(String)));
    } else {
      setWatchlistSet(new Set());
    }
    setWatchlistLoaded(true);
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeague?.id]);

  // Transactions store (local fallback data)
const claims = useTransactionsStore((s: any) => s.claims ?? []);
const trades = useTransactionsStore((s: any) => s.trades ?? []);
const dropLocks = useTransactionsStore((s: any) => s.dropLocks ?? []);

// this name varies in your codebase; keep it tolerant:
const freeAgentTransfers = useTransactionsStore(
  (s: any) => s.freeAgentTransfers ?? s.freeAgents ?? s.freeAgencyTransfers ?? []
);

// -----------------------
// Live Players (Google Sheet) hydration
// -----------------------
const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
// season stats people browse: the season picked in Filters (default: last season's until this
// season's first kickoff, lib/season statsSeasonYear)
const { rows: roundRows } = useStatSeasonRows();
const getLivePlayerById = usePlayersStore((s) => s.getById); // keep for modal status only

useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);

// -----------------------
// Resolve "your team id" robustly (THIS FIXES RECEIVED TRADES NOT SHOWING)
// -----------------------
function pickFirstTruthy<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v != null && String(v).trim() !== "") return v as T;
  return null;
}

function normStr(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

const yourDraftTeamId = useMemo(() => {
  const l: any = activeLeague;
  if (!l) return null;

  // 0) If the league store already knows your team id, use it.
  // (These keys cover common patterns across your codebase.)
  const direct = pickFirstTruthy(
    l.myTeamId,
    l.my_team_id,
    l.activeTeamId,
    l.active_team_id,
    l.teamId,
    l.team_id
  );
  if (direct) return String(direct);

  const leagueTeams = Array.isArray(l.teams) ? l.teams : [];
  const u = normStr(userId);

  // 1) Try to match activeLeague.teams ownership fields
  if (u && leagueTeams.length) {
    const mine = leagueTeams.find((t: any) => {
      const candidates = [
        t.userId,
        t.user_id,
        t.owner_username,
        t.ownerUsername,
        t.username,
        t.email,
        t.owner_email,
        t.ownerEmail,
      ].map(normStr);

      return candidates.includes(u);
    });

    if (mine?.id) return String(mine.id);
  }

  // 2) Fallback: match draftTeams ownership fields (sometimes this is more reliable)
  if (u && Array.isArray(draftTeams) && draftTeams.length) {
    const mineDraft = draftTeams.find((t: any) => {
      const candidates = [
        t.userId,
        t.user_id,
        t.owner_username,
        t.ownerUsername,
        t.username,
        t.email,
      ].map(normStr);

      return candidates.includes(u);
    });

    if (mineDraft?.id) return String(mineDraft.id);
  }

  // 3) If there is ONLY ONE team in the league, allow that as last resort
  if (leagueTeams.length === 1) return String(leagueTeams[0].id);

  return null;
}, [activeLeague, userId, draftTeams]);

  const yourTeamName = useMemo(() => {
    if (!yourDraftTeamId) return "Your Team";
    return draftTeams.find((t: any) => t.id === yourDraftTeamId)?.name ?? "Your Team";
  }, [draftTeams, yourDraftTeamId]);

    // Players (normalize teamCode like Draft Room)
  const playerPool = usePlayerPool();
  const allPlayers: Player[] = useMemo(() => {
    return (playerPool as unknown as Player[]).map((p) => ({
      ...p,
      teamCode: normalizeTeamCode(p.teamCode),
    }));
  }, [playerPool]);

  // Fixtures + week logic (matches Team Selection)
  const fixtures = useMemo(
    () => (fixturesData as AnyFixture[]).map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) })),
    []
  );
  const normalizedFixtures = useMemo(
    () => fixtures.slice().sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0)),
    [fixtures]
  );

  const nowMs = useNowTick(30_000);
  const weeksSorted = useMemo(() => getWeeksSorted(normalizedFixtures), [normalizedFixtures]);

const liveWeek = useMemo(() => {
  if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
  return currentWeekFromSheet(sheetFixtures);
}, [sheetFixtures, activeLeague?.currentWeek]);

  const liveWeekDeadlineMs = useMemo(
    () => getWeekDeadlineMs(normalizedFixtures as any, liveWeek),
    [normalizedFixtures, liveWeek]
  );

  const selectionWeek = useMemo(() => {
    if (!liveWeekDeadlineMs) return liveWeek;
    if (nowMs < liveWeekDeadlineMs) return liveWeek;
    const idx = weeksSorted.indexOf(liveWeek);
    return weeksSorted[idx + 1] ?? liveWeek + 1;
  }, [nowMs, liveWeekDeadlineMs, liveWeek, weeksSorted]);

  const selectionDeadlineMs = useMemo(
    () => getWeekDeadlineMs(normalizedFixtures as any, selectionWeek),
    [normalizedFixtures, selectionWeek]
  );

  const tradeWindowOpen = useMemo(() => {
  if (!nowMs || !selectionDeadlineMs) return false;
  return nowMs < selectionDeadlineMs;
}, [nowMs, selectionDeadlineMs]);

  const waiverDeadlineMs = useMemo(() => {
    if (!selectionDeadlineMs) return 0;
    return selectionDeadlineMs - 24 * 60 * 60 * 1000; // 24h before selection deadline
  }, [selectionDeadlineMs]);

  const windowMode = useMemo<"WAIVERS" | "FREE_AGENCY">(() => {
  if (!nowMs || !waiverDeadlineMs || !selectionDeadlineMs) return "WAIVERS";
  return nowMs < waiverDeadlineMs ? "WAIVERS" : nowMs < selectionDeadlineMs ? "FREE_AGENCY" : "WAIVERS";
}, [nowMs, waiverDeadlineMs, selectionDeadlineMs]);

function nextWeekFrom(weeksSorted: number[], week: number) {
  const idx = weeksSorted.indexOf(week);
  if (idx >= 0 && idx < weeksSorted.length - 1) return weeksSorted[idx + 1];
  return week + 1;
}

// ✅ Claims week flips immediately once waiver deadline passes
const claimsWeek = useMemo(() => {
  if (!nowMs || !waiverDeadlineMs) return selectionWeek;
  if (nowMs < waiverDeadlineMs) return selectionWeek;
  return nextWeekFrom(weeksSorted, selectionWeek);
}, [nowMs, waiverDeadlineMs, selectionWeek, weeksSorted]);

  // Deadline text banner (shows next relevant deadline)
  const deadlineLabel = windowMode === "WAIVERS" ? "Waiver Deadline" : "Team Selection Deadline";
const deadlineText = useMemo(() => {
  if (!nowMs) return "—";
  const ms = windowMode === "WAIVERS" ? waiverDeadlineMs : selectionDeadlineMs;
  return ms ? formatDeadline(ms, userTz) : "TBC";
}, [nowMs, windowMode, waiverDeadlineMs, selectionDeadlineMs, userTz]);

  // -----------------------
  // Drop-lock cleanup (GUARDED to prevent render loops)
  // -----------------------

const hasExpiredDropLocks = useMemo(() => {
  if (!activeLeague?.id) return false;
  return (dropLocks as any[]).some(
    (l: any) => l.leagueId === activeLeague.id && l.lockedUntilMs <= nowMs
  );
}, [dropLocks, activeLeague?.id, nowMs]);

useEffect(() => {
  if (!activeLeague?.id) return;
  if (!hasExpiredDropLocks) return;

  (async () => {
    await fetch("/api/drop-locks/cleanup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leagueId: activeLeague.id, nowMs }),
    });

    await refreshTransactionsForLeague(activeLeague.id);
  })();
}, [activeLeague?.id, hasExpiredDropLocks, nowMs]);

  // (Expired trade offers are cancelled by the server whenever trades are loaded.)

// Auto-process waivers globally (idempotent via DB guard)
useEffect(() => {
  if (!activeLeague?.id) return;
  if (!waiverDeadlineMs) return;
  if (nowMs < waiverDeadlineMs) return;

  (async () => {
    await fetch(`/api/waivers/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leagueId: activeLeague.id,
        week: liveWeek,
      }),
    });

    await refreshTransactionsForLeague(activeLeague.id);

    // refresh rosters
    const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(activeLeague.id)}`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.ok) {
      const next: Record<string, any> = {};
      for (const row of json.data ?? []) {
        if (!row?.team_id) continue;
        next[row.team_id] = row.data ?? {};
      }
      setLeagueRosters(next);
      setLeagueRostersLoaded(true);
    }
  })();
}, [activeLeague?.id, waiverDeadlineMs, nowMs, liveWeek]);

const [leagueRosters, setLeagueRosters] = useState<Record<string, any>>({});
const [leagueRostersLoaded, setLeagueRostersLoaded] = useState(false);
const [txLoaded, setTxLoaded] = useState(false);
const [txClaims, setTxClaims] = useState<any[]>([]);
const [txTrades, setTxTrades] = useState<any[]>([]);
const [txDropLocks, setTxDropLocks] = useState<any[]>([]);
const [txFreeAgents, setTxFreeAgents] = useState<any[]>([]);
const [waiverOrderLoaded, setWaiverOrderLoaded] = useState(false);
const [waiverOrderRows, setWaiverOrderRows] = useState<Array<{ teamId: string; rank: number }>>([]);
// Shield reward: the holder picks first in round 1 of the claims (lib/waivers/order.ts)
const [waiverShieldTeamId, setWaiverShieldTeamId] = useState<string | null>(null);

// ✅ single source of truth for ownership checks
const rostersForOwnership = useMemo(() => {
  // prefer server rosters when loaded, fallback to local draft store
  if (leagueRostersLoaded && leagueRosters && Object.keys(leagueRosters).length) return leagueRosters;
  return rosters ?? {};
}, [leagueRostersLoaded, leagueRosters, rosters]);

  // -----------------------
  // Ownership map (playerId -> ownerTeamId)
  // -----------------------
const ownerByPlayerId = useMemo(() => {
  const map = new Map<string, string>();
  const source = rostersForOwnership;

  for (const [teamId, roster] of Object.entries(source ?? {})) {
    const ids = extractRosterIdsClient(roster);
    for (const pid of ids) map.set(pid, teamId);
    // players in a team's IR spot are still owned by it
    const ir = (roster as any)?.irIds;
    if (Array.isArray(ir)) for (const pid of ir) map.set(String(pid), teamId);
  }
  return map;
}, [rostersForOwnership]);

  const isPlayerOwned = (playerId: string) => ownerByPlayerId.has(playerId);

    // Drop lock set (grey out add)
  const lockedUnownedSet = useMemo(() => {
    const set = new Set<string>();

    const source = txLoaded ? txDropLocks : (dropLocks as any[]);

    for (const raw of source ?? []) {
      const leagueId = String(raw?.league_id ?? raw?.leagueId ?? "");
      const playerId = String(raw?.player_id ?? raw?.playerId ?? "");
      const lockedUntilMs = Number(raw?.locked_until_ms ?? raw?.lockedUntilMs ?? 0);

      if (leagueId !== String(activeLeague?.id ?? "")) continue;
      if (!playerId) continue;
      if (!lockedUntilMs || lockedUntilMs <= nowMs) continue;

      if (!isPlayerOwned(playerId)) {
        set.add(playerId);
      }
    }

    return set;
  }, [txLoaded, txDropLocks, dropLocks, activeLeague?.id, nowMs, ownerByPlayerId]);

  // -----------------------
  // Tabs + Modal
  // -----------------------
  const [tab, setTab] = useState<TabKey>("Player Pool");
  // Transactions tab: an earlier round's moves (null = the latest) (Ethan, 13 Nov 2026)
  const [txWeek, setTxWeek] = useState<number | null>(null);
  const [modalPlayer, setModalPlayer] = useState<
  (Player & { status?: any; weeklyStatus?: any }) | null
>(null);

// -----------------------
// Confirm Accept Trade Modal State
// -----------------------
const [confirmOpen, setConfirmOpen] = useState(false);
const [confirmTrade, setConfirmTrade] = useState<any | null>(null);
// C5: a received offer opens the review pop-up (players, one stat at a time, Accept / Decline)
const [reviewTrade, setReviewTrade] = useState<any | null>(null);

function openAcceptConfirm(trade: any) {
  // only allow confirming offers RECEIVED by you
  if (trade?.toTeamId !== yourDraftTeamId) return;

  setConfirmTrade(trade);
  setConfirmOpen(true);
}

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
if (!leagueId) return;

  let cancelled = false;

  async function load() {
    try {
      setLeagueRostersLoaded(false);

      const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        console.warn("Failed to load league rosters", json?.error ?? res.statusText);
        if (!cancelled) {
          setLeagueRosters({});
          setLeagueRostersLoaded(true);
        }
        return;
      }

      // Expect rows like: [{ team_id, data, updated_at }, ...]
      const next: Record<string, any> = {};
      for (const row of json.data ?? []) {
        if (!row?.team_id) continue;
        next[row.team_id] = row.data ?? {};
      }

      if (!cancelled) {
        setLeagueRosters(next);
        setLeagueRostersLoaded(true);
      }
    } catch (e) {
      console.warn("Failed to load league rosters", e);
      if (!cancelled) {
        setLeagueRosters({});
        setLeagueRostersLoaded(true);
      }
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, [activeLeague?.id]);

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  let cancelled = false;

  (async () => {
    setWaiverOrderLoaded(false);

    try {
      const res = await fetch(
        `/api/waivers/order?leagueId=${encodeURIComponent(leagueId)}&week=${encodeURIComponent(String(selectionWeek))}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);
      if (cancelled) return;

      if (res.ok && json?.ok && Array.isArray(json.data)) {
        setWaiverShieldTeamId(json.shieldTeamId ? String(json.shieldTeamId) : null);
        // json.data is [{ teamId, rank }, ...] sorted by rank ASC
        setWaiverOrderRows(
          (json.data ?? []).map((r: any) => ({
            teamId: String(r.teamId),
            rank: Number(r.rank),
          }))
        );
      } else {
        setWaiverOrderRows([]);
        setWaiverShieldTeamId(null);
      }
    } catch {
      if (!cancelled) {
        setWaiverOrderRows([]);
        setWaiverShieldTeamId(null);
      }
    } finally {
      if (!cancelled) setWaiverOrderLoaded(true);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeague?.id, selectionWeek]);

const waiverOrderIndexByTeamId = useMemo(() => {
  const m = new Map<string, number>();
  (waiverOrderRows ?? []).forEach((r) => m.set(String(r.teamId), Number(r.rank) - 1)); // rank 1 => index 0
  return m;
}, [waiverOrderRows]);

function closeConfirm() {
  setConfirmOpen(false);
  setConfirmTrade(null);
}

function confirmAcceptTrade() {
  if (!confirmTrade) return;

  // ✅ Change 2: enforce the window inside the confirm action (not just UI)
  if (!tradeWindowOpen) {
    closeConfirm();
    return;
  }

apiAcceptTrade(confirmTrade.id);
closeConfirm();
}

  // Prevent double-tap duplicate submissions (per-player short cooldown)
  const [addCooldownByPlayerId, setAddCooldownByPlayerId] = useState<Record<string, number>>({});

  function isAddCoolingDown(playerId: string) {
    const until = addCooldownByPlayerId[playerId] ?? 0;
    return Date.now() < until;
  }

  function guardedAdd(playerId: string, fn: () => void, cooldownMs = 450) {
    if (isAddCoolingDown(playerId)) return;

    setAddCooldownByPlayerId((prev) => ({
      ...prev,
      [playerId]: Date.now() + cooldownMs,
    }));

    try {
      fn();
    } finally {
      window.setTimeout(() => {
        setAddCooldownByPlayerId((prev) => {
          const next = { ...prev };
          if ((next[playerId] ?? 0) <= Date.now()) delete next[playerId];
          return next;
        });
      }, cooldownMs + 20);
    }
  }

  // -----------------------
  // Draft Room-style filters
  // -----------------------
  const [search, setSearch] = useState("");
  // C2: Team / Position / Status (several of each allowed) and Players (Available, All or fantasy teams)
  const [poolFilters, setPoolFilters] = useState<PoolFilters>(EMPTY_FILTERS);
  const [ownerFilters, setOwnerFilters] = useState<string[]>(["available"]);
useEffect(() => {
  // When entering Watchlist, default to All Players (only if still on the default "available")
  if (tab === "Watchlist" && ownerFilters.length === 1 && ownerFilters[0] === "available") {
    setOwnerFilters(["all"]);
  }
}, [tab, ownerFilters]);

const [infoMode, setInfoMode] = useState<InfoMode>("TOTAL_PTS");
const [statView] = useStatView(); // C1: per game (default) / total / per 80 (set in Filters)
const { season: statSeasonShown, isDefault: statSeasonIsDefault } = useStatSeason();
/** e.g. "Per game · 2026" over the list (left), when the numbers depend on the switch */
function statViewLabelFor(mode: InfoMode): string {
  const parts: string[] = [];
  if (VIEW_MODES.has(mode)) parts.push(STAT_VIEW_LABEL[statView]);
  if (!statSeasonIsDefault || VIEW_MODES.has(mode)) parts.push(String(statSeasonShown));
  return parts.join(" · ");
}
// F2: this round's expected points (the league's scoring)
const weekProj = useProjections(activeLeague?.id ?? null, "current");

    // =========================
  // Drop-select modal (Claim / Add)
  // =========================
  type TxProposeMode = "WAIVER" | "FREE_AGENCY";

    const [dropModalOpen, setDropModalOpen] = useState(false);
  const [proposeMode, setProposeMode] = useState<TxProposeMode>("WAIVER");
  const [proposedAddPlayer, setProposedAddPlayer] = useState<Player | null>(null);
  const [selectedDropPlayerId, setSelectedDropPlayerId] = useState<string | null>(null);
  const [submittingProposedTransaction, setSubmittingProposedTransaction] = useState(false);

  function fullTeamName(teamCode: string) {
  return teamLabel(teamCode);
}

  function teamLabel(teamCode: string) {
  const code = normalizeTeamCode(teamCode);

  // normal lookup
  const direct = TEAM_OPTIONS.find((t) => t.value === code)?.label;
  if (direct) return direct;

  // handle Moana code mismatch (MOA vs MOP)
  if (code === "MOA") return TEAM_OPTIONS.find((t) => t.value === "MOP")?.label ?? "Moana Pasifika";
  if (code === "MOP") return TEAM_OPTIONS.find((t) => t.value === "MOA")?.label ?? "Moana Pasifika";

  return code;
}

  function playerCanPlayPos(p: any, pos: string) {
    return canPlayPosition(p, pos);
  }

  // Required squad composition (non-wildcard slots only)
  // NOTE: This is the roster restriction check after a swap.
  const REQUIRED_POS_SLOTS: string[] = useMemo(() => {
    // 1 HO, 2 PR, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB = 15 fixed slots
    const req: string[] = [];
    req.push("HO");
    req.push("PR", "PR");
    req.push("LK", "LK");
    req.push("LF", "LF", "LF");
    req.push("HB");
    req.push("FH");
    req.push("CE", "CE");
    req.push("OB", "OB", "OB");
    return req;
  }, []);

  // Backtracking feasibility check: can these players fill all REQUIRED_POS_SLOTS?
  function canFillRequiredSlots(players: Player[]) {
    // Order required slots by "hardest first" (fewest candidates) for speed.
    const required = REQUIRED_POS_SLOTS.slice();

    const candidatesByPos = new Map<string, number[]>();
    for (const pos of new Set(required)) {
      const idxs: number[] = [];
      players.forEach((pl, i) => {
        if (playerCanPlayPos(pl, pos)) idxs.push(i);
      });
      candidatesByPos.set(pos, idxs);
    }

    required.sort((a, b) => {
      const ca = candidatesByPos.get(a)?.length ?? 0;
      const cb = candidatesByPos.get(b)?.length ?? 0;
      return ca - cb;
    });

    const used = new Array(players.length).fill(false);

    function dfs(i: number): boolean {
      if (i >= required.length) return true;
      const pos = required[i];
      const cand = candidatesByPos.get(pos) ?? [];
      for (const pi of cand) {
        if (used[pi]) continue;
        used[pi] = true;
        if (dfs(i + 1)) return true;
        used[pi] = false;
      }
      return false;
    }

    return dfs(0);
  }

  // Your current roster players (unique by id)
const yourRosterPlayers: Player[] = useMemo(() => {
  if (!yourDraftTeamId) return [];
  const source = rostersForOwnership as any;
  const r: any = source?.[yourDraftTeamId];
  if (!r) return [];

  const ids = extractRosterIdsClient(r);
  const seen = new Set<string>();
  const list: Player[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const p = allPlayers.find((x) => x.id === id);
    if (p) list.push(p);
  }

  return list;
}, [rostersForOwnership, yourDraftTeamId, allPlayers]);

  // Fewer than the league's roster size (Standard 20, not counting IR): the team can add without dropping anyone.
  const hasFreePlace = yourRosterPlayers.length > 0 && yourRosterPlayers.length < rosterSize(activeLeague?.squadFormat ?? STANDARD_SQUAD);

  // Given an addPlayer, compute droppable players that keep roster valid after swap
  const droppableCandidates: Player[] = useMemo(() => {
    if (!proposedAddPlayer) return [];
    const addP = proposedAddPlayer;

    // If roster is empty, there is nothing to drop
if (!yourRosterPlayers.length) return [];

// If roster is NOT full / not at least the fixed slots count, don't enforce restrictions.
// This prevents "no valid drop options" when the roster hasn't matured yet.
const FIXED_SLOT_COUNT = REQUIRED_POS_SLOTS.length; // 15
const rosterTooSmallForValidation = yourRosterPlayers.length < FIXED_SLOT_COUNT;

const candidates: Player[] = [];

for (const dropP of yourRosterPlayers) {
  if (rosterTooSmallForValidation) {
    candidates.push(dropP);
    continue;
  }

  const nextPlayers = yourRosterPlayers
    .filter((x) => x.id !== dropP.id)
    .concat([addP]);

  if (canFillRequiredSlots(nextPlayers)) candidates.push(dropP);
}

    // Sort droppable list for nicer UX (by pos)
const POSITION_ORDER: Record<string, number> = {
  HO: 1,
  PR: 2,
  LK: 3,
  LF: 4,
  HB: 5,
  FH: 6,
  CE: 7,
  OB: 8,
};

candidates.sort((a, b) => {
  const pa = POSITION_ORDER[String(a.posAbbrev).toUpperCase()] ?? 99;
  const pb = POSITION_ORDER[String(b.posAbbrev).toUpperCase()] ?? 99;

  // Primary sort: position order
  if (pa !== pb) return pa - pb;

  // Secondary sort: name (stable, predictable)
  const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase();
  const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase();
  return an.localeCompare(bn);
});

    return candidates;
  }, [proposedAddPlayer, yourRosterPlayers]);

  function openDropModal(addPlayer: Player) {
    const mode: TxProposeMode = windowMode === "WAIVERS" ? "WAIVER" : "FREE_AGENCY";

    // ✅ Compute droppable list NOW (using addPlayer) so default selection is correct immediately
    const candidates: Player[] = [];
    for (const dropP of yourRosterPlayers) {
      const nextPlayers = yourRosterPlayers.filter((x) => x.id !== dropP.id).concat([addPlayer]);
      if (canFillRequiredSlots(nextPlayers)) candidates.push(dropP);
    }

    const POSITION_ORDER: Record<string, number> = {
  HO: 1,
  PR: 2,
  LK: 3,
  LF: 4,
  HB: 5,
  FH: 6,
  CE: 7,
  OB: 8,
};

candidates.sort((a, b) => {
  const pa = POSITION_ORDER[String(a.posAbbrev).toUpperCase()] ?? 99;
  const pb = POSITION_ORDER[String(b.posAbbrev).toUpperCase()] ?? 99;
  if (pa !== pb) return pa - pb;

  const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase();
  const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase();
  return an.localeCompare(bn);
});

setProposeMode(mode);
setProposedAddPlayer(addPlayer);

// ✅ Default selection: NONE (force user to choose)
setSelectedDropPlayerId(null);

setDropModalOpen(true);

  }

    function closeDropModal() {
    setDropModalOpen(false);
    setProposedAddPlayer(null);
    setSelectedDropPlayerId(null);
    setSubmittingProposedTransaction(false);
  }

async function refreshTransactionsForLeague(leagueId: string) {
  try {
    // 1) claims
    const claimsRes = await fetch(`/api/waivers/claims?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const claimsJson = await claimsRes.json().catch(() => null);

    // 2) trades
    const tradesRes = await fetch(`/api/trades/list?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const tradesJson = await tradesRes.json().catch(() => null);

    // 3) drop-locks
    const locksRes = await fetch(`/api/drop-locks?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const locksJson = await locksRes.json().catch(() => null);

    // 4) free agents
    const faRes = await fetch(`/api/free-agency/transfer?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const faJson = await faRes.json().catch(() => null);

    const normClaims =
      claimsRes.ok && claimsJson?.ok
        ? (claimsJson.data ?? []).map((c: any) => ({
            ...c,
            leagueId: c.league_id ?? c.leagueId,
            teamId: c.team_id ?? c.teamId,
            addPlayerId: c.add_player_id ?? c.addPlayerId,
            dropPlayerId: c.drop_player_id ?? c.dropPlayerId,
            createdAtMs: c.created_at_ms ?? c.createdAtMs,
            updatedAtMs: c.updated_at_ms ?? c.updatedAtMs,
            processedAtMs: c.processed_at_ms ?? c.processedAtMs,
            decidedAtMs: c.decided_at_ms ?? c.decidedAtMs,
          }))
        : [];

    const normTrades =
      tradesRes.ok && tradesJson?.ok
        ? (tradesJson.offers ?? tradesJson.data ?? []).map((t: any) => ({
            id: t.id,
            leagueId: t.league_id ?? t.leagueId,
            week: t.week,
            fromTeamId: t.from_team_id ?? t.fromTeamId,
            toTeamId: t.to_team_id ?? t.toTeamId,
            offerPlayerIds: t.offer_player_ids ?? t.offerPlayerIds ?? [],
            requestPlayerIds: t.request_player_ids ?? t.requestPlayerIds ?? [],
            note: t.note ?? "",
            status: t.status ?? "pending",
            createdAtMs: t.createdAtMs ?? (t.created_at ? toMs(t.created_at) : 0),
            updatedAtMs: t.updatedAtMs ?? (t.updated_at ? toMs(t.updated_at) : 0),
            acceptedAtMs: t.acceptedAtMs ?? (t.accepted_at ? toMs(t.accepted_at) : null),
            decidedAtMs: t.decidedAtMs ?? (t.decided_at ? toMs(t.decided_at) : null),
          }))
        : [];

    const normFA =
      faRes.ok && faJson?.ok
        ? (faJson.data ?? []).map((x: any) => ({
            ...x,
            leagueId: x.league_id ?? x.leagueId,
            teamId: x.team_id ?? x.teamId,
            addPlayerId: x.add_player_id ?? x.addPlayerId,
            dropPlayerId: x.drop_player_id ?? x.dropPlayerId,
            createdAtMs: x.created_at_ms ?? x.createdAtMs,
            updatedAtMs: x.updated_at_ms ?? x.updatedAtMs,
          }))
        : [];

    setTxClaims(normClaims);
    setTxTrades(normTrades);
    setTxDropLocks(locksRes.ok && locksJson?.ok ? (locksJson.data ?? []) : []);
    setTxFreeAgents(normFA);
  } catch (err) {
    console.warn("[transactions] refreshTransactionsForLeague failed:", err);

    // failsafe: don't leave the UI stuck
    setTxClaims([]);
    setTxTrades([]);
    setTxDropLocks([]);
    setTxFreeAgents([]);
  } finally {
    // ✅ the “one extra failsafe code”
    setTxLoaded(true);
  }
}

async function apiAcceptTrade(tradeId: string) {
  if (!activeLeague?.id) return;

  const acceptRes = await fetch(`/api/trades/accept`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tradeOfferId: tradeId,
  }),
});
  const acceptJson = await acceptRes.json().catch(() => null);
  if (!acceptJson?.ok) window.alert(acceptJson?.error ?? "That trade couldn't be accepted");

  await refreshTransactionsForLeague(activeLeague.id);

  // refresh rosters too (ownership changes)
  const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(activeLeague.id)}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);

  if (res.ok && json?.ok) {
    const next: Record<string, any> = {};
    for (const row of json.data ?? []) {
      if (row?.team_id) next[row.team_id] = row.data ?? {};
    }
    setLeagueRosters(next);
    setLeagueRostersLoaded(true);
  }
}

async function apiDeclineTrade(tradeId: string) {
  if (!activeLeague?.id) return;

  await fetch(`/api/trades/decline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leagueId: activeLeague.id,
      tradeId,
      reason: "Declined",
      decidedAtMs: Date.now(),
    }),
  });

  await refreshTransactionsForLeague(activeLeague.id);
}

async function apiCancelTrade(tradeId: string) {
  if (!activeLeague?.id) return;

  await fetch(`/api/trades/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leagueId: activeLeague.id,
      tradeId,
      cancelledAtMs: Date.now(),
    }),
  });

  await refreshTransactionsForLeague(activeLeague.id);
}

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;
  refreshTransactionsForLeague(leagueId);
}, [activeLeague?.id]);

async function submitProposedTransaction() {
  if (submittingProposedTransaction) return;
  if (!activeLeague?.id || !yourDraftTeamId || !proposedAddPlayer) return;
  if (!selectedDropPlayerId) return;
  const dropId = selectedDropPlayerId === NO_DROP ? null : selectedDropPlayerId;

  const leagueId = activeLeague.id;
  setSubmittingProposedTransaction(true);

  try {
    // ----------------
    // WAIVERS => POST claim, refresh tx, go to Pending Claims
    // ----------------
    if (proposeMode === "WAIVER") {
      const payload = {
        leagueId,
        week: claimsWeek,
        teamId: yourDraftTeamId,
        addPlayerId: proposedAddPlayer.id,
        dropPlayerId: dropId,
      };

      const claimRes = await fetch(`/api/waivers/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const claimJson = await claimRes.json().catch(() => null);
      if (!claimJson?.ok) {
        window.alert(claimJson?.error ?? "That claim couldn't be made");
        setSubmittingProposedTransaction(false);
        return;
      }

      await refreshTransactionsForLeague(leagueId);
      setTab("Pending Claims");
      closeDropModal();
      return;
    }

    // ----------------
    // FREE AGENCY => POST transfer, then refresh tx + rosters
    // ----------------
    const payload = {
      leagueId,
      week: selectionWeek,
      teamId: yourDraftTeamId,
      addPlayerId: proposedAddPlayer.id,
      dropPlayerId: dropId,
      createdAtMs: Date.now(),
      lockedUntilMs: selectionDeadlineMs,
    };

    const faRes = await fetch(`/api/free-agency/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const faJson = await faRes.json().catch(() => null);
    if (faJson?.failReason === "IR_PLAYER_FIT" || faJson?.failReason === "ROSTER_VALIDATION_FAILED") {
      window.alert(faJson?.extra?.validationError ?? "That signing couldn't be made");
      await refreshTransactionsForLeague(leagueId);
      setSubmittingProposedTransaction(false);
      return;
    }

    // Refresh transactions
    await refreshTransactionsForLeague(leagueId);

    // Refresh rosters so ownership updates immediately
    const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.ok) {
      const next: Record<string, any> = {};
      for (const row of json.data ?? []) {
        if (!row?.team_id) continue;
        next[row.team_id] = row.data ?? {};
      }
      setLeagueRosters(next);
      setLeagueRostersLoaded(true);
    }

    closeDropModal();

    window.setTimeout(() => {
      router.push("/team-selection");
    }, 0);
  } catch (e) {
    console.warn("submitProposedTransaction failed", e);
    setSubmittingProposedTransaction(false);
  }
}

// the player list's numbers (components/transactions/playerMetrics.tsx)
const { metricLabel, metricSortValue, metricValue, ownerTeamLabelForPlayerId } = createPlayerMetrics({
  roundRows: roundRows ?? [],
  statView,
  weekProj,
  ownerByPlayerId,
  activeLeague,
  draftTeams,
});

  // =========================
// DEV MOCKS (hoisted so badge + tab both see them)
// =========================
const DEV_MOCK_TX = false; // <- set false to remove all examples instantly

const leagueIdForMock = activeLeague?.id ?? "";
const yourIdForMock = yourDraftTeamId ?? "";

const { mockTrades, mockClaims, mockFreeAgents } = useMemo(() => {
  if (!DEV_MOCK_TX) return { mockTrades: [], mockClaims: [], mockFreeAgents: [] };

  const teams = activeLeague?.teams ?? [];
  const yourTeam = teams.find((t: any) => t.id === yourIdForMock) ?? teams[0] ?? null;

  const otherTeams = teams.filter((t: any) => t.id !== yourIdForMock);
  const otherA = otherTeams[0] ?? null;
  const otherB = otherTeams[1] ?? otherTeams[0] ?? null;

  const p0 = allPlayers[0] ?? null;
  const p1 = allPlayers[1] ?? null;
  const p2 = allPlayers[2] ?? null;
  const p3 = allPlayers[3] ?? null;
  const p4 = allPlayers[4] ?? null;
  const p5 = allPlayers[5] ?? null;

  const now = Date.now();

  // --- Trades ---
  const tradesOut: any[] = [];

  // 1) Offer RECEIVED (from otherA -> you)
  if (otherA && yourTeam && p0 && p1) {
    tradesOut.push({
      id: "mock_trade_received_1",
      leagueId: leagueIdForMock,
      status: "PENDING",
      fromTeamId: otherA.id,
      toTeamId: yourIdForMock,
      offerPlayerIds: [p0.id],
      requestPlayerIds: [p1.id],
      createdAtMs: now - 1000 * 60 * 12,
      updatedAtMs: now - 1000 * 60 * 12,
    });
  }

  // 2) Offer SENT (from you -> otherB)
  if (otherB && yourTeam && p2 && p3) {
    tradesOut.push({
      id: "mock_trade_sent_1",
      leagueId: leagueIdForMock,
      status: "PENDING",
      fromTeamId: yourIdForMock,
      toTeamId: otherB.id,
      offerPlayerIds: [p2.id],
      requestPlayerIds: [p3.id],
      createdAtMs: now - 1000 * 60 * 35,
      updatedAtMs: now - 1000 * 60 * 35,
    });
  }

  // 3) COMPLETED trade (ACCEPTED)
  if (otherA && otherB && p4 && p5) {
    tradesOut.push({
      id: "mock_trade_accepted_1",
      leagueId: leagueIdForMock,
      status: "ACCEPTED",
      fromTeamId: otherA.id,
      toTeamId: otherB.id,
      offerPlayerIds: [p4.id],
      requestPlayerIds: [p5.id],
      createdAtMs: now - 1000 * 60 * 60 * 20,
      acceptedAtMs: now - 1000 * 60 * 60 * 2,
      updatedAtMs: now - 1000 * 60 * 60 * 2,
    });
  }

  // --- Waiver claims feed (your existing mock claims logic) ---
  // (Paste your exact claimsOut code here unchanged)
  const claimsOut: any[] = [];
  // ... keep the exact code you already had ...

  // --- Free agent transfers feed ---
  const freeOut: any[] = [];
  if (yourTeam && p0 && p2) {
    freeOut.push({
      id: "mock_free_1",
      leagueId: leagueIdForMock,
      week: selectionWeek,
      teamId: yourIdForMock,
      addPlayerId: p0.id,
      dropPlayerId: p2.id,
      status: "PROCESSED",
      createdAtMs: now - 1000 * 60 * 18,
      updatedAtMs: now - 1000 * 60 * 18,
    });
  }

  return { mockTrades: tradesOut, mockClaims: claimsOut, mockFreeAgents: freeOut };
}, [DEV_MOCK_TX, activeLeague?.teams, yourIdForMock, leagueIdForMock, allPlayers, selectionWeek]);

// ✅ arrays the UI should use (badge + tab)
const tradesSource = txLoaded ? txTrades : (trades as any[]);
const claimsSource = txLoaded ? txClaims : (claims as any[]);
const dropLocksSource = txLoaded ? txDropLocks : (dropLocks as any[]);
const freeAgentsSource = txLoaded ? txFreeAgents : (freeAgentTransfers as any[]);

// ✅ arrays the UI should use (badge + tab)
const tradesForUi = DEV_MOCK_TX ? [...mockTrades, ...tradesSource] : tradesSource;
const claimsForUi = DEV_MOCK_TX ? [...mockClaims, ...claimsSource] : claimsSource;
const freeForUi = DEV_MOCK_TX ? [...mockFreeAgents, ...freeAgentsSource] : freeAgentsSource;

  // ✅ Badge count: pending trade offers RECEIVED by you (league mates -> you)
const pendingOffersCount = useMemo(() => {
  const leagueId = activeLeague?.id;
  const yourId = yourDraftTeamId;
  if (!leagueId || !yourId) return 0;

  return (tradesForUi as any[])
    .filter((t) => t.leagueId === leagueId)
    .filter((t) => String(t.status ?? "").toLowerCase() === "pending")
    .filter((t) => t.toTeamId === yourId)
    .length;
}, [tradesForUi, activeLeague?.id, yourDraftTeamId]);

  // Like Draft Room: show AVAILABLE (unowned) players, then apply filters.
  const baseOwnerList = useMemo(() => {
    if (ownerFilters.includes("all")) return allPlayers;
    const teams = new Set(ownerFilters.filter((v) => v.startsWith("team:")).map((v) => v.slice("team:".length)));
    const wantAvailable = ownerFilters.includes("available") || (!teams.size && !ownerFilters.length);
    return allPlayers.filter((p) => {
      const owner = ownerByPlayerId.get(p.id);
      return owner ? teams.has(owner) : wantAvailable;
    });
  }, [allPlayers, ownerFilters, ownerByPlayerId]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    // work out each player's sort value once, then sort (it used to be worked out on every comparison)
    return baseOwnerList
      .filter((p) => (q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true))
      .filter((p) => matchesPoolFilters(p as any, poolFilters, getLivePlayerById?.(p.id) as any))
      .map((p) => ({ p, v: metricSortValue(p as any, infoMode) }))
      .sort((a, b) => {
        // Draft rank: lowest first (1 at top)
        if (infoMode === "DRAFT_RANK") return (a.v ?? 9999) - (b.v ?? 9999);
        // Everything else: highest first
        return (b.v ?? -Infinity) - (a.v ?? -Infinity);
      })
      .map((x) => x.p);
  }, [baseOwnerList, search, poolFilters, infoMode, roundRows, statView, getLivePlayerById, weekProj]);

  const ownerFilterOptions = useMemo(() => {
    const opts: Array<{ label: string; value: string }> = [];
    opts.push({ label: "Available Players", value: "available" });
    opts.push({ label: "All Players", value: "all" });

    const teams = activeLeague?.teams ?? [];
    for (const t of teams) {
      opts.push({ label: t.name, value: `team:${t.id}` });
    }
    return opts;
  }, [activeLeague?.teams]);

  const playerPoolPlayers = filteredPlayers;

  const watchlistPlayers = useMemo(() => {
    return filteredPlayers.filter((p) => !!(watchlist as any)[p.id]);
  }, [filteredPlayers, watchlist]);

  // Claims for your team + selectionWeek
const yourClaims = useMemo(() => {
  if (!activeLeague?.id || !yourDraftTeamId) return [];

  const list = txLoaded ? txClaims : (claims as any[]);
return list
  .filter((c) => c.leagueId === activeLeague.id && c.week === claimsWeek && c.teamId === yourDraftTeamId)
  .filter((c) => {
    const s = String(c.status ?? "PENDING").toUpperCase();
    return s === "PENDING";
  })
    .slice()
    .sort((a, b) => {
      const ap = typeof a.priority === "number" ? a.priority : 9999;
      const bp = typeof b.priority === "number" ? b.priority : 9999;
      if (ap !== bp) return ap - bp;
      return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    });
}, [claims, txClaims, txLoaded, activeLeague?.id, claimsWeek, yourDraftTeamId]);

  // -----------------------
  // UI styles (match your vibe + Draft Room list styling)
  // -----------------------
  const card35: React.CSSProperties = { ...themeCard, padding: undefined };

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
    fontWeight: 700,
    cursor: "pointer",
  });

  function Hamburger__render() {
    return (
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "inherit",
          fontSize: 30,
          fontWeight: 700,
          lineHeight: "30px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }
const Hamburger = useStableComponent(Hamburger__render);

  function Tabs__render() {
  const tabs: TabKey[] = ["Player Pool", "Watchlist", "Pending Claims", "Transactions"];

  const badgeStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    padding: "0 5px",
    borderRadius: 999,
    background: "#EF4444",
    color: "white",
    fontSize: 10,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    lineHeight: "16px",
    boxShadow: "0 6px 14px rgba(0,0,0,0.20)",
  };

  return (
    <div style={tabBarStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {tabs.map((t) => {
          const isActive = t === tab;
          const showBadge = t === "Transactions" && pendingOffersCount > 0;

          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...tabBtn(isActive),
                position: "relative", // ✅ required so badge anchors to the button
              }}
            >
              {t}

              {showBadge ? (
                <span style={badgeStyle}>
                  {pendingOffersCount > 99 ? "99+" : pendingOffersCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
const Tabs = useStableComponent(Tabs__render);

  function DeadlineBanner__render() {
    return (
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
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {roundLabel(selectionWeek)} • {deadlineLabel}
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.88)",
            color: "#0f172a",
            textAlign: "center",
            padding: "6px 12px",
            fontWeight: 500,
            fontSize: 11,
            borderTop: "1px solid rgba(15,23,42,0.12)",
          }}
        >
          {deadlineText}
        </div>
      </div>
    );
  }
const DeadlineBanner = useStableComponent(DeadlineBanner__render);

function goToTradeProposal(partnerTeamId: string, requestPlayerId: string) {
  const url =
    `/trade/propose` +
    `?partnerTeamId=${encodeURIComponent(partnerTeamId)}` +
    `&prefillRequestPlayerId=${encodeURIComponent(requestPlayerId)}` +
    `&returnTo=${encodeURIComponent(returnTo)}`;

  router.push(url);
}
function hydratePlayer(p: Player): Player & { status?: any; weeklyStatus?: any } {
  const live = getLivePlayerById?.(p.id);

  return {
    ...p,

    // normalize null -> undefined for modal typing
    secondaryPosAbbrev: (p.secondaryPosAbbrev ?? undefined) as any,
    secondaryPosName: (p.secondaryPosName ?? undefined) as any,

    // prefer live sheet values if present
    status: live?.status ?? (p as any).status ?? undefined,
    weeklyStatus: live?.weeklyStatus ?? (p as any).weeklyStatus ?? {},
  };
}

// Coming from the dashboard's "+" (?addPlayerId=...): start adding that player straight away
// (the drop / claim pop-up), as if his "+" had been tapped here. Then tidy the address.
const addFromLink = searchParams?.get("addPlayerId") ?? null;
const [addLinkDone, setAddLinkDone] = useState<string | null>(null);
useEffect(() => {
  if (!addFromLink || addLinkDone === addFromLink) return;
  if (!activeLeague?.id || !yourDraftTeamId || !allPlayers.length) return; // wait for the page's data
  const target = allPlayers.find((x) => x.id === addFromLink);
  setAddLinkDone(addFromLink);
  router.replace("/transactions");
  if (!target) return;
  const owner = ownerByPlayerId.get(target.id) ?? null;
  if (owner || lockedUnownedSet.has(target.id)) return; // already taken, or locked until his game
  guardedAdd(target.id, () => openDropModal(target));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [addFromLink, addLinkDone, activeLeague?.id, yourDraftTeamId, allPlayers, ownerByPlayerId, lockedUnownedSet]);

  // Player modal actions: keep blank placeholder buttons at bottom (for now)
  // Player modal actions
const modalActions = useMemo(() => {
  if (!modalPlayer) return [];

  const playerId = modalPlayer.id;

  const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;
  const isOwned = !!ownerTeamId;
  const isOwnedByYou = isOwned && ownerTeamId === yourDraftTeamId;

  // Locked means: unowned BUT temporarily locked
  const isLocked = lockedUnownedSet.has(playerId);

  const isOnWatchlist = !!(watchlist as any)[playerId];

  // If owned by you: no buttons
  if (isOwnedByYou) return [];

  // Watchlist button (always shown unless owned-by-you)
  const watchlistAction = {
  label: isOnWatchlist ? "Remove from Watchlist" : "Add to Watchlist",
  variant: "secondary" as const,
  onClick: () => toggleWatchlist(playerId),
};

  // Unowned: Claim/Sign/Locked
  if (!isOwned) {
    // FREE_AGENCY locked -> Locked button does nothing
    if (windowMode === "FREE_AGENCY" && isLocked) {
      return [
        watchlistAction,
        {
          label: "Locked",
          variant: "secondary" as const,
          onClick: () => {}, // no-op
        },
      ];
    }

    // Otherwise allow opening the add/drop modal
    const label = windowMode === "WAIVERS" ? "Submit Claim" : "Sign Player";

    return [
      watchlistAction,
      {
        label,
        variant: "primary" as const,
onClick: () => {
  const addP = modalPlayer; // capture before closing
  if (!addP) return;

  // close player card first
  setModalPlayer(null);

  // open add/drop modal next tick
  window.setTimeout(() => {
    openDropModal(addP);
  }, 0);
},

      },
    ];
  }

  // Owned by another leaguemate: Propose trade (we'll wire to a real page soon)
  return [
    watchlistAction,
    {
  label: "Propose Trade",
  variant: "primary" as const,
  onClick: () => {
    const playerId = modalPlayer.id;
    const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;

    if (!activeLeague?.id || !yourDraftTeamId || !ownerTeamId) return;

    // Close the player card before navigating
    setModalPlayer(null);

const url =
  `/trade/propose` +
  `?partnerTeamId=${encodeURIComponent(ownerTeamId)}` +
  `&prefillRequestPlayerId=${encodeURIComponent(playerId)}` +
  `&returnTo=${encodeURIComponent(returnTo)}`;

    // Navigate on next tick so the modal unmount doesn't fight routing
    window.setTimeout(() => router.push(url), 0);
  },
},

  ];
}, [
  modalPlayer,
  ownerByPlayerId,
  yourDraftTeamId,
  lockedUnownedSet,
  watchlist,
  toggleWatchlist,
  windowMode,
    openDropModal,
  router,
  returnTo,
  activeLeague?.id,
  selectionWeek,
]);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Background */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
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
        {/* Header */}
        <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Hamburger />
            <div style={{ flex: 1 }} />
          </div>

          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Transactions</div>
          
        </div>

        {/* the deadline, below the white header card like the dashboard's (Ethan, 20 Nov 2026) */}
        <DeadlineBanner />

        <Tabs />

        {tab === "Player Pool" && (
          <>
            <PoolFilterBar
  search={search}
  setSearch={setSearch}
  filters={poolFilters}
  setFilters={setPoolFilters}
  owners={ownerFilters}
  setOwners={setOwnerFilters}
  ownerOptions={ownerFilterOptions}
  sort={infoMode}
  setSort={(v) => setInfoMode(v as any)}
  sortOptions={SORT_OPTIONS}
  statOptions
/>

            <div style={listBox}>
              {/* the column's name, right above the numbers (same layout as the rows below) */}
              <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: "1fr 132px", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{statViewLabelFor(infoMode)}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ width: 34, display: "flex", justifyContent: "flex-end", whiteSpace: "nowrap", fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{metricLabel(infoMode)}</div>
                  <div style={{ width: 28 }} />
                  <div style={{ width: 28 }} />
                </div>
              </div>

              {playerPoolPlayers.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>No available players found.</div>
              ) : (
                playerPoolPlayers.map((p) => <PlayerRow
                  key={p.id}
                  p={p}
                  yourDraftTeamId={yourDraftTeamId}
                  activeLeague={activeLeague}
                  ownerByPlayerId={ownerByPlayerId}
                  lockedUnownedSet={lockedUnownedSet}
                  watchlist={watchlist}
                  toggleWatchlist={toggleWatchlist}
                  windowMode={windowMode}
                  tradeWindowOpen={tradeWindowOpen}
                  enableTrades={ENABLE_TRADES}
                  infoMode={infoMode}
                  metricValue={metricValue}
                  teamLabel={teamLabel}
                  isAddCoolingDown={isAddCoolingDown}
                  guardedAdd={guardedAdd}
                  openDropModal={openDropModal}
                  goToTradeProposal={goToTradeProposal}
                  openPlayer={(pl) => setModalPlayer(hydratePlayer(pl))}
                />)
              )}
            </div>
          </>
        )}

        {tab === "Watchlist" && (
          <>
            <PoolFilterBar
  search={search}
  setSearch={setSearch}
  filters={poolFilters}
  setFilters={setPoolFilters}
  owners={ownerFilters}
  setOwners={setOwnerFilters}
  ownerOptions={ownerFilterOptions}
  sort={infoMode}
  setSort={(v) => setInfoMode(v as any)}
  sortOptions={SORT_OPTIONS}
  statOptions
/>

            <div style={listBox}>
              {/* the column's name, right above the numbers (same layout as the rows below) */}
              <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: "1fr 132px", gap: 10, alignItems: "center" }}>
                <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>{statViewLabelFor(infoMode)}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ width: 34, display: "flex", justifyContent: "flex-end", whiteSpace: "nowrap", fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{metricLabel(infoMode)}</div>
                  <div style={{ width: 28 }} />
                  <div style={{ width: 28 }} />
                </div>
              </div>

              {watchlistPlayers.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>No players in your watchlist yet.</div>
              ) : (
                watchlistPlayers.map((p) => <PlayerRow
                  key={p.id}
                  p={p}
                  yourDraftTeamId={yourDraftTeamId}
                  activeLeague={activeLeague}
                  ownerByPlayerId={ownerByPlayerId}
                  lockedUnownedSet={lockedUnownedSet}
                  watchlist={watchlist}
                  toggleWatchlist={toggleWatchlist}
                  windowMode={windowMode}
                  tradeWindowOpen={tradeWindowOpen}
                  enableTrades={ENABLE_TRADES}
                  infoMode={infoMode}
                  metricValue={metricValue}
                  teamLabel={teamLabel}
                  isAddCoolingDown={isAddCoolingDown}
                  guardedAdd={guardedAdd}
                  openDropModal={openDropModal}
                  goToTradeProposal={goToTradeProposal}
                  openPlayer={(pl) => setModalPlayer(hydratePlayer(pl))}
                />)
              )}
            </div>
          </>
        )}

        {tab === "Pending Claims" && (
          <WaiverClaimsTab
            activeLeague={activeLeague}
            yourDraftTeamId={yourDraftTeamId}
            allPlayers={allPlayers}
            claimsWeek={claimsWeek}
            yourClaims={yourClaims}
            refreshTransactionsForLeague={refreshTransactionsForLeague}
          />
        )}
        {tab === "Transactions" && (
          <TransactionsTab
            activeLeague={activeLeague}
            yourDraftTeamId={yourDraftTeamId}
            allPlayers={allPlayers}
            nowMs={nowMs}
            weeksSorted={weeksSorted}
            normalizedFixtures={normalizedFixtures}
            liveWeek={liveWeek}
            liveWeekDeadlineMs={liveWeekDeadlineMs}
            selectionWeek={selectionWeek}
            waiverDeadlineMs={waiverDeadlineMs}
            tradeWindowOpen={tradeWindowOpen}
            txWeek={txWeek}
            setTxWeek={setTxWeek}
            waiverShieldTeamId={waiverShieldTeamId}
            waiverOrderRows={waiverOrderRows}
            waiverOrderLoaded={waiverOrderLoaded}
            waiverOrderIndexByTeamId={waiverOrderIndexByTeamId}
            tradesForUi={tradesForUi}
            claimsForUi={claimsForUi}
            freeForUi={freeForUi}
            setReviewTrade={setReviewTrade}
            apiCancelTrade={apiCancelTrade}
          />
        )}
      </div>

      {/* Menu */}
      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeague?.id ?? null}
        setActiveLeague={setActiveLeague}
        activeItem="Transactions"
      />

      {/* Player modal */}
{modalPlayer ? (
  (() => {
    const live = getLivePlayerById?.(modalPlayer.id);

    return (
      <PlayerCardModal
        onClose={() => setModalPlayer(null)}
        player={{
          ...modalPlayer,
          secondaryPosAbbrev: modalPlayer.secondaryPosAbbrev ?? undefined,
          secondaryPosName: modalPlayer.secondaryPosName ?? undefined,
          status: live?.status ?? modalPlayer.status ?? undefined,
          weeklyStatus: live?.weeklyStatus ?? modalPlayer.weeklyStatus ?? {},
        }}
        teamLabel={ownerTeamLabelForPlayerId(modalPlayer.id)}
        initialTab="Stats"
        actions={modalActions}
      />
    );
  })()
) : null}

            <DropSelectModal
              dropModalOpen={dropModalOpen}
              proposeMode={proposeMode}
              proposedAddPlayer={proposedAddPlayer}
              selectedDropPlayerId={selectedDropPlayerId}
              setSelectedDropPlayerId={setSelectedDropPlayerId}
              submittingProposedTransaction={submittingProposedTransaction}
              droppableCandidates={droppableCandidates}
              yourRosterPlayers={yourRosterPlayers}
              hasFreePlace={hasFreePlace}
              fullTeamName={fullTeamName}
              closeDropModal={closeDropModal}
              submitProposedTransaction={submitProposedTransaction}
            />
<ConfirmAcceptTradeModal
  confirmOpen={confirmOpen}
  confirmTrade={confirmTrade}
  allPlayers={allPlayers}
  closeConfirm={closeConfirm}
  confirmAcceptTrade={confirmAcceptTrade}
/>
{reviewTrade ? (
  <TradeReviewModal
    fromTeamName={(activeLeague?.teams ?? []).find((x: any) => x.id === reviewTrade.fromTeamId)?.name ?? "another team"}
    getPlayers={((reviewTrade.offerPlayerIds ?? []) as string[]).map((id) => allPlayers.find((x) => x.id === id) ?? ({ id, lastName: id } as any))}
    givePlayers={((reviewTrade.requestPlayerIds ?? []) as string[]).map((id) => allPlayers.find((x) => x.id === id) ?? ({ id, lastName: id } as any))}
    statRows={roundRows ?? []}
    canRespond={!!tradeWindowOpen}
    livePlayer={(id) => getLivePlayerById?.(id)}
    onClose={() => setReviewTrade(null)}
    onAccept={() => {
      const id = reviewTrade.id;
      setReviewTrade(null);
      if (tradeWindowOpen) apiAcceptTrade(id);
    }}
    onDecline={() => {
      const id = reviewTrade.id;
      setReviewTrade(null);
      apiDeclineTrade(id);
    }}
  />
) : null}

    </main>
  );
}
export default function Page() {
  useRequireSession();

  return (
    <Suspense fallback={<div style={{ minHeight: "100svh", width: "100%" }} />}>
      <TransactionsPageInner />
    </Suspense>
  );
}