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

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** A box's top line: what it is, then (right) the points, trend and verdict. */
function BoxHead({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={smallLabel}>{label}</span>
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

const Trend = ({ trend }: { trend: string | null }) =>
  trend === "up" ? <span title="Trending up" style={{ color: "#16a34a", fontWeight: 700 }}>▲</span> : trend === "down" ? <span title="Trending down" style={{ color: "#dc2626", fontWeight: 700 }}>▼</span> : null;

function Factors({ factors }: { factors: string[] | null }) {
  if (!factors?.length) return null;
  return (
    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
      {factors.map((f) => (
        <span key={f} style={{ fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "2px 8px", background: "rgba(15,23,42,0.07)" }}>
          {f}
        </span>
      ))}
    </div>
  );
}

const headlineStyle: React.CSSProperties = { marginTop: 4, fontSize: 13, fontWeight: 700, lineHeight: 1.3 };
const bodyStyle: React.CSSProperties = { marginTop: 4, fontSize: 12, fontWeight: 600, lineHeight: 1.45 };

/** The week a note's "next week" part is about: the game after an after-the-game note, else the note's own week. */
const nextWeekOf = (n: CoachNote) => (n.week == null ? null : n.kind === "post_game" ? n.week + 1 : n.week);

// Player card > AI Coach tab (Ethan, 17 + 27 Nov 2026; lib/coach), each in its own box:
//   1. the newest season outlook
//   2. Next week: the newest update's look at his next game, with his projected points for it
//      (the projection only shows here)
//   3. every update, newest first (after the game with what he scored, team lists, status, news)
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
  const updates = data.notes.filter((n) => n.kind !== "outlook");
  // only the newest update's look ahead (an older one could be out of date)
  const latest = updates[0] ?? null;
  const next = latest?.next_week ? latest : null;
  const nextWeek = next ? nextWeekOf(next) : null;
  const projected = next ? num(next.projected) : null;
  // the year goes on the labels when the notes cover more than one season
  const manySeasons = new Set(data.notes.map((n) => n.season)).size > 1;
  const round = (week: number | null, season: number) => (week ? `${roundLabel(week, season)}${manySeasons ? ` ${season}` : ""}` : "");

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {outlook ? (
        <TabCard>
          <BoxHead label={`Season outlook ${outlook.season} · ${when(Date.parse(outlook.created_at))}`} right={<><Trend trend={outlook.trend} /><VerdictChip verdict={outlook.verdict} /></>} />
          <div style={headlineStyle}>{outlook.headline}</div>
          <div style={bodyStyle}>{outlook.body}</div>
          <Factors factors={outlook.factors} />
        </TabCard>
      ) : null}

      {next ? (
        <TabCard>
          <BoxHead
            label={`Next week${nextWeek ? ` · ${round(nextWeek, next.season)}` : ""}`}
            right={<>{projected != null ? <span style={pill("rgba(37,99,235,0.1)", "#1d4ed8")}>Projected {fmt(projected)}</span> : null}<VerdictChip verdict={next.verdict} /></>}
          />
          <div style={bodyStyle}>{next.next_week}</div>
        </TabCard>
      ) : null}

      {updates.map((n) => {
        const scored = n.kind === "post_game" ? num(n.scored) : null;
        const label = [KIND_LABEL[n.kind] ?? n.kind, round(n.week, n.season), when(Date.parse(n.created_at))].filter(Boolean).join(" · ");
        return (
          <TabCard key={n.id}>
            <BoxHead label={label} right={<>{scored != null ? <span style={pill("rgba(22,163,74,0.12)", "#15803d")}>Scored {fmt(scored)}</span> : null}<Trend trend={n.trend} /></>} />
            <div style={headlineStyle}>{n.headline}</div>
            <div style={bodyStyle}>{n.body}</div>
            <Factors factors={n.factors} />
          </TabCard>
        );
      })}
    </div>
  );
}
