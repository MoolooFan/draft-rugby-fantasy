"use client";
// app/draft-room/page.tsx
// The Draft Room: the countdown / pick clock, then Player Pool, Watchlist, Teams and Draft
// Results, plus the Draft Strategy panel over the top. This file loads the data and joins the
// pieces up; the pieces themselves are in components/draftRoom (split up 26 Nov 2026).
// On a computer (Ethan, 27 Nov 2026): every pick in a row of boxes under the header (scroll
// back / ahead), then three columns: the Player Pool, your Draft Strategy (always open and
// editable during the draft; your Watchlist instead if you haven't set a strategy), and a team.
// Before the draft: "Draft Order Lottery at X. Watch the lottery" in the header while one is
// waiting (it's set in League Settings), and the lottery itself full screen, opening on its own
// for everyone here shortly before it runs (Ethan, 28 Nov 2026). /draft-room#lottery opens it.

import { useIsClient } from "@/lib/hooks/useIsClient";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { leagueRefreshMs, usePoll } from "@/lib/hooks/usePoll";
import { getActiveUser } from "@/lib/session";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { PoolFilterBar } from "@/components/PoolFilters";
import { AppMenu } from "@/components/AppMenu";
import { useDraftStore } from "@/lib/draft/store";
import { useLeagueStore } from "@/lib/league/store";
import { usePlayerPool } from "@/lib/players/pool";
import { usePlayersStore } from "@/lib/players/store";
import type { Player } from "@/lib/draft/types";
import { STANDARD_SQUAD } from "@/lib/league/squad";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { DraftPlanStrip } from "@/components/draftPrep/DraftPlanStrip";
import { DraftStrategyPanel } from "@/components/draftPrep/DraftStrategyPanel";
import { useDraftStrategy } from "@/lib/draft/useStrategy";
import { isEmptyStrategy, targetGroups } from "@/lib/draft/strategy";
import { CompleteHeader, LiveHeader, PreDraftHeader } from "@/components/draftRoom/Headers";
import { PoolList } from "@/components/draftRoom/PoolList";
import { TeamsTab } from "@/components/draftRoom/TeamsTab";
import { DraftResultsTab, type DraftPickRow } from "@/components/draftRoom/DraftResultsTab";
import { DraftConfirmModal, DraftOrderModal } from "@/components/draftRoom/Modals";
import { PickStrip } from "@/components/draftRoom/PickStrip";
import { usePoolView, useStrategyPanel } from "@/components/draftRoom/hooks";
import { useIsDesktop } from "@/lib/ui/useIsDesktop";
import { useNow } from "@/lib/hooks/useNow";
import { LOTTERY_LIVE_MS, useLottery } from "@/lib/draft/lottery/useLottery";
import { lastRun, lotteryWhen, waitingRun } from "@/lib/draft/lottery/view";
import { LotteryRuns } from "@/components/draftRoom/LotteryRuns";
import { LotteryStage } from "@/components/draftRoom/LotteryStage";

const TABS = ["Player Pool", "Watchlist", "Teams", "Draft Results"] as const;
type DraftTab = (typeof TABS)[number];
type DraftPhase = "preDraft" | "liveDraft" | "complete";
type Modal = null | { type: "draftConfirm"; player: Player } | { type: "playerCard"; player: Player } | { type: "draftOrder" };

