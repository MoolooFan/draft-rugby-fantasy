"use client";
// components/PlayerCompare.tsx
// Compare two players side by side (Ethan, 16 Nov 2026), from any page: this week (expected
// points, opponent, status), who owns them in your league, their last 5 games, and every stat
// with the better number highlighted (per game / total / per 80; whole season, last 3 / 5
// rounds or one round; this season or last). Opened with lib/players/compareStore.ts; mounted
// once for the whole site in app/layout.tsx.
import React, { useMemo, useState } from "react";
import { useCompareStore } from "@/lib/players/compareStore";
import { usePlayersStore, type PlayerFromSheet } from "@/lib/players/store";
import { useLeagueStore } from "@/lib/league/store";
import { statSeasons, useLeagueOwners, useSeasonStatRows } from "@/lib/players/useStatRows";
import { playerRoundRows } from "@/lib/players/roundIndex";
import {
  aggregatePlayer, better, COUNTING_STATS, roundsForRange, roundsWithStats, STAT_GROUPS, STAT_LABELS, statValue,
  type PlayerAgg, type StatColumn, type StatRange,
} from "@/lib/players/statsHub";
import { activeScoringRules } from "@/lib/scoring";
import { formatStatView, useStatView } from "@/lib/players/statView";
import { StatViewToggle } from "@/components/StatViewToggle";
import { StatusTag } from "@/components/StatusTag";
import { formatProjection, projectionFor, useProjections } from "@/lib/projections/useProjections";
import { currentSeasonYear, fixturesForWeek, getSeason, statsSeasonYear, weekLabel } from "@/lib/season";
import { teamCodeFromName } from "@/lib/status/articles";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";
import { positionsLabel } from "@/lib/players/positions";

const TEAM_NAME: Record<string, string> = {
  BLU: "Blues", BRU: "Brumbies", CHI: "Chiefs", CRU: "Crusaders", DRU: "Drua", FOR: "Force",
  HIG: "Highlanders", HUR: "Hurricanes", MOA: "Moana", MOP: "Moana", RED: "Reds", WAR: "Waratahs",
};
const COLOURS = ["rgb(13,148,136)", "rgb(217,119,6)"] as const;

function jerseySrc(code: string) {
  const j = JERSEYS[String(code ?? "").toUpperCase()];
  return j?.front ?? j?.single ?? j?.angle ?? JERSEY_PLACEHOLDER;
}

/** "v Chiefs (H)" for this week's game, "Bye", or null if unknown. */
function opponentText(teamCode: string, week: number | null): string | null {
  if (!week) return null;
  const season = getSeason(currentSeasonYear());
  const mine = normalizeTeamCode(teamCode);
  for (const f of fixturesForWeek(season, week)) {
    const h = normalizeTeamCode(teamCodeFromName(f.homeTeam) ?? f.homeTeam);
    const a = normalizeTeamCode(teamCodeFromName(f.awayTeam) ?? f.awayTeam);
    if (h === mine) return `v ${TEAM_NAME[a] ?? f.awayTeam}${f.neutralVenue ? "" : " (H)"}`;
    if (a === mine) return `v ${TEAM_NAME[h] ?? f.homeTeam}${f.neutralVenue ? "" : " (A)"}`;
  }
  return "Bye";
}

const selectStyle: React.CSSProperties = {
  height: 32,
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.15)",
  padding: "0 8px",
  fontSize: 12,
  fontWeight: 800,
  color: "#0f172a",
  background: "white",
  minWidth: 0,
};

