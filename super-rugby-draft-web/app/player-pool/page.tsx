"use client";

// Player Pool (plan item E2): for people who haven't joined a league yet - browse and filter
// the season's players and open their player cards. No adding or claiming (that's on the
// Transactions page once you're in a league).

import React, { useMemo, useState } from "react";

import { AppMenu } from "@/components/AppMenu";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { StatusTag } from "@/components/StatusTag";
import { useLeagueStore } from "@/lib/league/store";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { usePlayerPool } from "@/lib/players/pool";
import { usePlayersStore, type PlayerFromSheet } from "@/lib/players/store";
import { playerRoundRows } from "@/lib/players/roundIndex";
import { canPlayPosition, positionsLabel } from "@/lib/players/positions";
import { isFrontRow, playedInRound, playerPoints, roundPoints, statCountsFromRow } from "@/lib/scoring";
import { TEAM_OPTIONS } from "@/lib/constants";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";

type SortKey = "total" | "avg" | "rank";
const POSITIONS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"];
const PAGE = 60;

function jerseySrc(code: string) {
  const j = JERSEYS[String(code ?? "").toUpperCase()];
  return j?.angle ?? j?.single ?? j?.front ?? JERSEY_PLACEHOLDER;
}

export default function PlayerPoolPage() {
  useRequireSession();

  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  const players = usePlayerPool();
  const statRows = usePlayersStore((s) => s.statRows);
  const statSeason = usePlayersStore((s) => s.statSeason);

  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [pos, setPos] = useState("");
  const [sort, setSort] = useState<SortKey>("total");
  const [shown, setShown] = useState(PAGE);
  const [card, setCard] = useState<PlayerFromSheet | null>(null);

  // season points and games for every player (stat rows are grouped by player once)
  const totals = useMemo(() => {
    const m = new Map<string, { total: number | null; games: number }>();
    for (const p of players) {
      let total = 0;
      let games = 0;
      for (const r of playerRoundRows(statRows, p.id)) {
        const counts = statCountsFromRow(r);
        if (!playedInRound(counts)) continue;
        total += playerPoints(counts, isFrontRow(p));
        games++;
      }
      m.set(p.id, { total: games ? roundPoints(total) : null, games });
    }
    return m;
  }, [players, statRows]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = players.filter((p) => {
      if (team && String(p.teamCode).toUpperCase() !== team) return false;
      if (pos && !canPlayPosition(p, pos)) return false;
      if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (p: PlayerFromSheet) => {
      const t = totals.get(p.id);
      if (sort === "total") return t?.total ?? -1;
      if (sort === "avg") return t && t.games ? (t.total ?? 0) / t.games : -1;
      return -(p.draftRank ?? 9999);
    };
    return out.sort((a, b) => val(b) - val(a) || String(a.lastName).localeCompare(String(b.lastName)));
  }, [players, search, team, pos, sort, totals]);

  const selectStyle: React.CSSProperties = {
    height: 34,
    borderRadius: 10,
    border: "none",
    outline: "none",
    padding: "0 8px",
    fontSize: 12,
    fontWeight: 700,
    color: "#0f172a",
    background: "rgba(255,255,255,0.92)",
    minWidth: 0,
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "white", fontSize: 36, fontWeight: 900, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
          <div style={{ flex: 1 }} />
        </div>

        <div style={{ marginTop: 14, borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14, backdropFilter: "blur(10px)", boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: 22 }}>Player Pool</div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
            Browse the players. Join a league to sign them.
          </div>

          <input
            id="pool-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }}
            placeholder="Search players"
            style={{ ...selectStyle, width: "100%", marginTop: 12, padding: "0 12px", boxSizing: "border-box" }}
          />
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <select id="pool-team" value={team} onChange={(e) => { setTeam(e.target.value); setShown(PAGE); }} style={selectStyle} aria-label="Team">
              <option value="">All teams</option>
              {TEAM_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select id="pool-pos" value={pos} onChange={(e) => { setPos(e.target.value); setShown(PAGE); }} style={selectStyle} aria-label="Position">
              <option value="">All positions</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select id="pool-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={selectStyle} aria-label="Sort by">
              <option value="total">Total pts</option>
              <option value="avg">Avg pts</option>
              <option value="rank">Draft rank</option>
            </select>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, fontWeight: 800, opacity: 0.85 }}>
            {list.length} players · points from {statSeason}
          </div>
        </div>

        <div style={{ marginTop: 12, borderRadius: 18, overflow: "hidden", background: "rgba(255,255,255,0.92)", color: "#0f172a", boxShadow: "0 12px 30px rgba(0,0,0,0.18)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "34px 1fr 44px 44px", gap: 8, padding: "8px 10px", fontSize: 10, fontWeight: 900, opacity: 0.6 }}>
            <span />
            <span>Player</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span style={{ textAlign: "right" }}>Avg</span>
          </div>
          {list.slice(0, shown).map((p) => {
            const t = totals.get(p.id);
            const avg = t && t.games ? (t.total ?? 0) / t.games : null;
            return (
              <button
                key={p.id}
                onClick={() => setCard(p)}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "34px 1fr 44px 44px",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 10px",
                  border: "none",
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  background: "transparent",
                  color: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <img src={jerseySrc(p.teamCode)} alt="" style={{ width: 30, height: 30, objectFit: "contain", display: "block" }} draggable={false} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.firstName?.[0]}. {p.lastName}
                    </span>
                    <StatusTag player={p} />
                  </span>
                  <span style={{ display: "block", fontSize: 11, fontWeight: 800, opacity: 0.65 }}>
                    {String(p.teamCode).toUpperCase()} · {positionsLabel(p)}
                  </span>
                </span>
                <span style={{ textAlign: "right", fontSize: 12, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{t?.total ?? "-"}</span>
                <span style={{ textAlign: "right", fontSize: 12, fontWeight: 800, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{avg != null ? avg.toFixed(1) : "-"}</span>
              </button>
            );
          })}
          {list.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>{players.length ? "No players match." : "Loading players…"}</div>
          ) : null}
          {shown < list.length ? (
            <button
              onClick={() => setShown((n) => n + PAGE)}
              style={{ width: "100%", height: 40, border: "none", borderTop: "1px solid rgba(0,0,0,0.08)", background: "transparent", fontSize: 12, fontWeight: 900, color: "#0f172a", cursor: "pointer" }}
            >
              Show more
            </button>
          ) : null}
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues as any}
        activeLeagueId={activeLeagueId as any}
        setActiveLeague={setActiveLeague as any}
        activeItem="Player Pool"
      />

      {card ? <PlayerCardModal player={card as any} onClose={() => setCard(null)} teamLabel="Free agent" hideActions /> : null}
    </main>
  );
}
