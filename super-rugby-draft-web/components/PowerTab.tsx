"use client";
// components/PowerTab.tsx
// The League page's Power Rankings tab: the teams in order of their chance of winning the title
// (lib/league/powerServer.ts, lib/league/odds.ts), with who moved up or down since last round.
import React, { useEffect, useState } from "react";
import { TeamAvatar } from "@/components/TeamAvatar";
import { roundLabel } from "@/lib/season";
import type { PowerTable } from "@/lib/league/powerServer";

type TeamLite = { id: string; name: string; ownerName?: string | null; pictureUrl?: string | null; userInitials?: string | null; initials?: string | null; stars?: number };

const box: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};
const muted: React.CSSProperties = { fontSize: 11, fontWeight: 500, opacity: 0.6 };

function Movement({ n }: { n: number | null }) {
  if (n == null) return <span style={{ width: 30, fontSize: 10, textAlign: "center", color: "rgba(15,23,42,0.4)" }}>–</span>;
  const up = n > 0, down = n < 0;
  return (
    <span
      title={up ? `Up ${n}` : down ? `Down ${-n}` : "No change"}
      style={{ width: 30, fontSize: 11, fontWeight: 700, textAlign: "center", color: up ? "#16a34a" : down ? "#dc2626" : "rgba(15,23,42,0.4)" }}
    >
      {up ? `▲${n}` : down ? `▼${-n}` : "–"}
    </span>
  );
}

export function PowerTab({ leagueId, teams }: { leagueId: string; teams: TeamLite[] }) {
  const [data, setData] = useState<{ leagueId: string; power: PowerTable } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leagues/power?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData({ leagueId, power: j.power as PowerTable });
        else setError(j?.error ?? "Couldn't load the power rankings");
      })
      .catch(() => !cancelled && setError("Couldn't load the power rankings"));
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const p = data && data.leagueId === leagueId ? data.power : null;
  if (error) return <div style={{ ...box, padding: 12, fontSize: 12, fontWeight: 600 }}>{error}</div>;
  if (!p) return <div style={{ ...box, padding: 12, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Loading…</div>;
  const team = (id: string) => teams.find((t) => t.id === id) ?? null;

  return (
    <div>
      <div style={box}>
        <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, textAlign: "center", background: "rgba(15,23,42,0.08)", borderBottom: "1px solid rgba(0,0,0,0.08)", letterSpacing: 0.4 }}>
          {p.asOfWeek ? `After ${roundLabel(p.asOfWeek)}` : "Before round 1"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "18px 30px 1fr", gap: 8, padding: "6px 10px", fontSize: 10, fontWeight: 700, opacity: 0.6 }}>
          <span>#</span>
          <span />
          <span>Team</span>
        </div>
        {p.rows.map((r) => {
          const t = team(r.teamId);
          return (
            <div key={r.teamId} style={{ display: "grid", gridTemplateColumns: "18px 30px 1fr", gap: 8, alignItems: "center", padding: "8px 10px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.rank}</span>
              <Movement n={r.movement} />
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TeamAvatar pictureUrl={t?.pictureUrl ?? null} initials={t?.userInitials ?? t?.initials ?? ""} size={26} stars={t?.stars} />
                <span style={{ minWidth: 0, display: "grid" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t?.name ?? "—"}</span>
                  {t?.ownerName ? <span style={{ ...muted, fontSize: 10, fontWeight: 600 }}>{t.ownerName}</span> : null}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ ...box, padding: "8px 10px", ...muted, fontWeight: 600, lineHeight: 1.4, textAlign: "center" }}>
        {p.simulated
          ? "In order of each team's chance of winning the title: the rest of the season and the finals played out 10,000 times, from results so far and how strong each roster is. Updated after each round; arrows show the move since the round before."
          : "In order of roster strength until the season's draw is made. Updated after each round; arrows show the move since the round before."}
      </div>
    </div>
  );
}
