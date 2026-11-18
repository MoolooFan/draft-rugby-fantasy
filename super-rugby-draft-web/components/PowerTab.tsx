"use client";
// components/PowerTab.tsx
// The League page's Power tab: weekly power rankings (lib/league/powerRankings.ts) with who
// moved up or down since last round.
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
  if (n == null) return <span style={{ width: 26 }} />;
  const up = n > 0, down = n < 0;
  return (
    <span
      title={up ? `Up ${n}` : down ? `Down ${-n}` : "No change"}
      style={{ width: 26, fontSize: 10, fontWeight: 700, textAlign: "center", color: up ? "#16a34a" : down ? "#dc2626" : "rgba(15,23,42,0.4)" }}
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
        <div style={{ display: "grid", gridTemplateColumns: "18px 26px 1fr 44px", gap: 8, padding: "6px 10px", fontSize: 10, fontWeight: 700, opacity: 0.6 }}>
          <span>#</span>
          <span />
          <span>Team</span>
          <span style={{ textAlign: "right" }}>Power</span>
        </div>
        {p.rows.map((r) => {
          const t = team(r.teamId);
          return (
            <div key={r.teamId} style={{ display: "grid", gridTemplateColumns: "18px 26px 1fr 44px", gap: 8, alignItems: "center", padding: "8px 10px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.rank}</span>
              <Movement n={r.movement} />
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TeamAvatar pictureUrl={t?.pictureUrl ?? null} initials={t?.userInitials ?? t?.initials ?? ""} size={26} stars={t?.stars} />
                <span style={{ minWidth: 0, display: "grid" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t?.name ?? "—"}</span>
                  <span style={{ ...muted, fontSize: 10, fontWeight: 600 }}>
                    {r.seasonAvg != null ? `Avg ${r.seasonAvg} · last 3 ${r.recentAvg} · ` : ""}best XV proj {Math.round(r.rosterProjection)}
                  </span>
                </span>
              </span>
              <span style={{ textAlign: "right", fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{Math.round(r.score)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...box, padding: "8px 10px", ...muted, fontWeight: 600, lineHeight: 1.4 }}>
        Power = season average (35%), last 3 rounds (25%) and the projected score of each team&apos;s best possible XV for {roundLabel(p.projectedWeek)} (40%), each against the league average: 100 is an average team. Updated after each round.
      </div>
    </div>
  );
}
