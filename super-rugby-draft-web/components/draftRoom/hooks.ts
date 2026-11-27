"use client";
// components/draftRoom/hooks.ts
// The Draft Room's list logic and the Draft Strategy panel's open / close, kept out of the page.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Player } from "@/lib/draft/types";
import type { StatKey } from "@/lib/scoring";
import { EMPTY_FILTERS, matchesPoolFilters, type PoolFilters } from "@/components/PoolFilters";
import { applyStatView, formatStatView, STAT_VIEW_LABEL, useStatView } from "@/lib/players/statView";
import { useStatSeasonRows } from "@/lib/players/useStatSeason";
import { COMPARE_STATS, seasonTotals, type SeasonTotals } from "@/lib/players/seasonTotals";
import { canPlayPosition } from "@/lib/players/positions";
import { myRanks, positionRanks, STRATEGY_POSITIONS, type DraftStrategy, type StrategyPos } from "@/lib/draft/strategy";

/** Draft room pool: what the number column shows (draft rank, or the season's points / a stat). */
const DRAFT_SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "DRAFT_RANK", label: "Draft Rank" },
  ...COMPARE_STATS.map((c) => ({ value: c.key, label: c.label })),
];

/** The extra numbers on a computer: games, points, points per game, tries (Ethan, 27 Nov 2026). */
const EXTRA_LABELS = ["Games", "Pts", "Pts/G", "Tries"];

/**
 * Search, Filters and the number column for the Player Pool and Watchlist. The number is the
 * draft rank, "My Rank" (your strategy's Overall Rankings, or with one position picked in
 * Filters your Positional Rankings for it) or the chosen season's points / a stat, per game /
 * total / per 80 (lib/players/statView).
 */
export function usePoolView({
  players,
  draftedIds,
  strategy,
  liveById,
  withExtras = false,
}: {
  players: Player[];
  draftedIds: Set<string>;
  /** your draft strategy (null when you haven't set one up) */
  strategy: DraftStrategy | null;
  /** the player's latest status (injured, ...) for the Status filter */
  liveById: (id: string) => unknown;
  /** computers: also games, points, points per game and tries (Ethan, 27 Nov 2026) */
  withExtras?: boolean;
}) {
  const [search, setSearch] = useState("");
  // C2: the same Filters pop-up as the Transactions page (Team / Position / Status, several of each)
  const [filters, setFilters] = useState<PoolFilters>(EMPTY_FILTERS);
  const [sortMode, setSortMode] = useState<string>("DRAFT_RANK");
  const [statView] = useStatView();
  const { rows: statRows, season: statSeason } = useStatSeasonRows();

  const hasMyRanks = !!strategy && (strategy.ranking.length > 0 || Object.values(strategy.positions).some((l) => l?.length));
  const rankPos = filters.positions.length === 1 && (STRATEGY_POSITIONS as readonly string[]).includes(filters.positions[0]) ? (filters.positions[0] as StrategyPos) : null;
  const myRankById = useMemo(() => {
    const overall = myRanks(players, strategy);
    if (!rankPos || !strategy?.positions[rankPos]?.length) return overall;
    return positionRanks(players.filter((p) => canPlayPosition(p, rankPos)), strategy, rankPos, overall);
  }, [players, strategy, rankPos]);
  const sortOptions = useMemo(() => (hasMyRanks ? [DRAFT_SORT_OPTIONS[0], { value: "MY_RANK", label: "My Rank" }, ...DRAFT_SORT_OPTIONS.slice(1)] : DRAFT_SORT_OPTIONS), [hasMyRanks]);
  const rankMode = sortMode === "DRAFT_RANK" || sortMode === "MY_RANK";

  const totalsById = useMemo(() => {
    const m = new Map<string, SeasonTotals>();
    if (!withExtras && (sortMode === "DRAFT_RANK" || sortMode === "MY_RANK")) return m;
    for (const p of players) m.set(p.id, seasonTotals(statRows, p));
    return m;
  }, [players, statRows, sortMode, withExtras]);

  const metricOf = useMemo(
    () =>
      (p: Player): number | null => {
        if (sortMode === "DRAFT_RANK") return p.draftRank;
        if (sortMode === "MY_RANK") return myRankById.get(p.id) ?? null;
        const t = totalsById.get(p.id);
        if (!t) return null;
        const total = sortMode === "points" ? t.points : t.counts[sortMode as StatKey];
        return applyStatView(total, t.games, t.minutes, statView);
      },
    [sortMode, myRankById, totalsById, statView]
  );

  // the players still available, searched, filtered and sorted
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    const val = (p: Player) => metricOf(p) ?? -Infinity;
    return players
      .filter((p) => !draftedIds.has(p.id))
      .filter((p) => (q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true))
      .filter((p) => matchesPoolFilters(p as never, filters, liveById(p.id) as never))
      .sort((a, b) =>
        sortMode === "DRAFT_RANK" ? a.draftRank - b.draftRank : rankMode ? val(a) - val(b) || a.draftRank - b.draftRank : val(b) - val(a) || a.draftRank - b.draftRank
      );
  }, [players, draftedIds, search, filters, liveById, sortMode, rankMode, metricOf]);

  return {
    search,
    setSearch,
    filters,
    setFilters,
    sortMode,
    setSortMode,
    sortOptions,
    available,
    numberText: (p: Player) => (rankMode ? String(metricOf(p) ?? "") : formatStatView(metricOf(p), statView)),
    columnLabel: sortOptions.find((o) => o.value === sortMode)?.label ?? "Draft Rank",
    columnNote: rankMode ? "" : `${STAT_VIEW_LABEL[statView]} · ${statSeason}`,
    extras: withExtras
      ? {
          note: `${statSeason} season`,
          labels: EXTRA_LABELS,
          values: (p: Player): string[] => {
            const t = totalsById.get(p.id);
            if (!t || !t.games) return EXTRA_LABELS.map(() => "–");
            return [String(t.games), String(Math.round(t.points)), (t.points / t.games).toFixed(1), String(t.counts.tries ?? 0)];
          },
        }
      : undefined,
  };
}

/**
 * The Draft Strategy panel opens over the Draft Room and adds "#strategy" to the address, so the
 * phone's back button / swipe closes it. Coming from the Mock Draft page or the Dashboard it
 * opens straight away (/draft-room#strategy).
 */
export function useStrategyPanel() {
  const [open, setOpen] = useState(false);
  const pushed = useRef(false);
  useEffect(() => {
    // the address only exists in the browser, so it's read once the page is showing
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.location.hash === "#strategy") setOpen(true);
    const onPop = () => {
      const isOpen = window.location.hash === "#strategy";
      if (!isOpen) pushed.current = false;
      setOpen(isOpen);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const address = () => `${window.location.pathname}${window.location.search}`;
  return {
    open,
    show: () => {
      window.history.pushState(null, "", `${address()}#strategy`);
      pushed.current = true;
      setOpen(true);
    },
    close: () => {
      if (pushed.current) {
        window.history.back(); // closes it (popstate above)
        return;
      }
      window.history.replaceState(null, "", address());
      setOpen(false);
    },
  };
}
