"use client";

import { applyStatView, formatStatView, STAT_VIEW_LABEL, useStatView } from "@/lib/players/statView";
import { useStatSeasonRows } from "@/lib/players/useStatSeason";
import { COMPARE_STATS, seasonTotals, type SeasonTotals } from "@/lib/players/seasonTotals";
import type { StatKey } from "@/lib/scoring";
import { assignToSlots, isStandardSquad, SLOT_KINDS, squadSlots, STANDARD_SQUAD } from "@/lib/league/squad";
import { WatchEyeIcon } from "@/components/WatchEyeIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { leagueRefreshMs, usePoll } from "@/lib/hooks/usePoll";
import { useRouter } from "next/navigation";
import { getActiveUser } from "@/lib/session";
import { PlayerCardModal } from "@/components/PlayerCardModal";

import { TEAM_OPTIONS } from "@/lib/constants";
import { PoolFilterBar, matchesPoolFilters, EMPTY_FILTERS, type PoolFilters } from "@/components/PoolFilters";
import { useDraftStore } from "@/lib/draft/store";

import { usePlayerPool } from "@/lib/players/pool";
import { rosterSlots } from "@/lib/draft/constants";

import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import type { Player } from "@/lib/draft/types";

import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { usePlayersStore } from "@/lib/players/store";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useStableComponent } from "@/lib/hooks/useStableComponent";
import { positionsLabel } from "@/lib/players/positions";
import { StatusTag } from "@/components/StatusTag";
import { PlusMinusIcon } from "@/components/PlusMinusIcon";
import { DraftPlanStrip } from "@/components/draftPrep/DraftPlanStrip";
import { DraftStrategyPanel } from "@/components/draftPrep/DraftStrategyPanel";
import { useDraftStrategy } from "@/lib/draft/useStrategy";
import { isEmptyStrategy, myRanks, planForRound, planMatches } from "@/lib/draft/strategy";
import { roundForPick } from "@/lib/draft/rules";

type DraftTab = "Player Pool" | "Watchlist" | "Teams" | "Draft Results";
type DraftPhase = "preDraft" | "liveDraft" | "complete";

type Pick = {
  pickNumber: number;
  player: Player | null; // null for not yet drafted
  ownerInitials?: string; // prefilled if order set
  ownerTeamId?: string;
};

type Modal =
  | null
  | { type: "draftConfirm"; player: Player }
  | { type: "playerCard"; player: Player }
  | { type: "draftOrder" };

function useNowTick(ms = 250) {
  const [, force] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => force((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);

  return Date.now();
}


/** Draft room pool: what the number column shows (draft rank, or the season's points / a stat). */
const DRAFT_SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "DRAFT_RANK", label: "Draft Rank" },
  ...COMPARE_STATS.map((c) => ({ value: c.key, label: c.label })),
];

export default function DraftRoomPage() {
  useRequireSession();

  const router = useRouter();

  // -----------------------
  // DEV switches
  // -----------------------
  
const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s) => s.activeLeagueId); // ✅ source of truth
const leagueId = activeLeagueId ?? undefined;
const activeLeague = useMemo(() => {
  return leagues.find((l) => l.id === activeLeagueId) ?? null;
}, [leagues, activeLeagueId]);

// ✅ move draft-store selectors HERE (before phase)
const teams = useDraftStore((s) => s.teams);
const syncFromLeague = useDraftStore((s) => s.syncFromLeague);
const isDraftOrderSet = useDraftStore((s) => s.isDraftOrderSet);
const setDraftOrderSet = useDraftStore((s) => s.setDraftOrderSet);
const rosters = useDraftStore((s) => s.rosters);
const draftStoreHydrated = useDraftStore((s) => s.hasHydrated);

const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
const completeDraft = useLeagueStore((s) => s.completeDraft);

// (a finished draft used to fall back to "Draft Starts In"; Ethan, 25 Nov 2026)
const phase: DraftPhase =
  activeLeague?.draftStatus === "live" ? "liveDraft" : activeLeague?.draftStatus === "complete" ? "complete" : "preDraft";

const refreshLeague = useLeagueStore((s) => s.refreshLeague);

// League details: every few seconds around the draft (to see it go live), rarely otherwise.
usePoll(
  activeLeagueId ? () => refreshLeague(activeLeagueId) : null,
  () => leagueRefreshMs(useLeagueStore.getState().leagues.find((l) => l.id === activeLeagueId)),
  activeLeagueId,
);

  const [activeTab, setActiveTab] = useState<DraftTab>("Player Pool");
  const [menuOpen, setMenuOpen] = useState(false);
  const draftResultsScrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
const refreshFromServer = useDraftStore((s) => s.refreshFromServer);
const hydrateRostersFromDb = useDraftStore((s) => s.hydrateRostersFromDb);
  const livePlayers = usePlayersStore((s) => s.players);
  const livePlayersLoaded = usePlayersStore((s) => s.loaded);
  const refreshLivePlayers = usePlayersStore((s) => s.refresh);
  const getLivePlayerById = usePlayersStore((s) => s.getById);

  useEffect(() => {
    if (!livePlayersLoaded) refreshLivePlayers();
  }, [livePlayersLoaded, refreshLivePlayers]);

// Picks and the clock: every second while the draft is on, otherwise like the league details.
usePoll(
  activeLeagueId ? () => refreshFromServer(activeLeagueId) : null,
  () => {
    const l = useLeagueStore.getState().leagues.find((x) => x.id === activeLeagueId);
    return l?.draftStatus === "live" ? 1000 : leagueRefreshMs(l);
  },
  activeLeagueId,
);

