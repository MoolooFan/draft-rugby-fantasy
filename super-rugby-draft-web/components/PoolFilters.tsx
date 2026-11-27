"use client";

// Player pool filters (plan item C2, agreed with Ethan Nov 2026): the search box, and one
// Filters button that opens a pop-up with Players (Available / All / a fantasy team), Team,
// Position, Status, Sort by and Reset. Several options can be picked in each (e.g. 3 teams).
// Used on the Transactions page and in the draft room.

import React, { useState } from "react";
import { TEAM_OPTIONS, POSITION_OPTIONS } from "@/lib/constants";
import { canPlayPosition } from "@/lib/players/positions";
import { currentStatusKind } from "@/lib/status/kind";
import { STAT_VIEWS, STAT_VIEW_LABEL, useStatSeasonStore, useStatView } from "@/lib/players/statView";
import { useStatSeason } from "@/lib/players/useStatSeason";

export type StatusFilter = "available" | "starting" | "sub" | "injured" | "suspended";

export type PoolFilters = { teams: string[]; positions: string[]; statuses: StatusFilter[] };

export const EMPTY_FILTERS: PoolFilters = { teams: [], positions: [], statuses: [] };

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "available", label: "Available to play" },
  { value: "starting", label: "Starting" },
  { value: "sub", label: "Sub" },
  { value: "injured", label: "Injured / out" },
  { value: "suspended", label: "Suspended" },
];

const POSITIONS = POSITION_OPTIONS.filter((p) => String(p.value).toUpperCase() !== "WC");

type PlayerLike = {
  teamCode?: string | null;
  posAbbrev?: string | null;
  secondaryPosAbbrev?: string | null;
  thirdPosAbbrev?: string | null;
  status?: string | null;
  weeklyStatus?: Record<string, string> | null;
};

