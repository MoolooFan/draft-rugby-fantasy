"use client";
// components/CoachFeed.tsx
// Dashboard card: the AI coach's latest notes (last 10 days) about the players on your team
// (lib/coach). Tap one to open the player's card on the AI Coach tab.
import React, { useEffect, useState } from "react";
import { VerdictChip } from "@/components/playerCard/HistoryTab";

type FeedNote = { id: string; player_id: string; kind: string; headline: string; verdict: string | null; created_at: string };

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function CoachFeed({
  leagueId,
  nameOf,
  onOpen,
  style,
}: {
  leagueId: string;
  nameOf: (playerId: string) => string | null;
  onOpen: (playerId: string) => void;
  style?: React.CSSProperties;
}) {
  const [data, setData] = useState<{ leagueId: string; notes: FeedNote[] } | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/coach/feed?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => !cancelled && j?.ok && setData({ leagueId, notes: j.notes ?? [] }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const notes = data?.leagueId === leagueId ? data.notes : null;
  if (!notes?.length) return null; // nothing yet: no card
  const shown = more ? notes : notes.slice(0, 4);

  return (
    <div style={style}>
      <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Coach News · your players</div>
      <div style={{ display: "grid", gap: 6 }}>
        {shown.map((n) => (
          <button
            key={n.id}
            onClick={() => onOpen(n.player_id)}
            style={{ textAlign: "left", border: "none", borderRadius: 12, background: "rgba(255,255,255,0.92)", color: "#0f172a", padding: "8px 10px", cursor: "pointer", display: "grid", gap: 3 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(n.player_id) ?? "Player"}</span>
              <VerdictChip verdict={n.verdict} />
              <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.55, whiteSpace: "nowrap" }}>{ago(n.created_at)}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>{n.headline}</div>
          </button>
        ))}
      </div>
      {notes.length > 4 ? (
        <button onClick={() => setMore((m) => !m)} style={{ marginTop: 6, border: "none", background: "transparent", color: "white", fontSize: 11, fontWeight: 900, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
          {more ? "Show fewer" : `Show all ${notes.length}`}
        </button>
      ) : null}
    </div>
  );
}