export default function DraftRoomPage() {
  useRequireSession();
  const router = useRouter();
  // computers get three columns (below)
  const isDesktop = useIsDesktop();

  // -------- league --------
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const activeLeague = useMemo(() => leagues.find((l) => l.id === activeLeagueId) ?? null, [leagues, activeLeagueId]);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const completeDraft = useLeagueStore((s) => s.completeDraft);
  const refreshLeague = useLeagueStore((s) => s.refreshLeague);

  // (a finished draft used to fall back to "Draft Starts In"; Ethan, 25 Nov 2026)
  const phase: DraftPhase = activeLeague?.draftStatus === "live" ? "liveDraft" : activeLeague?.draftStatus === "complete" ? "complete" : "preDraft";

  // League details: every few seconds around the draft (to see it go live), rarely otherwise.
  usePoll(
    activeLeagueId ? () => refreshLeague(activeLeagueId) : null,
    () => leagueRefreshMs(useLeagueStore.getState().leagues.find((l) => l.id === activeLeagueId)),
    activeLeagueId
  );

  // -------- the draft (lib/draft/store.ts) --------
  const teams = useDraftStore((s) => s.teams);
  const syncFromLeague = useDraftStore((s) => s.syncFromLeague);
  const isDraftOrderSet = useDraftStore((s) => s.isDraftOrderSet);
  const setDraftOrderSet = useDraftStore((s) => s.setDraftOrderSet);
  const rosters = useDraftStore((s) => s.rosters);
  const draftStoreHydrated = useDraftStore((s) => s.hasHydrated);
  const refreshFromServer = useDraftStore((s) => s.refreshFromServer);
  const hydrateRostersFromDb = useDraftStore((s) => s.hydrateRostersFromDb);
  // The pick clock comes from the server (90s a pick, 10s after 3 missed picks in a row);
  // when it runs out the server makes the pick, so nothing here has to.
  const serverDeadlineMs = useDraftStore((s) => s.deadlineMs);
  const storeDraftComplete = useDraftStore((s) => s.draftComplete);
  const lastDraftError = useDraftStore((s) => s.lastError);
  const watchlist = useDraftStore((s) => s.watchlist);
  const watchlistOrder = useDraftStore((s) => s.watchlistOrder);
  const toggleWatchlist = useDraftStore((s) => s.toggleWatchlist);
  const moveWatchlist = useDraftStore((s) => s.moveWatchlist);
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

  // Picks and the clock: every second while the draft is on, otherwise like the league details.
  usePoll(
    activeLeagueId ? () => refreshFromServer(activeLeagueId) : null,
    () => {
      const l = useLeagueStore.getState().leagues.find((x) => x.id === activeLeagueId);
      return l?.draftStatus === "live" ? 1000 : leagueRefreshMs(l);
    },
    activeLeagueId
  );

  useEffect(() => {
    if (activeLeagueId) hydrateRostersFromDb(activeLeagueId);
  }, [activeLeagueId, hydrateRostersFromDb]);

  useEffect(() => {
    if (lastDraftError) window.alert(lastDraftError);
  }, [lastDraftError]);

  // the draft's teams come from the league
  const draftOrder = (activeLeague as { draftOrder?: unknown } | null)?.draftOrder;
  useEffect(() => {
    if (!draftStoreHydrated || !activeLeague) return;
    const leagueTeams = activeLeague.teams ?? [];
    if (leagueTeams.length === 0) return;
    const hasOrder = Array.isArray(draftOrder) && draftOrder.length > 0;
    if (isDraftOrderSet !== hasOrder) setDraftOrderSet(hasOrder);
    syncFromLeague(
      leagueTeams.map((t) => ({ id: t.id, name: t.name, initials: t.initials, userId: t.userId, userInitials: t.userInitials })),
      hasOrder
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStoreHydrated, activeLeague?.id, activeLeague?.teams, draftOrder, syncFromLeague, isDraftOrderSet, setDraftOrderSet]);

  useEffect(() => {
    ensurePicksLength();
  }, [ensurePicksLength, teams.length]);

  // hydration guard
  const mounted = useIsClient();
  const ready = mounted && draftStoreHydrated;

  const rawUser = getActiveUser();
  const username = (typeof rawUser === "string" ? rawUser : rawUser?.username) ?? "";
  const yourTeamId = teams.find((t) => (t.userId ?? "").trim().toLowerCase() === username.trim().toLowerCase())?.id ?? teams[0]?.id ?? "t-1";

  // -------- whose pick --------
  const draftComplete = phase === "complete" || storeDraftComplete || (totalPicks > 0 && picks.length === totalPicks && picks[totalPicks - 1] !== null);
  const currentPick = Math.min(pickIndex, totalPicks);
  // (also when the teams / order arrive: it used to be worked out before the order had loaded
  // and stay blank, "On the Clock: TBC", until the first pick; found in the 25 Nov practice draft)
  const onTheClockTeamId = useMemo(() => {
    if (draftComplete) return "";
    return ownerForPickSnake(pickIndex)?.id ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickIndex, ownerForPickSnake, draftComplete, teams, totalPicks]);
  const youOnClock = phase === "liveDraft" && !draftComplete && onTheClockTeamId === yourTeamId;
  const nextPickInTurns = useMemo(() => {
    if (draftComplete || !yourTeamId) return 0;
    for (let i = pickIndex + 1; i <= totalPicks; i++) {
      if (ownerForPickSnake(i)?.id === yourTeamId) return i - pickIndex;
    }
    return 0;
  }, [pickIndex, totalPicks, yourTeamId, ownerForPickSnake, draftComplete]);

  // -------- players --------
  const livePlayersLoaded = usePlayersStore((s) => s.loaded);
  const refreshLivePlayers = usePlayersStore((s) => s.refresh);
  const getLivePlayerById = usePlayersStore((s) => s.getById);
  useEffect(() => {
    if (!livePlayersLoaded) refreshLivePlayers();
  }, [livePlayersLoaded, refreshLivePlayers]);

  const playerPool = usePlayerPool();
  const allPlayers: Player[] = useMemo(() => (playerPool as unknown as Player[]).map((p) => ({ ...p, teamCode: normalizeTeamCode(p.teamCode) })), [playerPool]);
  const allPlayersById = useMemo(() => new Map(allPlayers.map((p) => [p.id, p])), [allPlayers]);
  useEffect(() => {
    rehydratePlayersFromPool(allPlayers);
  }, [rehydratePlayersFromPool, allPlayers]);

  /** The full player from the pool (by id or a saved player), with his latest status. */
  const withLiveStatus = (p: Player): Player => {
    const live = getLivePlayerById(p.id) as { status?: Player["status"]; weeklyStatus?: unknown } | undefined;
    return { ...p, status: live?.status ?? p.status ?? null, weeklyStatus: live?.weeklyStatus ?? (p as { weeklyStatus?: unknown }).weeklyStatus } as Player;
  };
  const resolvePlayer = (x: unknown): Player | null => {
    const id = typeof x === "string" ? x : String((x as { id?: string } | null)?.id ?? "");
    const base = id ? allPlayersById.get(id) : undefined;
    return base ? withLiveStatus(base) : null;
  };

  const draftedIds = useMemo(() => new Set(picks.filter(Boolean).map((p) => (p as Player).id)), [picks]);

  // -------- draft strategy --------
  // overall rankings, targets, positional rankings. Edited in the Draft Strategy panel, which
  // opens over this page (Ethan, 25 Nov 2026: no longer its own page).
  const strat = useDraftStrategy(activeLeagueId ?? null);
  const draftStrategy = isEmptyStrategy(strat.strategy) ? null : strat.strategy;
  const targetById = useMemo(() => targetGroups(draftStrategy), [draftStrategy]);
  const strategyPanel = useStrategyPanel();

  // -------- Player Pool / Watchlist --------
  const pool = usePoolView({ players: allPlayers, draftedIds, strategy: draftStrategy, liveById: getLivePlayerById, withExtras: isDesktop });
  const squadFormat = activeLeague?.squadFormat;
  const playerPoolPlayers = useMemo(() => pool.available.filter((p) => canTeamDraftPlayer(yourTeamId, p, squadFormat)), [pool.available, canTeamDraftPlayer, yourTeamId, squadFormat]);
  // In the order you set (auto-pick takes the first that's still free and fits)
  const watchlistPlayers = useMemo(() => {
    const byId = new Map(pool.available.map((p) => [p.id, p]));
    return watchlistOrder.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  }, [pool.available, watchlistOrder]);

  const [activeTab, setActiveTab] = useState<DraftTab>("Player Pool");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const canDraft = (p: Player) => phase === "liveDraft" && youOnClock && !draftComplete && canTeamDraftPlayer(yourTeamId, p, squadFormat);
  const onDraftClick = (p: Player) => {
    if (phase !== "liveDraft" || draftComplete || !youOnClock) return;
    if (!canTeamDraftPlayer(onTheClockTeamId, p, squadFormat)) return;
    setModal({ type: "draftConfirm", player: p });
  };
  const openPlayerCard = (p: Player) => setModal({ type: "playerCard", player: p });

  // -------- Draft Results, the draft order --------
  // (Auto-picks happen on the server when the clock runs out.)
  const draftResults: DraftPickRow[] = useMemo(() => {
    return Array.from({ length: totalPicks }).map((_, idx) => {
      const owner = ownerForPickSnake(idx + 1);
      const ownerInitials =
        owner?.userInitials ||
        owner?.initials ||
        (owner?.name ?? "")
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase();
      return { pickNumber: idx + 1, player: picks[idx] ?? null, ownerInitials, ownerTeamId: owner?.id };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPicks, picks, ownerForPickSnake, teams]);

  // the draft order (round 1), for "First Pick" and its pop-up (Ethan, 25 Nov 2026)
  const draftOrderTeams = useMemo(() => {
    const out: Array<{ id: string; name: string; ownerName: string | null }> = [];
    for (let i = 1; i <= teams.length; i++) {
      const t = ownerForPickSnake(i);
      if (!t) continue;
      const lt = activeLeague?.teams?.find((x) => x.id === t.id);
      out.push({ id: t.id, name: t.name, ownerName: lt?.ownerName ?? null });
    }
    return out;
  }, [teams.length, ownerForPickSnake, activeLeague?.teams]);
  const firstPickTeamName = draftOrderTeams[0]?.name ?? activeLeague?.teams?.[0]?.name ?? "TBC";

  // -------- the draft lottery (lib/draft/lottery) --------
  const lottery = useLottery(activeLeagueId ?? null);
  const lotteryData = lottery.data;
  const clockNow = useNow(1000);
  const serverNow = clockNow ? clockNow + (lotteryData?.offsetMs ?? 0) : 0;
  const [stage, setStage] = useState<{ runId: string; replay: boolean } | null>(null);
  // a run starting in the next 30 seconds, or on now: opens by itself, once (set while drawing)
  const liveRun =
    serverNow && lotteryData
      ? (lotteryData.runs.find((r) => (r.ranAt ? serverNow - r.ranAt < LOTTERY_LIVE_MS : r.scheduledAt - serverNow < 30_000)) ?? null)
      : null;
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);
  if (liveRun && autoOpenedFor !== liveRun.id) {
    setAutoOpenedFor(liveRun.id);
    setStage({ runId: liveRun.id, replay: false });
  }
  const stageRun = stage ? (lotteryData?.runs.find((r) => r.id === stage.runId) ?? null) : null;
  const lastLottery = lastRun(lotteryData);
  const waitingLottery = waitingRun(lotteryData);
  // from the Dashboard / a notification (/draft-room#lottery): the waiting run, else the last one
  const [lotteryLinkDone, setLotteryLinkDone] = useState(false);
  if (!lotteryLinkDone && mounted && lotteryData && window.location.hash === "#lottery") {
    setLotteryLinkDone(true);
    const r = waitingLottery ?? lastLottery;
    if (r) setStage({ runId: r.id, replay: !!r.ranAt && !(serverNow && serverNow - r.ranAt < LOTTERY_LIVE_MS) });
  }
  const lotteryNote = lastLottery ? `Set by the draft lottery (run ${lastLottery.runNumber}${lastLottery.runNumber > 1 ? ", a rerun" : ""}).` : null;

  // -------- Teams tab --------
  const [pickedTeamId, setSelectedTeamId] = useState<string>("");
  // your own team until you pick another (Ethan, 25 Nov 2026)
  const selectedTeamId =
    pickedTeamId && teams.some((t) => t.id === pickedTeamId) ? pickedTeamId : teams.some((t) => t.id === yourTeamId) ? yourTeamId : (teams[0]?.id ?? "");
  const selectedRoster = rosters[selectedTeamId] ?? null;
  // The team's players: from the picks (the saved roster after the draft is only a list of ids,
  // which showed an empty team; found 25 Nov 2026), else whatever the roster has.
  const selectedTeamPlayers = (() => {
    const fromPicks = draftResults.filter((r) => r.ownerTeamId === selectedTeamId && r.player).map((r) => r.player as unknown);
    const roster = selectedRoster as { slots?: Record<string, unknown[]>; wildcards?: unknown[]; playerIds?: string[] } | null;
    const fromRoster = roster ? [...Object.values(roster.slots ?? {}).flat(), ...(roster.wildcards ?? []), ...(roster.playerIds ?? [])] : [];
    const seen = new Set<string>();
    return (fromPicks.length ? fromPicks : fromRoster)
      .map(resolvePlayer)
      .filter((p): p is Player => !!p && !seen.has(p.id) && !!seen.add(p.id));
  })();

  if (!ready) {
    return <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", color: "white" }}>Loading…</main>;
  }

  const filterBar = (
    <PoolFilterBar
      search={pool.search}
      setSearch={pool.setSearch}
      filters={pool.filters}
      setFilters={pool.setFilters}
      sort={pool.sortMode}
      setSort={pool.setSortMode}
      sortOptions={pool.sortOptions}
      statOptions
      columns={pool.columns}
    />
  );
  const listProps = {
    columnNote: pool.columnNote,
    columnLabel: pool.columnLabel,
    numberText: pool.numberText,
    targetById,
    watched: (id: string) => !!watchlist[id],
    onToggleWatch: toggleWatchlist,
    draftComplete,
    canDraft,
    onDraft: onDraftClick,
    onOpen: openPlayerCard,
  };
  const openMenu = () => setMenuOpen(true);

  const header =
    phase === "preDraft" ? (
      <PreDraftHeader
        draftAt={typeof activeLeague?.draftAt === "number" && Number.isFinite(activeLeague.draftAt) ? activeLeague.draftAt : null}
        firstPickName={firstPickTeamName}
        onShowOrder={draftOrderTeams.length ? () => setModal({ type: "draftOrder" }) : undefined}
        lottery={
          waitingLottery
            ? {
                text: `Draft Order Lottery${waitingLottery.runNumber > 1 ? " (rerun)" : ""} at ${lotteryWhen(waitingLottery.scheduledAt)}.`,
                onWatch: () => setStage({ runId: waitingLottery.id, replay: false }),
              }
            : null
        }
        onMenu={openMenu}
      />
    ) : draftComplete ? (
      <CompleteHeader latestPickText={latestPickText} onMenu={openMenu} />
    ) : (
      <LiveHeader
        deadlineMs={serverDeadlineMs ?? null}
        draftComplete={draftComplete}
        currentPick={currentPick}
        totalPicks={totalPicks}
        latestPickText={latestPickText}
        youOnClock={youOnClock}
        nextPickInTurns={nextPickInTurns}
        onTheClockName={teams.find((t) => t.id === onTheClockTeamId)?.name ?? "TBC"}
        onMenu={openMenu}
      />
    );

  const tabBar = (tabs: readonly DraftTab[], active: DraftTab) => (
    <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.18)" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{ height: 30, border: "none", background: t === active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  // on a computer a strategy that's been set is always on screen: the strip's "edit" goes to it
  const hasStrategy = !isEmptyStrategy(draftStrategy);
  const editStrategy = isDesktop && hasStrategy ? () => document.getElementById("draft-strategy-column")?.scrollTo({ top: 0, behavior: "smooth" }) : strategyPanel.show;
  const poolTab = (
    <>
      {!draftComplete ? (
        <DraftPlanStrip strategy={draftStrategy} draftedIds={draftedIds} leagueId={activeLeagueId ?? null} hideMockDraft={phase === "liveDraft"} onEditStrategy={editStrategy} />
      ) : null}
      {filterBar}
      <PoolList {...listProps} extras={pool.extras} players={playerPoolPlayers} emptyText="No eligible players available for your remaining roster slots." />
    </>
  );
  const watchlistTab = (
    <>
      {filterBar}
      <PoolList {...listProps} players={watchlistPlayers} emptyText="No players in your watchlist yet." onMove={moveWatchlist} />
    </>
  );
  const teamsTab = (
    <TeamsTab
      teams={teams}
      selectedTeamId={selectedTeamId}
      onSelectTeam={setSelectedTeamId}
      players={selectedTeamPlayers}
      loading={!selectedRoster && !selectedTeamPlayers.length}
      squad={squadFormat ?? STANDARD_SQUAD}
      pickNumberOf={getPlayerPickNumber}
      onOpen={(p) => openPlayerCard(p)}
    />
  );
  const mockDraft = phase === "preDraft" && activeLeague ? () => router.push(`/mock-draft?leagueId=${encodeURIComponent(activeLeague.id)}`) : undefined;
  const background = (
    <div
      aria-hidden="true"
      style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }}
    />
  );

  const modals = (
    <>
      {stageRun && lotteryData ? (
        <LotteryStage
          key={`${stageRun.id}|${stage?.replay ? 1 : 0}`}
          run={stageRun}
          teams={lotteryData.teams}
          offsetMs={lotteryData.offsetMs}
          isLatest={!stageRun.ranAt || lastLottery?.id === stageRun.id}
          replay={!!stage?.replay}
          yourTeamId={yourTeamId}
          onClose={() => {
            setStage(null);
            if (window.location.hash === "#lottery") window.history.replaceState(null, "", window.location.pathname + window.location.search);
            // the new order (first pick) straight away
            if (activeLeagueId) void refreshFromServer(activeLeagueId);
          }}
        />
      ) : null}
      {modal?.type === "draftConfirm" && (
        <DraftConfirmModal
          player={modal.player}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            setModal(null);
            if (activeLeagueId) confirmDraft(modal.player, activeLeagueId, (lid) => completeDraft?.(lid));
          }}
        />
      )}

      {modal?.type === "draftOrder" && (
        <DraftOrderModal
          teams={draftOrderTeams}
          yourTeamId={yourTeamId}
          preDraft={phase === "preDraft"}
          lotteryNote={lotteryNote}
          lotteryRuns={
            lotteryData ? (
              <LotteryRuns
                data={lotteryData}
                onWatch={(run) => {
                  setModal(null);
                  setStage({ runId: run.id, replay: true });
                }}
              />
            ) : null
          }
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === "playerCard" && (
        <PlayerCardModal
          onClose={() => setModal(null)}
          player={withLiveStatus(modal.player) as never}
          stats={modal.player.stats ?? {}}
          teamLabel={getPlayerTeamName(modal.player.id) ?? "Available"}
          initialTab="Stats"
          actions={
            isDrafted(modal.player.id) || draftComplete
              ? []
              : phase === "preDraft"
                ? [{ label: watchlist[modal.player.id] ? "Remove Watchlist" : "Add Watchlist", onClick: () => toggleWatchlist(modal.player.id), variant: "primary" }]
                : [
                    { label: watchlist[modal.player.id] ? "Remove from Watchlist" : "Add to Watchlist", onClick: () => toggleWatchlist(modal.player.id), variant: "secondary" },
                    { label: "Draft", onClick: () => onDraftClick(modal.player), variant: "primary" },
                  ]
          }
        />
      )}
    </>
  );

  // ---------------- computers: the picks, then three columns ----------------
  if (isDesktop) {
    const column: React.CSSProperties = { minHeight: 0, overflowY: "auto", paddingBottom: 16 };
    const columnTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.85, margin: "4px 2px 0" };
    // with a strategy: Player Pool / Watchlist tabs here and the strategy in the middle;
    // without one: the Player Pool here and the Watchlist in the middle
    const poolSide: DraftTab = hasStrategy && activeTab === "Watchlist" ? "Watchlist" : "Player Pool";
    return (
      <main style={{ height: "100svh", display: "flex", flexDirection: "column", color: "white" }}>
        {background}
        <div style={{ padding: "16px 20px 0", maxWidth: 1600, width: "100%", margin: "0 auto" }}>
          {header}
          {draftResults.length ? (
            <div style={{ marginTop: 12 }}>
              <PickStrip results={draftResults} teams={teams} onClockPick={phase === "liveDraft" ? currentPick : 0} yourTeamId={yourTeamId} draftComplete={draftComplete} onOpen={openPlayerCard} />
            </div>
          ) : null}
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr) minmax(0, 0.8fr)",
            gap: 18,
            padding: "8px 20px 0",
            maxWidth: 1600,
            width: "100%",
            margin: "0 auto",
          }}
        >
          <section aria-label="Players" style={column}>
            {hasStrategy ? tabBar(["Player Pool", "Watchlist"], poolSide) : null}
            {poolSide === "Watchlist" ? watchlistTab : poolTab}
          </section>
          {hasStrategy ? (
            <section id="draft-strategy-column" aria-label="Draft Strategy" style={{ ...column, paddingTop: 10 }}>
              {activeLeague ? <DraftStrategyPanel embedded strat={strat} onClose={() => {}} onMockDraft={mockDraft} /> : null}
            </section>
          ) : (
            <section aria-label="Watchlist" style={column}>
              <div style={{ ...columnTitle, marginTop: 14 }}>Watchlist</div>
              <PoolList {...listProps} players={watchlistPlayers} emptyText="No players in your watchlist yet. Tap the eye next to a player to add him." onMove={moveWatchlist} />
            </section>
          )}
          <section aria-label="Teams" style={column}>
            <div style={{ ...columnTitle, marginTop: 14 }}>Teams</div>
            {teamsTab}
          </section>
        </div>
        <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} leagues={leagues} activeLeagueId={activeLeagueId ?? null} setActiveLeague={setActiveLeague} activeItem="Draft Room" />
        {strategyPanel.open && activeLeague ? <DraftStrategyPanel strat={strat} onClose={strategyPanel.close} onMockDraft={mockDraft} /> : null}
        {modals}
      </main>
    );
  }

  // ---------------- phones ----------------
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {background}

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        {header}
        {tabBar(TABS, activeTab)}
        {activeTab === "Player Pool" && poolTab}
        {activeTab === "Watchlist" && watchlistTab}
        {activeTab === "Teams" && teamsTab}
        {activeTab === "Draft Results" && <DraftResultsTab results={draftResults} onOpen={openPlayerCard} />}
      </div>

      <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} leagues={leagues} activeLeagueId={activeLeagueId ?? null} setActiveLeague={setActiveLeague} activeItem="Draft Room" />

      {strategyPanel.open && activeLeague ? <DraftStrategyPanel strat={strat} onClose={strategyPanel.close} onMockDraft={mockDraft} /> : null}

      {modals}
    </main>
  );
}
