"use client";

// Stats Hub (Ethan, 16 Nov 2026; was the no-league Player Pool, plan item E2): every player's
// stats in one table for everyone, in a league or not. Filter by search / team / position /
// status (and, in a league, who owns them), pick the season and rounds (whole season, last 3 or
// 5 rounds, or one round), per game / total / per 80, and which group of stats to show. Tap a
// column to sort, a name for the player card; tick two players to compare them
// (components/PlayerCompare.tsx). Looking only: adding / claiming stays on Transactions.

import React, { useMemo, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";

import { AppMenu } from "@/components/AppMenu";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { StatusTag } from "@/components/StatusTag";
import { StatViewToggle } from "@/components/StatViewToggle";
import { EMPTY_FILTERS, matchesPoolFilters, PoolFilterBar, type PoolFilters } from "@/components/PoolFilters";
import { useLeagueStore } from "@/lib/league/store";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { usePlayerPool } from "@/lib/players/pool";
import type { PlayerFromSheet } from "@/lib/players/store";
import { playerRoundRows } from "@/lib/players/roundIndex";
import { positionsLabel } from "@/lib/players/positions";
import { activeScoringRules } from "@/lib/scoring";
import { formatStatView, useStatView } from "@/lib/players/statView";
import { statSeasons, useLeagueOwners, useSeasonStatRows } from "@/lib/players/useStatRows";
import {
  aggregatePlayer, COUNTING_STATS, LOWER_IS_BETTER, roundsForRange, roundsWithStats, STAT_GROUPS, STAT_LABELS, statValue,
  type PlayerAgg, type StatColumn, type StatRange,
} from "@/lib/players/statsHub";
import { formatProjection, projectionFor, useProjections } from "@/lib/projections/useProjections";
import { useCompareStore } from "@/lib/players/compareStore";
import { getSeason, statsSeasonYear, weekLabel } from "@/lib/season";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";

type Col = StatColumn | "proj";
const PAGE = 60;

function jerseySrc(code: string) {
  const j = JERSEYS[String(code ?? "").toUpperCase()];
  return j?.angle ?? j?.single ?? j?.front ?? JERSEY_PLACEHOLDER;
}

const COL_TITLE: Record<string, string> = { points: "Fantasy points", proj: "Expected points this week", games: "Games played" };
const colShort = (c: Col) => (c === "points" ? "PTS" : c === "proj" ? "PROJ" : c === "games" ? "GP" : STAT_LABELS[c].short);
const colLong = (c: Col) => COL_TITLE[c] ?? (c === "points" || c === "proj" || c === "games" ? c : STAT_LABELS[c].long);

export default function StatsHubPage() {
  useRequireSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const league = (leagues ?? []).find((l) => l.id === activeLeagueId) ?? null;

  const players = usePlayerPool();
  const owners = useLeagueOwners(league?.id ?? null);
  const proj = useProjections(league?.id ?? null, "current");
  const openCompare = useCompareStore((s) => s.openWith);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<PoolFilters>(EMPTY_FILTERS);
  const [ownerFilter, setOwnerFilter] = useState<string[]>(["all"]);
  const [season, setSeason] = useState<number>(() => statsSeasonYear());
  const [range, setRange] = useState<StatRange>({ kind: "season" });
  const [group, setGroup] = useState<string>("all");
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: "points", dir: -1 });
  const [view] = useStatView();
  const [shown, setShown] = useState(PAGE);
  const [ticked, setTicked] = useState<string[]>([]);
  const [card, setCard] = useState<PlayerFromSheet | null>(null);

  const { rows, loading } = useSeasonStatRows(season);
  const rounds = useMemo(() => roundsWithStats(rows), [rows]);
  const roundSet = useMemo(() => roundsForRange(range, rounds), [range, rounds]);

  // every player's totals over the chosen rounds (league scoring if you're in one)
  const aggs = useMemo(() => {
    const rules = activeScoringRules();
    const m = new Map<string, PlayerAgg>();
    for (const p of players) m.set(p.id, aggregatePlayer(playerRoundRows(rows, p.id), p, rules, roundSet));
    return m;
  }, [players, rows, roundSet]);

  const ownerName = (id: string): string | null => {
    if (!league) return null;
    const t = owners?.owner.get(id);
    if (t) return league.teams.find((x) => x.id === t)?.name ?? "Owned";
    if (!owners) return null;
    return owners.onWaivers.has(id) ? "On waivers" : "Free agent";
  };

  const statCols: StatColumn[] = group === "all" ? COUNTING_STATS : STAT_GROUPS.find((g) => g.id === group)?.keys ?? COUNTING_STATS;
  const cols: Col[] = ["points", "proj", "games", "minutesPlayed", ...statCols];

  const value = (p: PlayerFromSheet, c: Col): number | null =>
    c === "proj" ? projectionFor(proj, p.id)?.pts ?? null : statValue(aggs.get(p.id), c, view);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = players.filter((p) => {
      if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false;
      if (!matchesPoolFilters(p, filters)) return false;
      if (league && owners && !ownerFilter.includes("all")) {
        const t = owners.owner.get(p.id);
        const ok = ownerFilter.some((o) => (o === "available" ? !t : o === `team:${t}`));
        if (!ok) return false;
      }
      return true;
    });
    const v = (p: PlayerFromSheet) => value(p, sort.col);
    return out.sort((a, b) => {
      const va = v(a), vb = v(b);
      if (va == null && vb == null) return String(a.lastName).localeCompare(String(b.lastName));
      if (va == null) return 1;
      if (vb == null) return -1;
      return (vb - va) * -sort.dir || String(a.lastName).localeCompare(String(b.lastName));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, search, filters, ownerFilter, owners, league, sort, aggs, view, proj]);

  const tapCol = (c: Col) => {
    setShown(PAGE);
    setSort((s) => (s.col === c ? { col: c, dir: s.dir === -1 ? 1 : -1 } : { col: c, dir: c !== "points" && c !== "proj" && c !== "games" && LOWER_IS_BETTER.has(c) ? 1 : -1 }));
  };
  const tick = (id: string) =>
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 2 ? [t[1], id] : [...t, id]));

  const selectStyle: React.CSSProperties = {
    height: 32,
    borderRadius: 10,
    border: "none",
    outline: "none",
    padding: "0 8px",
    fontSize: 12,
    fontWeight: 600,
    color: "#0f172a",
    background: "rgba(255,255,255,0.92)",
    minWidth: 0,
  };
  const chip = (on: boolean): React.CSSProperties => ({
    height: 28,
    padding: "0 10px",
    borderRadius: 999,
    border: on ? "1px solid #0f172a" : "1px solid #d5dce4",
    background: on ? "#0f172a" : "#eef2f6",
    color: on ? "white" : "#0f172a",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  });
  const th: React.CSSProperties = { padding: "7px 6px", fontSize: 10, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none", borderBottom: "1px solid rgba(15,23,42,0.1)" };
  const td: React.CSSProperties = { padding: "6px 6px", fontSize: 12, fontWeight: 500, textAlign: "center", whiteSpace: "nowrap", borderTop: "1px solid rgba(15,23,42,0.06)" };
  const sticky: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, background: "white", textAlign: "left", boxShadow: "1px 0 0 rgba(15,23,42,0.08)" };

  const rangeValue = range.kind === "season" ? "season" : range.kind === "last" ? `last${range.n}` : `round${range.round}`;
  const seasonCfg = getSeason(season);
  const tickedPlayers = ticked.map((id) => players.find((p) => p.id === id)).filter((p): p is PlayerFromSheet => !!p);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }}
      />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
          <div style={{ flex: 1 }} />
        </div>

        <div style={{ marginTop: 14, ...themeCard }}>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 22 }}>Stats Hub</div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
            Every player&apos;s stats. Tap a column to sort, a name for the player card, or tick two players to compare.
          </div>

          <PoolFilterBar
            search={search}
            setSearch={(v) => { setSearch(v); setShown(PAGE); }}
            filters={filters}
            setFilters={(f) => { setFilters(f); setShown(PAGE); }}
            {...(league
              ? {
                  owners: ownerFilter,
                  setOwners: (v: string[]) => { setOwnerFilter(v.includes("all") ? ["all"] : v); setShown(PAGE); },
                  ownerOptions: [
                    { label: "All", value: "all" },
                    { label: "Available", value: "available" },
                    ...league.teams.map((t) => ({ label: t.name, value: `team:${t.id}` })),
                  ],
                }
              : {})}
          />

          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select aria-label="Season" value={season} onChange={(e) => { setSeason(Number(e.target.value)); setRange({ kind: "season" }); setShown(PAGE); }} style={selectStyle}>
              {statSeasons().map((y) => <option key={y} value={y}>{y} season</option>)}
            </select>
            <select
              aria-label="Rounds"
              value={rangeValue}
              onChange={(e) => {
                const v = e.target.value;
                setRange(v === "season" ? { kind: "season" } : v.startsWith("last") ? { kind: "last", n: Number(v.slice(4)) } : { kind: "round", round: Number(v.slice(5)) });
                setShown(PAGE);
              }}
              style={selectStyle}
            >
              <option value="season">Whole season</option>
              <option value="last3">Last 3 rounds</option>
              <option value="last5">Last 5 rounds</option>
              {rounds.map((r) => <option key={r} value={`round${r}`}>{weekLabel(seasonCfg, r)}</option>)}
            </select>
            <StatViewToggle dark />
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {[{ id: "all", label: "All stats" }, ...STAT_GROUPS].map((g) => (
              <button key={g.id} onClick={() => setGroup(g.id)} aria-pressed={group === g.id} style={chip(group === g.id)}>
                {g.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, borderRadius: 12, background: "white", color: "#0f172a", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ ...th, ...sticky, cursor: "default", width: 150, minWidth: 150, maxWidth: 150 }}>Player {loading ? <span style={{ opacity: 0.5 }}>· loading…</span> : <span style={{ opacity: 0.5 }}>· {list.length}</span>}</th>
                    {cols.map((c) => (
                      <th key={c} title={colLong(c)} onClick={() => tapCol(c)} style={{ ...th, background: sort.col === c ? "rgba(13,148,136,0.12)" : undefined }}>
                        {colShort(c)}
                        {sort.col === c ? (sort.dir === -1 ? " ▼" : " ▲") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, shown).map((p) => {
                    const on = ticked.includes(p.id);

                    return (
                      <tr key={p.id}>
                        {/* the name column is a fixed width: long names are cut off with "…" rather than running into the stats (Ethan, 26 Nov 2026) */}
                        <td style={{ ...td, ...sticky, width: 150, minWidth: 150, maxWidth: 150, overflow: "hidden", background: on ? "rgb(230,247,245)" : "white" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <input type="checkbox" checked={on} onChange={() => tick(p.id)} aria-label={`Compare ${p.firstName} ${p.lastName}`} />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={jerseySrc(p.teamCode)} alt="" style={{ width: 22, height: 22, objectFit: "contain", flexShrink: 0 }} />
                            <button onClick={() => setCard(p)} style={{ border: "none", background: "transparent", padding: 0, textAlign: "left", cursor: "pointer", color: "#0f172a", minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                                  {p.firstName.charAt(0)}. {p.lastName}
                                </span>
                                <span style={{ flexShrink: 0 }}>
                                  <StatusTag player={p} />
                                </span>
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.teamCode} · {positionsLabel(p)}
                              </div>
                            </button>
                          </div>
                        </td>
                        {cols.map((c) => {
                          const v = value(p, c);
                          const text = c === "proj" ? (v == null ? "–" : formatProjection(v)) : c === "games" ? (v == null ? "–" : String(v)) : formatStatView(v, view);
                          return (
                            <td key={c} style={{ ...td, fontWeight: sort.col === c ? 950 : 700, background: sort.col === c ? "rgba(13,148,136,0.06)" : undefined }}>
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {list.length > shown ? (
              <button onClick={() => setShown((n) => n + PAGE)} style={{ width: "100%", height: 38, border: "none", borderTop: "1px solid rgba(15,23,42,0.08)", background: "rgba(15,23,42,0.04)", fontWeight: 700, cursor: "pointer", color: "#0f172a" }}>
                Show more ({list.length - shown} more)
              </button>
            ) : null}
            {!loading && !list.length ? <div style={{ padding: 14, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>No players match.</div> : null}
          </div>
        </div>
      </div>

      {/* compare bar: tick two players */}
      {ticked.length ? (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            padding: "10px 16px",
            paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(15,23,42,0.95)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tickedPlayers.map((p) => p.lastName).join(" v ")}
            {ticked.length === 1 ? " · tick one more" : ""}
          </div>
          <button
            disabled={ticked.length < 2}
            onClick={() => {
              openCompare(ticked[0], ticked[1]);
              setTicked([]);
            }}
            style={{ height: 34, padding: "0 16px", borderRadius: 999, border: "none", background: ticked.length < 2 ? "rgba(255,255,255,0.3)" : "#22C55E", color: "white", fontWeight: 700, cursor: ticked.length < 2 ? "default" : "pointer" }}
          >
            Compare
          </button>
          <button onClick={() => setTicked([])} style={{ height: 34, padding: "0 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.6)", background: "transparent", color: "white", fontWeight: 700, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      ) : null}

      {menuOpen ? (
        <AppMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          leagues={leagues}
          activeLeagueId={activeLeagueId}
          setActiveLeague={setActiveLeague}
          activeItem="Stats Hub"
        />
      ) : null}

      {card ? <PlayerCardModal player={card as never} onClose={() => setCard(null)} teamLabel={ownerName(card.id) ?? "Free agent"} hideActions /> : null}
    </main>
  );
}