useEffect(() => {
  const lid = activeLeagueId;
  if (!lid) return;
  hydrateRostersFromDb(lid);
}, [activeLeagueId, hydrateRostersFromDb]);

  // =========================
  // Jersey assets (Draft Room uses ANGLED if available)
  // Files live in: /public/images/jerseys
  // =========================
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

  function jerseySrcForTeamCode(
    teamCode: string | null | undefined,
    prefer: "angle" | "front" = "angle"
  ) {
    const code = normalizeTeamCode(teamCode);
    const j = JERSEYS[code];
    if (!j) return JERSEY_PLACEHOLDER;

    if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
    return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
  }

  // ✅ Sync draft teams from active league
  const leagueTeamsSig = useMemo(() => {
  const arr = activeLeague?.teams ?? [];
  return arr.map((t) => t.id).join("|");
}, [activeLeague?.teams]);

useEffect(() => {
  if (!draftStoreHydrated) return;
  if (!activeLeague) return;

  const leagueTeams = activeLeague?.teams ?? [];
  if (leagueTeams.length === 0) return; // ✅ optional but recommended

  const hasOrder =
    Array.isArray((activeLeague as any).draftOrder) &&
    (activeLeague as any).draftOrder.length > 0;

  if (isDraftOrderSet !== hasOrder) setDraftOrderSet(hasOrder);

  const draftTeams = leagueTeams.map((t) => ({
    id: t.id,
    name: t.name,
    initials: t.initials,
    userId: t.userId,
    userInitials: t.userInitials,
  }));

  syncFromLeague(draftTeams, hasOrder);
}, [
  draftStoreHydrated,
  activeLeague?.id,
  activeLeague?.teams,
  (activeLeague as any)?.draftOrder,
  syncFromLeague,
  isDraftOrderSet,
  setDraftOrderSet,
]);

  // ✅ hydration guard
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

const ready = mounted && draftStoreHydrated;
const rawUser = getActiveUser();
const activeUser = typeof rawUser === "string" ? { username: rawUser } : rawUser;