/** Does this player pass the Team / Position / Status filters? (An empty list = everyone.) */
export function matchesPoolFilters(p: PlayerLike, f: PoolFilters, live?: PlayerLike | null): boolean {
  if (f.teams.length) {
    // Moana Pasifika is "MOP" in the team list and "MOA" in some player lists
    const code = String(p.teamCode ?? "").toUpperCase().replace(/^MOA$/, "MOP");
    if (!f.teams.some((t) => t.toUpperCase().replace(/^MOA$/, "MOP") === code)) return false;
  }
  if (f.positions.length && !f.positions.some((pos) => canPlayPosition(p as never, pos))) return false;
  if (f.statuses.length) {
    const k = currentStatusKind(live ?? p);
    const ok = f.statuses.some((s) =>
      s === "available" ? k !== "injured" && k !== "out" && k !== "suspended" && k !== "questionable"
      : s === "starting" ? k === "starting"
      : s === "sub" ? k === "bench"
      : s === "injured" ? k === "injured" || k === "out" || k === "questionable"
      : k === "suspended"
    );
    if (!ok) return false;
  }
  return true;
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        height: 30,
        padding: "0 10px",
        borderRadius: 999,
        border: on ? "1px solid #0f172a" : "1px solid rgba(15,23,42,0.2)",
        background: on ? "#0f172a" : "white",
        color: on ? "white" : "#0f172a",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export function PoolFilterBar({
  search,
  setSearch,
  filters,
  setFilters,
  owners,
  setOwners,
  ownerOptions,
  sort,
  setSort,
  sortOptions,
  defaultSort,
  statOptions,
  columns,
}: {
  search: string;
  setSearch: (v: string) => void;
  filters: PoolFilters;
  setFilters: (f: PoolFilters) => void;
  /** Players: "available", "all" or "team:<id>" (several teams allowed); leave out where there's no owner choice */
  owners?: string[];
  setOwners?: (v: string[]) => void;
  ownerOptions?: Array<{ label: string; value: string }>;
  sort?: string;
  setSort?: (v: string) => void;
  sortOptions?: Array<{ label: string; value: string }>;
  /** what Reset goes back to (default: Draft Rank if it's an option, else the first option) */
  defaultSort?: string;
  /** also show Per game / Total / Per 80 and the season (2026 / 2027) in the pop-up */
  statOptions?: boolean;
  /** computers: pick the list's stat columns, up to 5 (lib/players/poolColumns.ts; Ethan, 27 Nov 2026) */
  columns?: { selected: string[]; options: Array<{ value: string; label: string }>; toggle: (v: string) => void; reset: () => void };
}) {
  const [open, setOpen] = useState(false);
  const [statView, setStatView] = useStatView();
  const { season, setSeason, seasons } = useStatSeason();
  const resetSeason = useStatSeasonStore((s) => s.setSeason);
  // Reset (Ethan, 25 Nov 2026): back to per game, the default season (2026 until 2027 starts),
  // no team / position, all statuses, sorted by Draft Rank
  const reset = () => {
    setFilters(EMPTY_FILTERS);
    setOwners?.(["available"]);
    if (statOptions) {
      setStatView("game");
      resetSeason(null);
    }
    const sortTo = defaultSort ?? (sortOptions?.some((o) => o.value === "DRAFT_RANK") ? "DRAFT_RANK" : sortOptions?.[0]?.value);
    if (setSort && sortTo) setSort(sortTo);
    columns?.reset();
  };
  const active =
    filters.teams.length +
    filters.positions.length +
    filters.statuses.length +
    (owners && !(owners.length === 1 && owners[0] === "available") ? 1 : 0);

  const pickOwner = (v: string) => {
    if (!setOwners || !owners) return;
    if (v === "all") return setOwners(["all"]);
    const next = toggle(owners.filter((x) => x !== "all"), v);
    setOwners(next.length ? next : ["available"]);
  };

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.6 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );

  return (
    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
      <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 10, padding: "8px 10px", boxShadow: "0 10px 20px rgba(0,0,0,0.12)", display: "grid", gridTemplateColumns: "1fr 22px", alignItems: "center", gap: 8 }}>
        <input
          id="pool-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="Search players"
          inputMode="search"
          enterKeyHint="search"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: "#0f172a", minWidth: 0 }}
        />
        <div style={{ textAlign: "right", fontSize: 16, opacity: 0.65 }}>🔍</div>
      </div>
      <button
        onClick={() => setOpen(true)}
        style={{
          height: 50,
          padding: "0 14px",
          borderRadius: 10,
          border: "none",
          background: active ? "#0f172a" : "rgba(255,255,255,0.92)",
          color: active ? "white" : "#0f172a",
          fontSize: 13,
          fontWeight: 700,
          boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Filters{active ? ` (${active})` : ""}
      </button>

      {open ? (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "end center" }}>
          <div
            role="dialog"
            aria-label="Filters"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: "86vh",
              overflowY: "auto",
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: "18px 18px 0 0",
              padding: "14px 14px calc(14px + env(safe-area-inset-bottom, 0px))",
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Filters</div>
              <button
                onClick={reset}
                style={{ background: "transparent", border: "none", color: "#dc2626", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                Reset
              </button>
            </div>

            {statOptions
              ? section(
                  "Stats shown",
                  STAT_VIEWS.map((v) => <Chip key={v} on={statView === v} label={STAT_VIEW_LABEL[v]} onClick={() => setStatView(v)} />)
                )
              : null}
            {columns ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.6 }}>
                  Columns ({columns.selected.length} of 5 picked)
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {columns.options.map((o) => {
                    const at = columns.selected.indexOf(o.value);
                    const full = at < 0 && columns.selected.length >= 5;
                    return (
                      <Chip
                        key={o.value}
                        on={at >= 0}
                        label={at >= 0 ? `${at + 1}. ${o.label}` : o.label}
                        onClick={() => {
                          if (!full) columns.toggle(o.value);
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Tap to add or take away (up to 5, shown in the order picked). Click a column&apos;s heading in the list to sort by it.</div>
              </div>
            ) : null}
            {statOptions && seasons.length > 1
              ? section(
                  "Season",
                  seasons.map((y) => <Chip key={y} on={season === y} label={String(y)} onClick={() => setSeason(y)} />)
                )
              : null}

            {owners && ownerOptions?.length
              ? section(
                  "Players",
                  ownerOptions.map((o) => (
                    <Chip key={o.value} on={owners.includes(o.value)} label={o.label} onClick={() => pickOwner(o.value)} />
                  ))
                )
              : null}

            {section(
              "Team",
              TEAM_OPTIONS.map((t) => (
                <Chip key={t.value} on={filters.teams.includes(t.value)} label={t.label} onClick={() => setFilters({ ...filters, teams: toggle(filters.teams, t.value) })} />
              ))
            )}

            {section(
              "Position",
              POSITIONS.map((p) => (
                <Chip
                  key={p.value}
                  on={filters.positions.includes(p.value)}
                  label={p.label}
                  onClick={() => setFilters({ ...filters, positions: toggle(filters.positions, p.value) })}
                />
              ))
            )}

            {section("Status", [
              <Chip key="all" on={!filters.statuses.length} label="All" onClick={() => setFilters({ ...filters, statuses: [] })} />,
              ...STATUS_OPTIONS.map((s) => (
                <Chip
                  key={s.value}
                  on={filters.statuses.includes(s.value)}
                  label={s.label}
                  onClick={() => setFilters({ ...filters, statuses: toggle(filters.statuses, s.value) })}
                />
              )),
            ])}

            {sortOptions?.length && setSort ? (
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.6 }}>Sort by</div>
                <select
                  id="pool-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  style={{ height: 36, borderRadius: 10, border: "1px solid rgba(15,23,42,0.2)", padding: "0 10px", fontSize: 13, fontWeight: 600, color: "#0f172a", background: "white" }}
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              onClick={() => setOpen(false)}
              style={{ height: 40, borderRadius: 12, border: "none", background: "#22C55E", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
