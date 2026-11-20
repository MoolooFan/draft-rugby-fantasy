"use client";
// components/WeekGamesCard.tsx
// Dashboard: the round's Super Rugby games and where each one's points stand (Ethan, 20 Nov
// 2026): Not started / Live / Complete / Finalised (lib/stats/gameStatus.ts), then whether the
// round's wins and losses have gone into the league table. Data: /api/fixtures/week-status.
import React, { useEffect, useState } from "react";
import { GAME_STATUS_LABEL, type GameStatus } from "@/lib/stats/gameStatus";
import { card, ink, line, muted, soft } from "@/lib/ui/theme";

type WeekGames = {
  week: number;
  label: string;
  games: Array<{ id: string; home: string; away: string; kickoffAt: string; status: GameStatus }>;
  tableUpdated: boolean;
};

const PILL: Record<GameStatus, { bg: string; fg: string }> = {
  not_started: { bg: "#e2e8f0", fg: "#475569" },
  live: { bg: "#fee2e2", fg: "#b91c1c" },
  complete: { bg: "#fef3c7", fg: "#92400e" },
  finalised: { bg: "#dcfce7", fg: "#15803d" },
};

function Pill({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, minWidth: 86, height: 24, padding: "0 8px", borderRadius: 999, background: bg, color: fg, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
      {children}
    </span>
  );
}

const kickoffText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-NZ", { weekday: "short", hour: "numeric", minute: "2-digit" });
};

export function WeekGamesCard({ leagueId, week }: { leagueId: string | null; week: number }) {
  const [data, setData] = useState<{ key: string; value: WeekGames } | null>(null);
  const key = `${leagueId ?? ""}|${week}`;

  useEffect(() => {
    if (week < 1) return;
    let cancelled = false;
    const load = () =>
      fetch(`/api/fixtures/week-status?week=${week}${leagueId ? `&leagueId=${encodeURIComponent(leagueId)}` : ""}`, { cache: "no-store", credentials: "include" })
        .then((r) => r.json())
        .then((j) => !cancelled && j?.ok && setData({ key, value: j }))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000); // statuses move on while the page is open
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [key, leagueId, week]);

  const d = data?.key === key ? data.value : null;
  if (week < 1 || !d || !d.games.length) return null;

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{d.label} Games</div>
      <div style={{ display: "grid", gap: 6 }}>
        {d.games.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 10, background: soft, border: `1px solid ${line}`, padding: "7px 8px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {g.home} v {g.away}
              </div>
              <div style={{ fontSize: 10, fontWeight: 500, color: muted }}>{kickoffText(g.kickoffAt)}</div>
            </div>
            <Pill {...PILL[g.status]}>
              {g.status === "live" ? <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "#dc2626" }} /> : null}
              {GAME_STATUS_LABEL[g.status]}
            </Pill>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 0" }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: d.tableUpdated ? ink : muted }}>League Table Updated</div>
          {d.tableUpdated ? (
            <Pill bg="#dcfce7" fg="#15803d">
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Done
            </Pill>
          ) : (
            <Pill bg="#e2e8f0" fg="#475569">Pending</Pill>
          )}
        </div>
      </div>
    </div>
  );
}