const yourTeamId =
  teams.find(
    (t) =>
      (t.userId ?? "").trim().toLowerCase() ===
      (activeUser?.username ?? "").trim().toLowerCase()
  )?.id ??
  teams[0]?.id ??
  "t-1";

  const userInitials = useMemo(() => {
    const fn = (activeUser?.firstName ?? "").trim();
    const ln = (activeUser?.lastName ?? "").trim();

    if (fn || ln) {
      return `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase();
    }

    const u = (activeUser?.username ?? "").trim();
    return (u.slice(0, 2) || "U").toUpperCase();
  }, [activeUser?.firstName, activeUser?.lastName, activeUser?.username]);

  // -----------------------
  // ✅ TIMING
  // -----------------------
  // The pick clock comes from the server (90s a pick, 10s after 3 missed picks in a row);
  // when it runs out the server makes the pick, so nothing here has to.
  const serverDeadlineMs = useDraftStore((s) => s.deadlineMs);
  const storeDraftComplete = useDraftStore((s) => s.draftComplete);
  const lastDraftError = useDraftStore((s) => s.lastError);
  const watchlistOrder = useDraftStore((s) => s.watchlistOrder);
  const moveWatchlist = useDraftStore((s) => s.moveWatchlist);

  useEffect(() => {
    if (lastDraftError) window.alert(lastDraftError);
  }, [lastDraftError]);

const preDraftDeadlineMs = useMemo(() => {
  const v = activeLeague?.draftAt ?? null; // number | null
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}, [activeLeague?.draftAt]);

  // -----------------------
  // Filters
  // -----------------------
  const [search, setSearch] = useState("");
  // C2: the same Filters pop-up as the Transactions page (Team / Position / Status, several of each)
  const [poolFilters, setPoolFilters] = useState<PoolFilters>(EMPTY_FILTERS);

  // Watchlist
  const watchlist = useDraftStore((s) => s.watchlist);
  const toggleWatchlist = useDraftStore((s) => s.toggleWatchlist);

  // Modal
  const [modal, setModal] = useState<Modal>(null);

  const totalPicks = useDraftStore((s) => s.totalPicks());
  const ownerForPickSnake = useDraftStore((s) => s.ownerForPickSnake);

  const pickIndex = useDraftStore((s) => s.pickIndex);
  const picks = useDraftStore((s) => s.picks);
  const latestPickText = useDraftStore((s) => s.latestPickText);

  const confirmDraft = useDraftStore((s) => s.confirmDraft);
  const ensurePicksLength = useDraftStore((s) => s.ensurePicksLength);
  const rehydratePlayersFromPool = useDraftStore((s) => s.rehydratePlayersFromPool);

  const canTeamDraftPlayer = useDraftStore((s) => s.canTeamDraftPlayer);
  const isDrafted = useDraftStore((s) => s.isDrafted);
  const getPlayerTeamName = useDraftStore((s) => s.getPlayerTeamName);
  const getPlayerPickNumber = useDraftStore((s) => s.getPlayerPickNumber);

  useEffect(() => {
    ensurePicksLength();
  }, [ensurePicksLength, teams.length]);

  const draftComplete =
    phase === "complete" || storeDraftComplete || (totalPicks > 0 && picks.length === totalPicks && picks[totalPicks - 1] !== null);

  const currentPick = Math.min(pickIndex, totalPicks);
  // (also when the teams / order arrive: it used to be worked out before the order had loaded
  // and stay blank, "On the Clock: TBC", until the first pick; found in the 25 Nov practice draft)
  const onTheClockTeamId = useMemo(() => {
    if (draftComplete) return "";
    const owner = ownerForPickSnake(pickIndex);
    return owner?.id ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickIndex, ownerForPickSnake, draftComplete, teams, totalPicks]);

  const isYouOnClock =
    phase === "liveDraft" && !draftComplete && onTheClockTeamId === yourTeamId;

  const nextPickInTurns = useMemo(() => {
    if (draftComplete) return 0;
    if (!yourTeamId) return 0;
    for (let i = pickIndex + 1; i <= totalPicks; i++) {
      const owner = ownerForPickSnake(i);
      if (owner?.id === yourTeamId) return i - pickIndex;
    }
    return 0;
  }, [pickIndex, totalPicks, yourTeamId, ownerForPickSnake, draftComplete]);

  // -----------------------
  // Players
  // -----------------------
  const playerPool = usePlayerPool();
  const allPlayers: Player[] = useMemo(() => {
    return (playerPool as unknown as Player[]).map((p) => ({
      ...p,
      teamCode: normalizeTeamCode(p.teamCode),
    }));
  }, [playerPool]);

const allPlayersById = useMemo(() => {
  const m: Record<string, Player> = {};
  for (const p of allPlayers) m[p.id] = p;
  return m;
}, [allPlayers]);

/**
 * Always return a FULL Player object from players.json when possible.
 * We only use "live player" to overlay status-ish fields.
 */
function resolvePlayer(x: any): Player | null {
  if (!x) return null;

  const id = typeof x === "string" ? x : String(x.id ?? "");
  if (!id) return null;

  const base = allPlayersById[id];
  if (!base) return null;

  const live: any = getLivePlayerById(id);

  // Return a proper Player shape (base is full), with live status overlays if present
  return {
    ...base,
    status: live?.status ?? base.status ?? null,
    weeklyStatus: live?.weeklyStatus ?? (base as any).weeklyStatus,
  } as Player;
}

  useEffect(() => {
    rehydratePlayersFromPool(allPlayers);
  }, [rehydratePlayersFromPool, allPlayers]);

  const draftedIds = useMemo(() => {
    return new Set(picks.filter(Boolean).map((p) => (p as Player).id));
  }, [picks]);

  // What the number column shows / sorts by (Filters): draft rank, or the chosen season's points
  // or a stat, per game / total / per 80 (lib/players/statView)
  const [sortMode, setSortMode] = useState<string>("DRAFT_RANK");
  // your draft strategy: plan for each round, targets, do-not-draft, rankings. Edited in the
  // Draft Strategy panel, which opens over this page (Ethan, 25 Nov 2026: no longer its own page).
  const strat = useDraftStrategy(activeLeagueId ?? null);
  const draftStrategyRaw = strat.strategy;
  // the panel adds "#strategy" to the address so the phone's back button / swipe closes it.
  // Coming from the Mock Draft page it opens straight away (/draft-room#strategy).
  const [strategyOpen, setStrategyOpen] = useState(false);
  const strategyPushed = useRef(false);
  useEffect(() => {
    if (window.location.hash === "#strategy") setStrategyOpen(true);
    const onPop = () => {
      const open = window.location.hash === "#strategy";
      if (!open) strategyPushed.current = false;
      setStrategyOpen(open);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const openStrategy = () => {
    window.history.pushState(null, "", `${window.location.pathname}${window.location.search}#strategy`);
    strategyPushed.current = true;
    setStrategyOpen(true);
  };
  const closeStrategy = () => {
    if (strategyPushed.current) {
      window.history.back(); // closes it (popstate above)
      return;
    }
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setStrategyOpen(false);
  };
  const draftStrategy = isEmptyStrategy(draftStrategyRaw) ? null : draftStrategyRaw;
  const avoidIds = useMemo(() => new Set(draftStrategy?.avoid ?? []), [draftStrategy]);
  const hasMyRanks = (draftStrategy?.ranking.length ?? 0) > 0;
  const myRankById = useMemo(() => myRanks(allPlayers, draftStrategy), [allPlayers, draftStrategy]);
  const sortOptions = useMemo(() => (hasMyRanks ? [DRAFT_SORT_OPTIONS[0], { value: "MY_RANK", label: "My Rank" }, ...DRAFT_SORT_OPTIONS.slice(1)] : DRAFT_SORT_OPTIONS), [hasMyRanks]);
  const rankMode = sortMode === "DRAFT_RANK" || sortMode === "MY_RANK";
  const [statView] = useStatView();
  const { rows: statRows, season: statSeasonShown } = useStatSeasonRows();
  const totalsById = useMemo(() => {
    const m = new Map<string, SeasonTotals>();
    if (sortMode === "DRAFT_RANK" || sortMode === "MY_RANK") return m;
    for (const p of allPlayers) m.set(p.id, seasonTotals(statRows, p));
    return m;
  }, [allPlayers, statRows, sortMode]);
  const metricOf = (p: Player): number | null => {
    if (sortMode === "DRAFT_RANK") return p.draftRank;
    if (sortMode === "MY_RANK") return myRankById.get(p.id) ?? null;
    const t = totalsById.get(p.id);
    if (!t) return null;
    const total = sortMode === "points" ? t.points : t.counts[sortMode as StatKey];
    return applyStatView(total, t.games, t.minutes, statView);
  };
  const metricText = (p: Player) => (rankMode ? String(metricOf(p) ?? "") : formatStatView(metricOf(p), statView));
  const sortLabel = sortOptions.find((o) => o.value === sortMode)?.label ?? "Draft Rank";

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const val = (p: Player) => metricOf(p) ?? -Infinity;
    return allPlayers
      .filter((p) => (draftedIds.has(p.id) ? false : true))
      .filter((p) => (q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true))
      .filter((p) => matchesPoolFilters(p as any, poolFilters, getLivePlayerById?.(p.id) as any))
      .sort((a, b) => (sortMode === "DRAFT_RANK" ? a.draftRank - b.draftRank : rankMode ? -val(b) + val(a) || a.draftRank - b.draftRank : val(b) - val(a) || a.draftRank - b.draftRank));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPlayers, draftedIds, search, poolFilters, getLivePlayerById, sortMode, totalsById, statView, myRankById]);

  // your next pick's round (for the plan) and your players so far (for the targets)
  const yourPlanRound = draftComplete ? 0 : roundForPick(teams.length || 1, phase === "liveDraft" ? pickIndex + nextPickInTurns : 1);
  const plan = planForRound(draftStrategy, yourPlanRound);
  const yourRoster = useMemo(
    () => picks.map((p, i) => (p && ownerForPickSnake(i + 1)?.id === yourTeamId ? (p as Player) : null)).filter((p): p is Player => !!p),
    [picks, ownerForPickSnake, yourTeamId]
  );

  const playerPoolPlayers = useMemo(() => {
    return filteredPlayers.filter((p) => canTeamDraftPlayer(yourTeamId, p, activeLeague?.squadFormat));
  }, [filteredPlayers, canTeamDraftPlayer, yourTeamId, activeLeague?.squadFormat]);

  // In the order you set (auto-pick takes the first that's still free and fits)
  const watchlistPlayers = useMemo(() => {
    const byId = new Map(filteredPlayers.map((p) => [p.id, p]));
    return watchlistOrder.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  }, [filteredPlayers, watchlistOrder]);

  function hydrateForModal(p: Player): Player {
  const live: any = getLivePlayerById(p.id);
  return {
    ...p,
    status: live?.status ?? p.status ?? null,
    weeklyStatus: live?.weeklyStatus ?? (p as any).weeklyStatus,
  } as Player;
}

  function openPlayerCard(p: Player) {
    setModal({ type: "playerCard", player: hydrateForModal(p) });
  }

  function onDraftClick(p: Player) {
    if (phase !== "liveDraft") return;
    if (draftComplete) return;
    if (!isYouOnClock) return;
    if (!canTeamDraftPlayer(onTheClockTeamId, p, activeLeague?.squadFormat)) return;

    setModal({ type: "draftConfirm", player: p });
  }

  // (Auto-picks happen on the server when the clock runs out.)

  const draftResults: Pick[] = useMemo(() => {
    return Array.from({ length: totalPicks }).map((_, idx) => {
      const pickNumber = idx + 1;
      const owner = ownerForPickSnake(pickNumber);
      const player = picks[idx] ?? null;

      const ownerTeamId = owner?.id;
      const ownerInitials = owner?.userInitials || owner?.initials || (owner?.name ?? "").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

      return { pickNumber, player, ownerInitials, ownerTeamId };
    });
  }, [totalPicks, picks, ownerForPickSnake, teams]);

