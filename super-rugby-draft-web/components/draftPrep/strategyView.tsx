"use client";
// components/draftPrep/strategyView.tsx
// Draft Strategy's search, Filters and stat column (Ethan, 26 Nov 2026: "just like the
// transactions and draft room pages"). The same Filters pop-up (components/PoolFilters.tsx):
// team, position, status, Per game / Total / Per 80, season, and which stat to show.
// Ranked lists keep your order and just show the stat; the Add Players lists sort by it.
// Also the drag-to-reorder list (press and hold a player, then drag; @dnd-kit).
import React, { useMemo, useState } from "react";
import { closestCenter, DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EMPTY_FILTERS, matchesPoolFilters, PoolFilterBar, type PoolFilters } from "@/components/PoolFilters";
import { COMPARE_STATS, seasonTotals, type SeasonTotals } from "@/lib/players/seasonTotals";
import { applyStatView, formatStatView, STAT_VIEW_LABEL, useStatView } from "@/lib/players/statView";
import { useStatSeasonRows } from "@/lib/players/useStatSeason";
import { usePlayersStore } from "@/lib/players/store";
import type { StatKey } from "@/lib/scoring";
import { muted } from "@/lib/ui/theme";
import type { LinePlayer } from "./PlayerLine";

const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "DRAFT_RANK", label: "Draft Rank" },
  ...COMPARE_STATS.map((c) => ({ value: c.key, label: c.label })),
];

export type PlayerView = {
  search: string;
  setSearch: (v: string) => void;
  filters: PoolFilters;
  setFilters: (f: PoolFilters) => void;
  sort: string;
  setSort: (v: string) => void;
  /** passes the search and Filters */
  matches: (p: LinePlayer) => boolean;
  /** the stat column's text */
  statText: (p: LinePlayer) => string;
  /** best first by the chosen stat (Draft Rank: lowest first) */
  byStat: <T extends LinePlayer>(list: T[]) => T[];
  /** e.g. "Per game · 2026" (empty for Draft Rank) */
  heading: string;
  statLabel: string;
};

/** The panel's one set of search / Filters / stat (shared by its tabs). */
export function usePlayerView(players: LinePlayer[]): PlayerView {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<PoolFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState("DRAFT_RANK");
  const [statView] = useStatView();
  const { rows, season } = useStatSeasonRows();
  const live = usePlayersStore((s) => s.getById);
  const rankMode = sort === "DRAFT_RANK";

  const totals = useMemo(() => {
    const m = new Map<string, SeasonTotals>();
    if (rankMode) return m;
    for (const p of players) m.set(p.id, seasonTotals(rows, p));
    return m;
  }, [players, rows, rankMode]);

  return useMemo(() => {
    const metric = (p: LinePlayer): number | null => {
      if (rankMode) return p.draftRank && p.draftRank < 9999 ? p.draftRank : null;
      const t = totals.get(p.id);
      if (!t) return null;
      const total = sort === "points" ? t.points : t.counts[sort as StatKey];
      return applyStatView(total, t.games, t.minutes, statView);
    };
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return {
      search,
      setSearch,
      filters,
      setFilters,
      sort,
      setSort,
      matches: (p) =>
        words.every((w) => `${p.firstName} ${p.lastName} ${p.teamCode}`.toLowerCase().includes(w)) &&
        matchesPoolFilters(p as never, filters, (live?.(p.id) as never) ?? null),
      statText: (p) => (rankMode ? String(metric(p) ?? "—") : formatStatView(metric(p), statView)),
      byStat: (list) => {
        const v = (p: LinePlayer) => metric(p);
        return [...list].sort((a, b) =>
          rankMode ? (v(a) ?? 9999) - (v(b) ?? 9999) : (v(b) ?? -Infinity) - (v(a) ?? -Infinity) || (a.draftRank ?? 9999) - (b.draftRank ?? 9999)
        );
      },
      heading: rankMode ? "" : `${STAT_VIEW_LABEL[statView]} · ${season}`,
      statLabel: SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "Draft Rank",
    };
  }, [search, filters, sort, statView, season, totals, rankMode, live]);
}

/** Search + the Filters button. */
export function StrategyFilterBar({ view }: { view: PlayerView }) {
  return (
    <PoolFilterBar
      search={view.search}
      setSearch={view.setSearch}
      filters={view.filters}
      setFilters={view.setFilters}
      sort={view.sort}
      setSort={view.setSort}
      sortOptions={SORT_OPTIONS}
      statOptions
    />
  );
}

/** The column names above a list: the stat's name right above the stat column. */
export function ListHeading({ view, rightWidth }: { view: PlayerView; rightWidth: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "6px 8px 2px 11px", fontSize: 10, fontWeight: 600, color: muted }}>
      <div style={{ flex: 1, minWidth: 0 }}>{view.heading}</div>
      <div style={{ width: 44, textAlign: "center", lineHeight: 1.15 }}>{view.statLabel}</div>
      {rightWidth ? <div style={{ width: rightWidth }} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
/**
 * A list you can reorder by dragging: press and hold a player (or click and drag with a mouse),
 * then move him. onMove(id, overId): drop `id` where `overId` is.
 */
export function DragList({ ids, onMove, children }: { ids: string[]; onMove: (id: string, overId: string) => void; children: (id: string) => React.ReactNode }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  );
  const onDragEnd = (e: DragEndEvent) => {
    dragEndedAt.current = Date.now();
    const overId = e.over?.id;
    if (overId != null && overId !== e.active.id) onMove(String(e.active.id), String(overId));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => (dragEndedAt.current = Date.now())} onDragEnd={onDragEnd} onDragCancel={() => (dragEndedAt.current = Date.now())}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {ids.map((id) => (
          <DragRow key={id} id={id}>
            {children(id)}
          </DragRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}

// a tap right after a drag isn't a tap (so dropping a player doesn't open his card)
const dragEndedAt = { current: 0 };
export const justDragged = () => Date.now() - dragEndedAt.current < 400;

function DragRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      tabIndex={-1}
      role="listitem"
      // press-and-hold is for dragging, not the phone's copy / save-image menu
      onContextMenu={(e) => e.preventDefault()}
      style={{
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition,
        position: "relative",
        zIndex: isDragging ? 5 : undefined,
        background: isDragging ? "white" : undefined,
        boxShadow: isDragging ? "0 8px 24px rgba(15,23,42,0.25)" : undefined,
        borderRadius: isDragging ? 10 : undefined,
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "manipulation",
      }}
    >
      {children}
    </div>
  );
}
