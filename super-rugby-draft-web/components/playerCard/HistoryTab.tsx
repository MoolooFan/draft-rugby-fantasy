"use client";

// Player card > Transactions tab (C3): the player's moves in this league, newest first.
// Player card > AI Coach tab (C4): the AI coach's notes about the player (lib/coach).

import React, { useEffect, useState } from "react";
import { TabCard } from "./helpers";
import type { HistoryEvent } from "@/lib/league/playerHistory";
import { roundLabel } from "@/lib/season";

type Loaded = { events: HistoryEvent[]; teamNames: Record<string, string>; playerNames: Record<string, string> };

function when(ms: number) {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function HistoryTab({ leagueId, playerId }: { leagueId: string; playerId: string }) {
  const [data, setData] = useState<(Loaded & { key: string }) | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  const key = `${leagueId}|${playerId}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/players/history?leagueId=${encodeURIComponent(leagueId)}&playerId=${encodeURIComponent(playerId)}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.ok) setError({ key, text: j?.error ?? "Couldn't load this player's transactions" });
        else setData({ key, events: j.events ?? [], teamNames: j.teamNames ?? {}, playerNames: j.playerNames ?? {} });
      })
      .catch(() => !cancelled && setError({ key, text: "Couldn't load this player's transactions" }));
    return () => {
      cancelled = true;
    };
  }, [leagueId, playerId, key]);

  if (error?.key === key) return <TabCard><div style={{ color: "#b91c1c" }}>{error.text}</div></TabCard>;
  if (data?.key !== key) return <TabCard><div style={{ opacity: 0.7 }}>Loading…</div></TabCard>;
  if (!data.events.length) return <TabCard><div style={{ opacity: 0.7 }}>No transactions in this league yet.</div></TabCard>;

  const team = (id: string) => data.teamNames[id] ?? "a team that has left";
  const player = (id: string | null) => (id ? data.playerNames[id] ?? id : null);

  const line = (e: HistoryEvent): { title: string; detail: string | null; color: string } => {
    switch (e.kind) {
      case "drafted":
        return { title: `Drafted by ${team(e.teamId)}`, detail: `Round ${e.round}, pick ${e.pick}`, color: "#2563eb" };
      case "added":
        return { title: `Added by ${team(e.teamId)}`, detail: e.droppedId ? `Free agent · dropped ${player(e.droppedId)}` : "Free agent", color: "#16a34a" };
      case "claimed":
        return { title: `Claimed by ${team(e.teamId)}`, detail: e.droppedId ? `Waivers · dropped ${player(e.droppedId)}` : "Waivers", color: "#16a34a" };
      case "dropped":
        return { title: `Dropped by ${team(e.teamId)}`, detail: e.forId ? `For ${player(e.forId)}` : null, color: "#dc2626" };
      case "traded":
        return { title: `Traded to ${team(e.toTeamId)}`, detail: `From ${team(e.fromTeamId)}`, color: "#7c3aed" };
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {data.events.map((e, i) => {
        const l = line(e);
        return (
          <TabCard key={i}>
            <div style={{ display: "grid", gridTemplateColumns: "6px 1fr auto", gap: 10, alignItems: "center" }}>
              <span style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: l.color }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{l.title}</div>
                {l.detail ? <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>{l.detail}</div> : null}
              </div>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.55, whiteSpace: "nowrap" }}>{when(e.atMs)}</div>
            </div>
          </TabCard>
        );
      })}
    </div>
  );
}

type CoachNote = {
  id: string;
  season: number;
  kind: "outlook" | "post_game" | "team_list" | "status" | "news";
  week: number | null;
  headline: string;
  body: string;
  next_week: string;
  verdict: string | null;
  trend: string | null;
  factors: string[] | null;
  /** his projected points for the note's week when it was written (none for outlooks) */
  projected?: number | null;
  /** after a game: what he scored */
  scored?: number | null;
  created_at: string;
};

const KIND_LABEL: Record<CoachNote["kind"], string> = {
  outlook: "Season outlook",
  post_game: "After the game",
  team_list: "Team lists",
  status: "Status update",
  news: "News",
};

const VERDICT: Record<string, { label: string; bg: string }> = {
  must_start: { label: "Must start", bg: "#15803d" },
  start: { label: "Start", bg: "#16a34a" },
  borderline: { label: "Borderline", bg: "#ca8a04" },
  bench: { label: "Bench him", bg: "#ea580c" },
  pickup: { label: "Pick up", bg: "#2563eb" },
  hold: { label: "Hold", bg: "#64748b" },
  avoid: { label: "Avoid", bg: "#dc2626" },
  monitor: { label: "Monitor", bg: "#7c3aed" },
};

export function VerdictChip({ verdict }: { verdict: string | null | undefined }) {
  const v = verdict ? VERDICT[verdict] : null;
  if (!v) return null;
  return <span style={{ fontSize: 10, fontWeight: 700, color: "white", background: v.bg, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>{v.label}</span>;
}

const smallLabel: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.6 };
const pill = (bg: string, color: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px", background: bg, color, whiteSpace: "nowrap" });
const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

/** One note: what it is and when, the verdict, then the note itself. */
function CoachNoteView({ n, label }: { n: CoachNote; label: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={smallLabel}>{label}</span>
        <span style={{ flex: 1 }} />
        {n.trend === "up" ? <span title="Trending up" style={{ color: "#16a34a", fontWeight: 700 }}>▲</span> : n.trend === "down" ? <span title="Trending down" style={{ color: "#dc2626", fontWeight: 700 }}>▼</span> : null}
        <VerdictChip verdict={n.verdict} />
      </div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{n.headline}</div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>{n.body}</div>
      {n.next_week ? (
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>
          <b>Next week: </b>
          {n.next_week}
        </div>
      ) : null}
      {n.factors?.length ? (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {n.factors.map((f) => (
            <span key={f} style={{ fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "2px 8px", background: "rgba(15,23,42,0.07)" }}>
              {f}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type WeekGroup = { key: string; season: number; week: number | null; notes: CoachNote[] };

/** Updates grouped by week, newest week first (notes come newest first). */
function byWeek(notes: CoachNote[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  const at = new Map<string, WeekGroup>();
  for (const n of notes) {
    const key = `${n.season}|${n.week ?? "-"}`;
    let g = at.get(key);
    if (!g) {
      g = { key, season: n.season, week: n.week, notes: [] };
      at.set(key, g);
      groups.push(g);
    }
    g.notes.push(n);
  }
  return groups;
}

/** The week's projection (the newest one written before the game, else the one with the game) and what he scored. */
function weekPoints(notes: CoachNote[]): { projected: number | null; scored: number | null } {
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const before = notes.filter((n) => n.kind !== "post_game").map((n) => num(n.projected)).find((v) => v != null);
  const games = notes.filter((n) => n.kind === "post_game");
  const after = games.map((n) => num(n.projected)).find((v) => v != null);
  const scores = games.map((n) => num(n.scored)).filter((v): v is number => v != null);
  return { projected: before ?? after ?? null, scored: scores.length ? scores.reduce((a, b) => a + b, 0) : null };
}

// Player card > AI Coach tab (Ethan, 17 + 27 Nov 2026; lib/coach): the newest season outlook in its
// own box, then a box for each week's updates (newest week first) with his projected points for
// that week at the time, and what he scored once the game's done.
export function CoachTab({ playerId }: { playerId: string }) {
  const [data, setData] = useState<{ key: string; notes: CoachNote[] } | null>(null);
  const [error, setError] = useState<{ key: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/coach/notes?playerId=${encodeURIComponent(playerId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j?.ok) setError({ key: playerId, text: j?.error ?? "Couldn't load the coach's notes" });
        else setData({ key: playerId, notes: j.notes ?? [] });
      })
      .catch(() => !cancelled && setError({ key: playerId, text: "Couldn't load the coach's notes" }));
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (error?.key === playerId) return <TabCard><div style={{ color: "#b91c1c" }}>{error.text}</div></TabCard>;
  if (data?.key !== playerId) return <TabCard><div style={{ opacity: 0.7 }}>Loading…</div></TabCard>;
  if (!data.notes.length) return <TabCard><div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>No scouting completed</div></TabCard>;

  const outlook = data.notes.find((n) => n.kind === "outlook") ?? null;
  const weeks = byWeek(data.notes.filter((n) => n.kind !== "outlook"));
  // the year goes on a week's box when the notes cover more than one season
  const manySeasons = new Set(data.notes.map((n) => n.season)).size > 1;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {outlook ? (
        <TabCard>
          <CoachNoteView n={outlook} label={`Season outlook ${outlook.season} · ${when(Date.parse(outlook.created_at))}`} />
        </TabCard>
      ) : null}
      {weeks.map((g) => {
        const pts = weekPoints(g.notes);
        return (
          <TabCard key={g.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingBottom: 8, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 800 }}>{g.week ? roundLabel(g.week, g.season) : "Updates"}{manySeasons ? ` · ${g.season}` : ""}</span>
              <span style={{ flex: 1 }} />
              {pts.projected != null ? <span style={pill("rgba(37,99,235,0.1)", "#1d4ed8")}>Projected {fmt(pts.projected)}</span> : null}
              {pts.scored != null ? <span style={pill("rgba(22,163,74,0.12)", "#15803d")}>Scored {fmt(pts.scored)}</span> : null}
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              {g.notes.map((n, i) => (
                <div key={n.id} style={i ? { paddingTop: 10, borderTop: "1px solid rgba(15,23,42,0.06)" } : undefined}>
                  <CoachNoteView n={n} label={`${KIND_LABEL[n.kind] ?? n.kind} · ${when(Date.parse(n.created_at))}`} />
                </div>
              ))}
            </div>
          </TabCard>
        );
      })}
    </div>
  );
}