// the draft order (round 1), for "First Pick" and its pop-up (Ethan, 25 Nov 2026)
const draftOrderTeams = useMemo(() => {
  const n = teams.length;
  const out: Array<{ id: string; name: string; ownerName: string | null }> = [];
  for (let i = 1; i <= n; i++) {
    const t = ownerForPickSnake(i);
    if (!t) continue;
    const lt = activeLeague?.teams?.find((x) => x.id === t.id) as { ownerName?: string | null } | undefined;
    out.push({ id: t.id, name: t.name, ownerName: lt?.ownerName ?? null });
  }
  return out;
}, [teams.length, ownerForPickSnake, activeLeague?.teams]);
const firstPickTeamName = draftOrderTeams[0]?.name ?? activeLeague?.teams?.[0]?.name ?? "TBC";
  // -----------------------
  // Styles
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

  const inputWrap: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "8px 10px",
    boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
  };

  const listBox: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    color: "#0f172a",
  };

  function JerseyTile__render({ teamCode, size = 34 }: { teamCode: string; size?: number }) {
    return (
      <img
        src={jerseySrcForTeamCode(teamCode, "angle")}
        alt=""
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          objectFit: "contain",
          display: "block",
        }}
        draggable={false}
      />
    );
  }
const JerseyTile = useStableComponent(JerseyTile__render);

  function DraftButton__render({
    enabled,
    onClick,
    label = "Draft",
  }: {
    enabled: boolean;
    onClick: () => void;
    label?: string;
  }) {
    return (
      <button
        disabled={!enabled}
        onClick={onClick}
        style={{
          height: 28,
          width: 64,
          borderRadius: 10,
          border: "none",
          background: enabled ? "#6366F1" : "rgba(0,0,0,0.25)",
          color: "white",
          fontWeight: 700,
          fontSize: 12,
          cursor: enabled ? "pointer" : "not-allowed",
          opacity: enabled ? 1 : 0.55,
        }}
      >
        {label}
      </button>
    );
  }
const DraftButton = useStableComponent(DraftButton__render);

  function StarButton__render({ active, onClick }: { active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
        style={{
          width: 32,
          height: 28,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.10)",
          background: active ? "rgba(250,204,21,0.25)" : "rgba(0,0,0,0.05)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          color: "#0f172a",
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        <WatchEyeIcon active={active} />
      </button>
    );
  }
const StarButton = useStableComponent(StarButton__render);

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
          fontSize: 36,
          fontWeight: 700,
          lineHeight: "36px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }
const Hamburger = useStableComponent(Hamburger__render);

  function TimeBlock__render({ value, label }: { value: string; label: string }) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: "30px" }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>{label}</div>
      </div>
    );
  }