function PlayerPicker({ players, onPick, exclude }: { players: PlayerFromSheet[]; onPick: (id: string) => void; exclude: string | null }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return players
      .filter((p) => p.id !== exclude && `${p.firstName} ${p.lastName}`.toLowerCase().includes(s))
      .sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999))
      .slice(0, 8);
  }, [q, players, exclude]);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a player to compare"
        aria-label="Search a player to compare"
        style={{ ...selectStyle, width: "100%", boxSizing: "border-box", height: 36, padding: "0 10px" }}
      />
      {matches.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p.id)}
          style={{ textAlign: "left", border: "none", borderRadius: 10, background: "rgba(15,23,42,0.05)", padding: "7px 10px", cursor: "pointer", color: "#0f172a", fontSize: 12, fontWeight: 800 }}
        >
          {p.firstName} {p.lastName} <span style={{ opacity: 0.6 }}>· {TEAM_NAME[p.teamCode] ?? p.teamCode} · {positionsLabel(p)}</span>
        </button>
      ))}
      {q.trim().length >= 2 && !matches.length ? <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6 }}>No players found.</div> : null}
    </div>
  );
}

function LastFive({ logs, names }: { logs: Array<Array<{ round: number; points: number }>>; names: string[] }) {
  const max = Math.max(10, ...logs.flat().map((g) => g.points));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {logs.map((log, i) => {
        const last = log.slice(-5);
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 8, alignItems: "end" }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: COLOURS[i], overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", alignSelf: "center" }}>{names[i]}</div>
            {last.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, alignItems: "end", height: 56 }}>
                {Array.from({ length: 5 }, (_, k) => last[k - (5 - last.length)] ?? null).map((g, k) => (
                  <div key={k} title={g ? `Round ${g.round}: ${g.points} pts` : undefined} style={{ display: "grid", alignItems: "end", height: "100%" }}>
                    {g ? (
                      <div style={{ display: "grid", gap: 1, justifyItems: "center" }}>
                        <span style={{ fontSize: 9, fontWeight: 900 }}>{Math.round(g.points)}</span>
                        <div style={{ width: "100%", height: Math.max(3, (g.points / max) * 38), borderRadius: 4, background: COLOURS[i] }} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, alignSelf: "center" }}>No games in this range.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PlayerCompareHost() {
  const open = useCompareStore((s) => s.open);
  if (!open) return null;
  return <PlayerCompare />;
}

function PlayerCompare() {
  const { ids, setSlot, swap, close } = useCompareStore();
  const players = usePlayersStore((s) => s.players);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const leagues = useLeagueStore((s) => s.leagues);
  const league = (leagues ?? []).find((l) => l.id === activeLeagueId) ?? null;
  const owners = useLeagueOwners(league?.id ?? null);
  const proj = useProjections(league?.id ?? null, "current");

  const [season, setSeason] = useState<number>(() => statsSeasonYear());
  const [range, setRange] = useState<StatRange>({ kind: "season" });
  const [view] = useStatView();
  const { rows, loading } = useSeasonStatRows(season);
  const rounds = useMemo(() => roundsWithStats(rows), [rows]);
  const roundSet = useMemo(() => roundsForRange(range, rounds), [range, rounds]);

  const pair = ids.map((id) => (id ? players.find((p) => p.id === id) ?? null : null)) as [PlayerFromSheet | null, PlayerFromSheet | null];
  const rules = activeScoringRules();
  const aggs = pair.map((p) => (p ? aggregatePlayer(playerRoundRows(rows, p.id), p, rules, roundSet) : null)) as [PlayerAgg | null, PlayerAgg | null];
  // last 5 games always from the whole of the chosen season
  const seasonLogs = pair.map((p) => (p ? aggregatePlayer(playerRoundRows(rows, p.id), p, rules, null).log : []));

  const ownerText = (p: PlayerFromSheet | null) => {
    if (!p || !league) return null;
    const t = owners?.owner.get(p.id);
    if (t) return league.teams.find((x) => x.id === t)?.name ?? "Owned";
    if (!owners) return "…";
    return owners.onWaivers.has(p.id) ? "On waivers" : "Free agent";
  };

  const rangeValue = range.kind === "season" ? "season" : range.kind === "last" ? `last${range.n}` : `round${range.round}`;
  const seasonCfg = getSeason(season);
  const rowsToShow: Array<{ col: StatColumn; label: string; group?: string }> = [
    { col: "points", label: "Fantasy points" },
    { col: "games", label: "Games" },
    { col: "minutesPlayed", label: "Minutes" },
    ...STAT_GROUPS.flatMap((g) => g.keys.filter((k) => COUNTING_STATS.includes(k)).map((k, i) => ({ col: k as StatColumn, label: STAT_LABELS[k].long, group: i === 0 ? g.label : undefined }))),
  ];

  const header = (p: PlayerFromSheet | null, i: 0 | 1) => (
    <div style={{ display: "grid", justifyItems: "center", gap: 3, textAlign: "center", minWidth: 0, borderTop: `4px solid ${COLOURS[i]}`, paddingTop: 8 }}>
      {p ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={jerseySrc(p.teamCode)} alt="" style={{ width: 52, height: 52, objectFit: "contain" }} />
          <div style={{ fontSize: 13, fontWeight: 950, lineHeight: 1.15 }}>
            {p.firstName} {p.lastName} <StatusTag player={p} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.65 }}>
            {TEAM_NAME[p.teamCode] ?? p.teamCode} · {positionsLabel(p)}
          </div>
          {league ? <div style={{ fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 999, background: "rgba(15,23,42,0.07)" }}>{ownerText(p)}</div> : null}
          <button onClick={() => setSlot(i, null)} style={{ border: "none", background: "transparent", color: "#0f172a", fontSize: 11, fontWeight: 800, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            Change
          </button>
        </>
      ) : (
        <div style={{ width: "100%" }}>
          <PlayerPicker players={players} onPick={(id) => setSlot(i, id)} exclude={ids[i === 0 ? 1 : 0]} />
        </div>
      )}
    </div>
  );

  const week = proj?.week ?? null;
  const thisWeek = (p: PlayerFromSheet | null) => {
    if (!p) return null;
    const pr = projectionFor(proj, p.id);
    return { proj: pr ? formatProjection(pr.pts) : "–", opp: opponentText(p.teamCode, week), role: pr?.role ?? null };
  };
  const tw = pair.map(thisWeek);
  const roleText = (r: string | null) => (r === "starting" ? "Starting" : r === "bench" ? "Bench" : r === "out" ? "Out" : r === "expected" ? "Team list not out" : "–");

  const cell: React.CSSProperties = { padding: "6px 8px", fontSize: 12, fontWeight: 800, textAlign: "center" };
  const best = (col: StatColumn, which: "a" | "b") => {
    const v = [statValue(aggs[0], col, view), statValue(aggs[1], col, view)];
    return better(col, v[0], v[1]) === which;
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10050 }} role="dialog" aria-label="Compare players">
      <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "94%",
          maxWidth: 520,
          maxHeight: "92svh",
          overflowY: "auto",
          borderRadius: 16,
          background: "white",
          color: "#0f172a",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "white", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
          <div style={{ fontSize: 15, fontWeight: 950, flex: 1 }}>Compare players</div>
          {pair[0] && pair[1] ? (
            <button onClick={swap} aria-label="Swap sides" title="Swap sides" style={{ border: "none", background: "rgba(15,23,42,0.06)", borderRadius: 999, height: 30, padding: "0 10px", fontWeight: 900, cursor: "pointer", color: "#0f172a" }}>
              ⇄
            </button>
          ) : null}
          <button onClick={close} aria-label="Close" style={{ border: "none", background: "rgba(15,23,42,0.06)", borderRadius: 999, width: 30, height: 30, fontWeight: 900, cursor: "pointer", color: "#0f172a" }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {header(pair[0], 0)}
            {header(pair[1], 1)}
          </div>

          {pair[0] || pair[1] ? (
            <>
              {/* This week */}
              <section style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.6 }}>
                  This week{week ? ` · ${weekLabel(getSeason(currentSeasonYear()), week)}` : ""}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 12, overflow: "hidden" }}>
                  {[
                    { label: "Expected points", get: (t: (typeof tw)[number]) => t?.proj ?? "" },
                    { label: "Opponent", get: (t: (typeof tw)[number]) => t?.opp ?? "–" },
                    { label: "Team list", get: (t: (typeof tw)[number]) => (t ? roleText(t.role) : "") },
                  ].map((r, k) => (
                    <React.Fragment key={r.label}>
                      <div style={{ ...cell, borderTop: k ? "1px solid rgba(15,23,42,0.06)" : undefined }}>{r.get(tw[0])}</div>
                      <div style={{ ...cell, fontSize: 10, opacity: 0.6, borderTop: k ? "1px solid rgba(15,23,42,0.06)" : undefined }}>{r.label}</div>
                      <div style={{ ...cell, borderTop: k ? "1px solid rgba(15,23,42,0.06)" : undefined }}>{r.get(tw[1])}</div>
                    </React.Fragment>
                  ))}
                </div>
              </section>

              {/* Range */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <select aria-label="Season" value={season} onChange={(e) => { setSeason(Number(e.target.value)); setRange({ kind: "season" }); }} style={selectStyle}>
                  {statSeasons().map((y) => <option key={y} value={y}>{y} season</option>)}
                </select>
                <select
                  aria-label="Rounds"
                  value={rangeValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRange(v === "season" ? { kind: "season" } : v.startsWith("last") ? { kind: "last", n: Number(v.slice(4)) } : { kind: "round", round: Number(v.slice(5)) });
                  }}
                  style={selectStyle}
                >
                  <option value="season">Whole season</option>
                  <option value="last3">Last 3 rounds</option>
                  <option value="last5">Last 5 rounds</option>
                  {rounds.map((r) => <option key={r} value={`round${r}`}>{weekLabel(seasonCfg, r)}</option>)}
                </select>
                <StatViewToggle />
              </div>

              {/* Last 5 games */}
              <section style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.6 }}>Last 5 games ({season})</div>
                <LastFive logs={seasonLogs} names={pair.map((p) => (p ? p.lastName : "—"))} />
              </section>

              {/* Every stat */}
              <section style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.6 }}>
                  Stats {loading ? "· loading…" : ""}
                </div>
                <div style={{ border: "1px solid rgba(15,23,42,0.08)", borderRadius: 12, overflow: "hidden" }}>
                  {rowsToShow.map((r, k) => (
                    <React.Fragment key={r.col}>
                      {r.group ? (
                        <div style={{ padding: "5px 8px", fontSize: 10, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase", background: "rgba(15,23,42,0.05)" }}>{r.group}</div>
                      ) : null}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr", borderTop: k && !r.group ? "1px solid rgba(15,23,42,0.06)" : undefined }}>
                        {(["a", "b"] as const).map((w, i) => {
                          const v = statValue(aggs[i], r.col, view);
                          const won = best(r.col, w);
                          const text = r.col === "games" ? (v == null ? "–" : String(v)) : formatStatView(v, view);
                          const el = (
                            <div key={w} style={{ ...cell, background: won ? `${COLOURS[i].replace("rgb", "rgba").replace(")", ",0.16)")}` : undefined, color: won ? COLOURS[i] : undefined, fontWeight: won ? 950 : 700 }}>
                              {pair[i] ? text : ""}
                            </div>
                          );
                          return i === 0 ? (
                            <React.Fragment key={w}>
                              {el}
                              <div style={{ ...cell, fontSize: 11, fontWeight: 800, opacity: 0.7 }}>{r.label}</div>
                            </React.Fragment>
                          ) : (
                            el
                          );
                        })}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.55 }}>
                  The better number is highlighted (fewer is better for missed tackles, penalties, errors, cards and missed kicks). Points use {league ? "your league's" : "Standard"} scoring.
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
