"use client";
// components/dashboard/LeagueScoresCard.tsx
// Dashboard on a computer (Ethan, 28 Nov 2026): every matchup in the league for the week, next
// to the table. The current round's scores until the waiver deadline, then the upcoming round
// (with projections once there are lineups). Your matchup is highlighted.
import React from "react";
import { useRouter } from "next/navigation";
import { useTeamProfileStore } from "@/lib/league/teamProfileStore";
import { formatProjection } from "@/lib/projections/useProjections";
import { line, muted, num, soft, teal } from "@/lib/ui/theme";
import { cardStyle } from "./helpers";

export type LeagueScoreRow = {
  homeId: string | null;
  awayId: string | null;
  /** points (or projected points for an upcoming round); null: not known */
  home: number | null;
  away: number | null;
};

export function LeagueScoresCard({
  title,
  upcoming,
  rows,
  nameOf,
  yourTeamId,
}: {
  title: string;
  /** an upcoming round: the numbers are projections */
  upcoming: boolean;
  rows: LeagueScoreRow[];
  nameOf: (teamId: string | null) => string;
  yourTeamId: string | null;
}) {
  const router = useRouter();
  const openTeam = useTeamProfileStore.getState().openTeam;
  const show = (v: number | null) => (v == null ? "–" : upcoming ? formatProjection(v) : String(Math.round(v * 10) / 10));
  const name = (id: string | null, align: "left" | "right") => (
    <button
      onClick={() => id && openTeam(id)}
      style={{
        border: "none",
        background: "transparent",
        padding: 0,
        font: "inherit",
        color: "inherit",
        cursor: id ? "pointer" : "default",
        textAlign: align,
        fontSize: 13,
        fontWeight: id && id === yourTeamId ? 700 : 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
      }}
    >
      {id ? nameOf(id) : "Bye"}
    </button>
  );
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        {upcoming ? <div style={{ fontSize: 11, color: muted }}>Projected</div> : null}
      </div>
      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
        {rows.map((r, i) => {
          const mine = !!yourTeamId && (r.homeId === yourTeamId || r.awayId === yourTeamId);
          const homeAhead = r.home != null && r.away != null && r.home > r.away;
          const awayAhead = r.home != null && r.away != null && r.away > r.home;
          return (
            <div
              key={`${r.homeId}-${r.awayId}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 54px 14px 54px minmax(0,1fr)",
                alignItems: "center",
                gap: 6,
                padding: "8px 10px",
                borderRadius: 10,
                background: mine ? "#ecfdf5" : soft,
                border: `1px solid ${mine ? "#a7f3d0" : line}`,
              }}
            >
              {name(r.homeId, "left")}
              <div style={{ ...num, textAlign: "right", fontSize: upcoming ? 13 : 16, fontWeight: homeAhead ? 700 : 500, color: upcoming ? muted : undefined }}>{show(r.home)}</div>
              <div style={{ textAlign: "center", fontSize: 10, color: muted }}>v</div>
              <div style={{ ...num, textAlign: "left", fontSize: upcoming ? 13 : 16, fontWeight: awayAhead ? 700 : 500, color: upcoming ? muted : undefined }}>{show(r.away)}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 0 }}>{name(r.awayId, "right")}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, textAlign: "right" }}>
        <button
          onClick={() => router.push("/league")}
          style={{ border: "none", background: "transparent", padding: 0, fontSize: 12, fontWeight: 600, color: teal, textDecoration: "underline", cursor: "pointer" }}
        >
          View Fixtures &amp; Results
        </button>
      </div>
    </div>
  );
}