const TimeBlock = useStableComponent(TimeBlock__render);

  function PreDraftHeader__render() {
  const now = useNowTick(250);
  
const deadline = preDraftDeadlineMs; // number | null
const preDraftSeconds =
  mounted && deadline
    ? Math.max(0, Math.floor((deadline - now) / 1000))
    : 0;

const isTbd = !deadline;

    const d = Math.floor(preDraftSeconds / 86400);
    const h = Math.floor((preDraftSeconds % 86400) / 3600);
    const m = Math.floor((preDraftSeconds % 3600) / 60);
    const s = preDraftSeconds % 60;

    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
        </div>

        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>Draft Starts In</div>

        <div style={{ marginTop: 10 }}>
          {isTbd ? (
  <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.95 }}>
    Draft time not set yet.
  </div>
) : (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
    <TimeBlock value={pad2(d)} label="Days" />
    <TimeBlock value={pad2(h)} label="Hours" />
    <TimeBlock value={pad2(m)} label="Minutes" />
    <TimeBlock value={pad2(s)} label="Seconds" />
  </div>
)}
        </div>

        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, opacity: 0.95 }}>
          First Pick:{" "}
          {draftOrderTeams.length ? (
            <button
              onClick={() => setModal({ type: "draftOrder" })}
              style={{ border: "none", background: "transparent", padding: 0, font: "inherit", fontWeight: 600, color: "#0d9488", textDecoration: "underline", cursor: "pointer" }}
            >
              {firstPickTeamName}
            </button>
          ) : (
            <span style={{ fontWeight: 600 }}>{firstPickTeamName || "TBC"}</span>
          )}
        </div>
      </div>
    );
  }
const PreDraftHeader = useStableComponent(PreDraftHeader__render);

  // after the draft (Ethan, 25 Nov 2026: it used to go back to "Draft Starts In")
  function CompleteHeader__render() {
    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
        </div>
        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>Draft Complete</div>
        {/* the last pick, as it shows during the draft (Ethan, 25 Nov 2026) */}
        <div style={{ marginTop: 10, background: "#FACC15", color: "#0f172a", borderRadius: 999, padding: "7px 12px", fontSize: 11, fontWeight: 500, boxShadow: "0 10px 18px rgba(0,0,0,0.16)", textAlign: "center" }}>
          {latestPickText}
        </div>
      </div>
    );
  }
const CompleteHeader = useStableComponent(CompleteHeader__render);

  function LiveHeader__render() {
  const now = useNowTick(250);
  
    const deadline = serverDeadlineMs ?? 0;

    const secondsLeft = mounted ? Math.max(0, Math.floor((deadline - now) / 1000)) : 0;

    // (it used to be white on the white card, so it only showed once it turned red; Ethan, 25 Nov 2026)
    const isLow = secondsLeft <= 20;
    const timeColor = !draftComplete && isLow ? "#EF4444" : "inherit";

    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
          <div style={{ flex: 1 }} />
        </div>

        <div style={{ marginTop: 2, display: "grid", gridTemplateColumns: "1fr 1fr", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, opacity: 0.95 }}>🕒</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: timeColor }}>
              {draftComplete ? "Draft Complete" : formatMMSS(secondsLeft)}
            </div>
          </div>

          <div style={{ textAlign: "right", fontSize: 18, fontWeight: 700 }}>
            Pick {currentPick} of {totalPicks}
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            background: "#FACC15",
            color: "#0f172a",
            borderRadius: 999,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 500,
            boxShadow: "0 10px 18px rgba(0,0,0,0.16)",
            textAlign: "center",
          }}
        >
          {latestPickText}
        </div>

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.95 }}>Your Next Pick in:</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isYouOnClock ? "#0d9488" : undefined }}>
              {draftComplete ? "—" : isYouOnClock ? "On the clock" : nextPickInTurns ? `${nextPickInTurns} ${nextPickInTurns === 1 ? "turn" : "turns"}` : "No picks left"}
            </div>
          </div>

          <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.95 }}>On the Clock:</div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>
              {draftComplete ? "—" : teams.find((t) => t.id === onTheClockTeamId)?.name ?? "TBC"}
            </div>
          </div>
        </div>
      </div>
    );
  }
const LiveHeader = useStableComponent(LiveHeader__render);

  function Tabs__render() {
    const tabs: DraftTab[] = ["Player Pool", "Watchlist", "Teams", "Draft Results"];
    return (
      <div style={tabBarStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} style={tabBtn(t === activeTab)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }
const Tabs = useStableComponent(Tabs__render);

  function Filters__render() {
    return (
      <PoolFilterBar
        search={search}
        setSearch={setSearch}
        filters={poolFilters}
        setFilters={setPoolFilters}
        sort={sortMode}
        setSort={setSortMode}
        sortOptions={sortOptions}
        statOptions
      />
    );
  }
const Filters = useStableComponent(Filters__render);

  function PlayerRow__render({ p, draftEnabled, reorder }: { p: Player; draftEnabled: boolean; reorder?: { index: number; count: number } }) {
    const isStar = !!watchlist[p.id];
    const isAvoid = avoidIds.has(p.id);
    const isPlan = !isAvoid && !!plan && planMatches(p, plan);
    const arrow: React.CSSProperties = { border: "none", background: "transparent", fontSize: 12, fontWeight: 700, padding: "0 2px", cursor: "pointer", lineHeight: "12px" };

    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 160px",
          gap: 10,
          alignItems: "center",
          padding: "10px 10px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          borderLeft: isPlan ? "3px solid #0d9488" : "3px solid transparent",
        }}
      >
        <div onClick={() => openPlayerCard(p)} style={{ cursor: "pointer", userSelect: "none", opacity: isAvoid ? 0.5 : 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {reorder ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18 }} onClick={(e) => e.stopPropagation()}>
                <button aria-label="Move up" style={{ ...arrow, opacity: reorder.index === 0 ? 0.25 : 1 }} onClick={() => moveWatchlist(p.id, -1)}>▲</button>
                <div style={{ fontSize: 10, fontWeight: 700 }}>{reorder.index + 1}</div>
                <button aria-label="Move down" style={{ ...arrow, opacity: reorder.index === reorder.count - 1 ? 0.25 : 1 }} onClick={() => moveWatchlist(p.id, 1)}>▼</button>
              </div>
            ) : null}
            <JerseyTile teamCode={p.teamCode} size={32} />

            <div>
              <div style={{ fontWeight: 500, fontSize: 12 }}>
                {p.firstName[0]}. {p.lastName} <StatusTag player={p} />
                {isPlan ? <span style={{ marginLeft: 4, padding: "0 5px", borderRadius: 999, background: "rgba(13,148,136,0.14)", color: "#0d9488", fontSize: 9, fontWeight: 700 }}>Plan</span> : null}
                {isAvoid ? <span style={{ marginLeft: 4, padding: "0 5px", borderRadius: 999, background: "rgba(239,68,68,0.14)", color: "#dc2626", fontSize: 9, fontWeight: 700 }}>Avoid</span> : null}
              </div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
                {TEAM_OPTIONS.find((t) => t.value === p.teamCode)?.label ?? p.teamCode}
                {" — "}
                {positionsLabel(p)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, width: 40, textAlign: "center" }}>{metricText(p)}</div>
          {/* the draft watchlist is fixed once the draft is over (it moves to the Transactions watchlist) */}
          {draftComplete ? <div style={{ width: 32 }} /> : <StarButton active={isStar} onClick={() => toggleWatchlist(p.id)} />}
          <DraftButton enabled={draftEnabled} onClick={() => onDraftClick(p)} />
        </div>
      </div>
    );
  }
