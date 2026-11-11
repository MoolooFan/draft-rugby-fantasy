"use client";

// Player card > Transactions tab (C3): the player's moves in this league, newest first.
// Player card > AI Coach tab (C4): a placeholder until the coach is designed with Ethan.

import React, { useEffect, useState } from "react";
import { TabCard } from "./helpers";
import type { HistoryEvent } from "@/lib/league/playerHistory";

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
                <div style={{ fontSize: 12, fontWeight: 900 }}>{l.title}</div>
                {l.detail ? <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.65 }}>{l.detail}</div> : null}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.55, whiteSpace: "nowrap" }}>{when(e.atMs)}</div>
            </div>
          </TabCard>
        );
      })}
    </div>
  );
}

export function CoachTab() {
  return (
    <TabCard>
      <div style={{ fontSize: 13, fontWeight: 900 }}>AI Coach</div>
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, opacity: 0.7, lineHeight: 1.45 }}>
        Coming soon: a season outlook for this player, plus notes after each game and when team sheets are named.
      </div>
    </TabCard>
  );
}