const PlayerRow = useStableComponent(PlayerRow__render);

  function PlayerPoolTab__render() {
    const draftEnabledFor = (p: Player) =>
      phase === "liveDraft" && isYouOnClock && canTeamDraftPlayer(yourTeamId, p, activeLeague?.squadFormat) && !draftComplete;

    return (
      <>
        {!draftComplete ? <DraftPlanStrip strategy={draftStrategy} round={yourPlanRound} roster={yourRoster} leagueId={activeLeagueId ?? null} hideMockDraft={phase === "liveDraft"} onEditStrategy={openStrategy} /> : null}
        <Filters />
        <div style={listBox}>
          {/* the column's name, right above the numbers (same layout as the rows) */}
          <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, alignItems: "center", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
            <div>{rankMode ? "" : `${STAT_VIEW_LABEL[statView]} · ${statSeasonShown}`}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <div style={{ width: 40, display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{sortLabel}</div>
              <div style={{ width: 32 }} />
              <div style={{ width: 64 }} />
            </div>
          </div>

          {playerPoolPlayers.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>
              No eligible players available for your remaining roster slots.
            </div>
          ) : (
            playerPoolPlayers.map((p) => <PlayerRow key={p.id} p={p} draftEnabled={draftEnabledFor(p)} />)
          )}
        </div>
      </>
    );
  }
const PlayerPoolTab = useStableComponent(PlayerPoolTab__render);

  function WatchlistTab__render() {
    const draftEnabledFor = (p: Player) =>
      phase === "liveDraft" && isYouOnClock && canTeamDraftPlayer(yourTeamId, p, activeLeague?.squadFormat) && !draftComplete;

    return (
      <>
        <Filters />
        <div style={listBox}>
          {/* the column's name, right above the numbers (same layout as the rows) */}
          <div style={{ padding: "8px 10px 4px", display: "grid", gridTemplateColumns: "1fr 160px", gap: 10, alignItems: "center", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
            <div>{rankMode ? "" : `${STAT_VIEW_LABEL[statView]} · ${statSeasonShown}`}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <div style={{ width: 40, display: "flex", justifyContent: "center", whiteSpace: "nowrap", fontWeight: 600 }}>{sortLabel}</div>
              <div style={{ width: 32 }} />
              <div style={{ width: 64 }} />
            </div>
          </div>

          {watchlistPlayers.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, fontWeight: 500, opacity: 0.7 }}>
              No players in your watchlist yet.
            </div>
          ) : (
            watchlistPlayers.map((p, i) => (
              <PlayerRow key={p.id} p={p} draftEnabled={draftEnabledFor(p)} reorder={draftComplete ? undefined : { index: i, count: watchlistPlayers.length }} />
            ))
          )}
        </div>
      </>
    );
  }
const WatchlistTab = useStableComponent(WatchlistTab__render);

  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
useEffect(() => {
  // if nothing selected yet, or selected team no longer exists, pick the first team
  if (!teams.length) return;
  // your own team until you pick another (Ethan, 25 Nov 2026)
  if (!selectedTeamId || !teams.some((t) => t.id === selectedTeamId)) {
    setSelectedTeamId(teams.some((t) => t.id === yourTeamId) ? yourTeamId : teams[0].id);
  }
}, [teams, selectedTeamId, yourTeamId]);

  function TeamsTab__render() {
    const roster = rosters[selectedTeamId] ?? null;
    // the roster's groups: each kind of starting spot (Props, Hookers, ...), then the wildcards
    // (a custom squad, lib/league/squad.ts: its own kinds, then the bench)
    const squad = activeLeague?.squadFormat ?? STANDARD_SQUAD;
    type Group = { key: string; label: string; emptyLabel: string; entries: unknown[] };
    const groups: Group[] = [];
    // Players sit with their position even when they fill a wildcard / bench spot (a 2nd hooker
    // goes straight under the 1st, with one fewer empty wildcard), in the order they were
    // drafted (Ethan, 25 Nov 2026).
    const byPick = (a: unknown, b: unknown) => {
      const id = (x: unknown) => String((x as { id?: string } | null)?.id ?? x ?? "");
      return (getPlayerPickNumber(id(a)) ?? 9999) - (getPlayerPickNumber(id(b)) ?? 9999);
    };
    const mainPos = (x: unknown) => String(resolvePlayer(x as never)?.posAbbrev ?? "").toUpperCase();
    // The team's players: from the picks (the saved roster after the draft is only a list of ids,
    // which showed an empty team; found 25 Nov 2026), else whatever the roster has.
    const fromPicks = draftResults.filter((r) => r.ownerTeamId === selectedTeamId && r.player).map((r) => r.player as unknown);
    const fromRoster = roster
      ? [
          ...Object.values((roster.slots ?? {}) as Record<string, unknown[]>).flat(),
          ...((roster.wildcards ?? []) as unknown[]),
          ...(((roster as { playerIds?: string[] }).playerIds ?? []) as unknown[]),
        ]
      : [];
    const seen = new Set<string>();
    const all = (fromPicks.length ? fromPicks : fromRoster)
      .map((raw) => resolvePlayer(raw as never))
      .filter((x): x is NonNullable<ReturnType<typeof resolvePlayer>> => !!x && !seen.has(x.id) && !!seen.add(x.id))
      .sort(byPick);
    const placed = assignToSlots(all, squad);
    const { starters, bench } = squadSlots(squad);
    const standard = isStandardSquad(squad);
    const benchPlayers = bench.map((id) => placed.get(id) ?? null).filter(Boolean) as unknown[];
    for (const k of SLOT_KINDS) {
      const ids = starters.filter((x) => x.kind === k.kind).map((x) => x.id);
      if (!ids.length) continue;
      const filled = ids.map((id) => placed.get(id) ?? null).filter(Boolean) as unknown[];
      // wildcard / bench players whose main position goes in this group
      for (let i = benchPlayers.length - 1; i >= 0; i--) {
        if (k.positions.includes(mainPos(benchPlayers[i]))) filled.push(...benchPlayers.splice(i, 1));
      }
      filled.sort(byPick);
      const empty = ids.filter((id) => !placed.get(id)).length;
      const std = standard ? rosterSlots.find((r) => r.posAbbrev === k.kind) : undefined;
      groups.push({ key: k.kind, label: std?.label ?? k.label, emptyLabel: std ? std.label.slice(0, -1) : k.label, entries: [...filled, ...Array(empty).fill(null)] });
    }
    if (bench.length) {
      benchPlayers.sort(byPick);
      const emptyBench = bench.filter((id) => !placed.get(id)).length;
      const entries = [...benchPlayers, ...Array(emptyBench).fill(null)];
      if (entries.length) groups.push({ key: "bench", label: standard ? "Wildcards" : "Bench", emptyLabel: standard ? "Wildcard" : "Bench", entries });
    }

    if (!roster && !all.length) {
    return (
      <div style={{ ...listBox, marginTop: 10, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
          Loading rosters…
        </div>
      </div>
    );
  }
    return (
      <>
        <div style={{ marginTop: 10 }}>
          <div style={inputWrap}>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 500,
                color: "#0f172a",
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "8px 10px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px" }}>
              <div />
              <div style={{ textAlign: "right" }}>Pick</div>
            </div>
          </div>

          {groups.map((slot) => (
            <div key={slot.key} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, opacity: 0.75 }}>
                {slot.label}
              </div>

              {slot.entries.map((rawEntry, i) => {
const entry = resolvePlayer(rawEntry as never);

                return (
                  <div
                    key={`${slot.key}-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 70px",
                      alignItems: "center",
                      padding: "10px 10px",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {entry ? (
                      <div onClick={() => openPlayerCard(entry)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <JerseyTile teamCode={entry.teamCode} size={32} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>
                            {(entry.firstName?.[0] ?? "?")}. {entry.lastName ?? ""}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>
                            {TEAM_OPTIONS.find((t) => t.value === entry.teamCode)?.label ?? entry.teamCode}
                            {" — "}
                            {positionsLabel(entry)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.55 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            border: "1px solid rgba(0,0,0,0.10)",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 500,
                            fontSize: 22,
                            color: "rgba(15,23,42,0.55)",
                          }}
                        >
                          <PlusMinusIcon kind="plus" size={16} strokeWidth={2} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>
                          {slot.emptyLabel}
                        </div>
                      </div>
                    )}

                    <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
                      {entry ? (getPlayerPickNumber(entry.id) ?? "") : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </>
    );
  }
const TeamsTab = useStableComponent(TeamsTab__render);

  function DraftResultsTab__render() {
    return (
      <div
        ref={draftResultsScrollRef}
        onScroll={() => {
          const el = draftResultsScrollRef.current;
          if (!el) return;

          const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          shouldAutoScrollRef.current = distanceFromBottom < 80;
        }}
        style={{
          ...listBox,
          marginTop: 10,
          maxHeight: "70vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ padding: "8px 17px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
          <div style={{ display: "grid", gridTemplateColumns: "54px 1fr 60px" }}>
            <div>Pick</div>
            <div />
            <div style={{ textAlign: "right" }}>Owner</div>
          </div>
        </div>

        {draftResults.map((r, idx) => {
          const hasPlayer = !!r.player;

          return (
            <div
              key={r.pickNumber}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 60px",
                gap: 10,
                alignItems: "center",
                padding: "10px 10px",
                borderTop: idx === 0 ? "1px solid rgba(0,0,0,0.08)" : undefined,
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                opacity: hasPlayer ? 1 : 0.85,
              }}
            >
              <div style={{ padding: "0px 4px", fontSize: 12, fontWeight: 700 }}>{r.pickNumber}</div>

              {r.player ? (
                (() => {
                  const player = r.player;
                  const teamLabel = TEAM_OPTIONS.find((t) => t.value === player.teamCode)?.label ?? player.teamCode;

                  return (
                    <button
                      onClick={() => openPlayerCard(player)}
                      style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <JerseyTile teamCode={player.teamCode} size={32} />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>
                            {player.firstName[0]}. {player.lastName}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>
                            {teamLabel} {" — "} {positionsLabel(player)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })()
              ) : (
                <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.55 }}>—</div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {r.ownerInitials ? (
                  <span
                    style={{
                      minWidth: 40,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 10,
                      background: "#6366F1",
                      color: "white",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {r.ownerInitials}
                  </span>
                ) : (
                  <span style={{ opacity: 0.4, fontWeight: 700 }}> </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
const DraftResultsTab = useStableComponent(DraftResultsTab__render);

  function DraftConfirmModal__render({ player }: { player: Player }) {
    return (
      <ModalOverlay onClose={() => setModal(null)}>
        <div
          style={{
            borderRadius: 12,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            padding: 12,
            color: "#0f172a",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Draft the following player?</div>

          <div
            style={{
              borderRadius: 10,
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              display: "grid",
              gridTemplateColumns: "1fr 70px",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <JerseyTile teamCode={player.teamCode} size={40} />

              <div>
                <div style={{ fontWeight: 500, fontSize: 12 }}>
                  {player.firstName[0]}. {player.lastName}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {player.teamCode} — {positionsLabel(player)}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.65 }}>Draft Rank</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{player.draftRank}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => setModal(null)}
              style={{
                height: 34,
                borderRadius: 10,
                border: "none",
                background: "#EF4444",
                color: "white",
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setModal(null);
                if (!leagueId) return;
confirmDraft(player, leagueId, (lid) => completeDraft?.(lid));
              }}
              style={{
                height: 34,
                borderRadius: 10,
                border: "none",
                background: "#10B981",
                color: "white",
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </ModalOverlay>
    );
  }
const DraftConfirmModal = useStableComponent(DraftConfirmModal__render);

  function ModalOverlay__render({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "92%", maxWidth: 520 }}>
          {children}
        </div>
      </div>
    );
  }
const ModalOverlay = useStableComponent(ModalOverlay__render);

  if (!ready) {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", color: "white" }}>
      Loading…
    </main>
  );
}

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
        
        {phase === "preDraft" ? <PreDraftHeader /> : draftComplete ? <CompleteHeader /> : <LiveHeader />}

        <Tabs />

        {activeTab === "Player Pool" && <PlayerPoolTab />}
        {activeTab === "Watchlist" && <WatchlistTab />}
        {activeTab === "Teams" && <TeamsTab />}
        {activeTab === "Draft Results" && <DraftResultsTab />}
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeagueId ?? null}
        setActiveLeague={setActiveLeague}
        activeItem="Draft Room"
      />

      {strategyOpen && activeLeague ? (
        <DraftStrategyPanel
          leagueName={activeLeague.name}
          format={activeLeague.squadFormat}
          strat={strat}
          onClose={closeStrategy}
          onMockDraft={phase === "preDraft" ? () => router.push(`/mock-draft?leagueId=${encodeURIComponent(activeLeague.id)}`) : undefined}
        />
      ) : null}

      {modal?.type === "draftConfirm" && <DraftConfirmModal player={modal.player} />}

      {modal?.type === "draftOrder" && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div style={{ borderRadius: 14, background: "#ffffff", color: "#0f172a", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", padding: 14, maxHeight: "80svh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Draft Order</div>
              <button onClick={() => setModal(null)} style={{ border: "none", background: "transparent", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline", color: "#0f172a" }}>
                Close
              </button>
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
              Round 1. The order snakes: the last team picks first in round 2, and so on.
              {phase === "preDraft" ? " It's shuffled again when a team joins, until the commissioner sets it." : ""}
            </div>
            <div style={{ marginTop: 10, display: "grid" }}>
              {draftOrderTeams.map((t, i) => (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: t.id === yourTeamId ? 700 : 600 }}>
                      {t.name}
                      {t.id === yourTeamId ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#0d9488" }}>You</span> : null}
                    </div>
                    {t.ownerName ? <div style={{ fontSize: 11, opacity: 0.65 }}>{t.ownerName}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}

      {modal?.type === "playerCard" && (
        <PlayerCardModal
          onClose={() => setModal(null)}
          player={{
            ...modal.player,
            status: (getLivePlayerById(modal.player.id)?.status ?? modal.player.status ?? null) as any,
            weeklyStatus: getLivePlayerById(modal.player.id)?.weeklyStatus ?? (modal.player as any).weeklyStatus,
          }}
          stats={modal.player.stats ?? {}}
          teamLabel={getPlayerTeamName(modal.player.id) ?? "Available"}
          initialTab="Stats"
          actions={
            isDrafted(modal.player.id) || draftComplete
              ? []
              : phase === "preDraft"
              ? [{ label: !!watchlist[modal.player.id] ? "Remove Watchlist" : "Add Watchlist", onClick: () => toggleWatchlist(modal.player.id), variant: "primary" }]
              : [
                  { label: !!watchlist[modal.player.id] ? "Remove from Watchlist" : "Add to Watchlist", onClick: () => toggleWatchlist(modal.player.id), variant: "secondary" },
                  { label: "Draft", onClick: () => onDraftClick(modal.player), variant: "primary" },
                ]
          }
        />
      )}
    </main>
  );
}

// helpers
function pad2(n: number) {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s;
}

function formatMMSS(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
}

