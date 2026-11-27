"use client";
// components/dashboard/StandingsCard.tsx
// The Dashboard's standings (rank, movement since last round, points), or before round 1 the
// power rankings in their place. Tap a team for its profile. Moved out of app/dashboard/page.tsx.
// Next to the team: the shield holder's shield, and the latest round's crown (top score) and
// wooden spoon (lowest), as on the League page (Ethan, 27 Nov 2026).
import React from "react";
import { useRouter } from "next/navigation";
import { MovementCircle } from "@/components/MovementCircle";
import { CrownIcon, ShieldIcon, SpoonIcon } from "@/components/AwardIcons";
import { useTeamProfileStore } from "@/lib/league/teamProfileStore";
import { teal } from "@/lib/ui/theme";
import { cardStyle, type StandingRow } from "./helpers";

export function StandingsCard({
  leagueName,
  standings,
  award = null,
  shield = null,
}: {
  leagueName: string;
  standings: StandingRow[];
  /** the latest finalised round's top (crown) and lowest (spoon) scorers */
  award?: { week: number; crown: string[]; spoon: string[] } | null;
  /** the league's shield, if it has one switched on */
  shield?: { holderTeamId: string | null; name: string } | null;
}) {
  const router = useRouter();
  const openTeam = useTeamProfileStore.getState().openTeam; // tap a team: its profile pop-up
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>{leagueName}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "56px 1fr 44px",
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          opacity: 0.9,
          padding: "0 6px 6px 6px",
        }}
      >
        <div>Rank</div>
        <div>Team</div>
        <div style={{ textAlign: "right" }}>Pts</div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {standings.map((r) => (
          <div
            key={r.rank}
            role="button"
            tabIndex={0}
            onClick={() => openTeam(r.teamId)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openTeam(r.teamId)}
            style={{
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "56px 1fr 44px",
              gap: 8,
              alignItems: "center",
              borderRadius: 10,
              background: "#f6f8fa",
              border: "1px solid #e5e9ef",
              padding: "6px 6px",
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 16, textAlign: "right", fontWeight: 700 }}>{r.rank}</span>
              <MovementCircle movement={r.movement} size={20} />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{r.team}</span>
              {shield?.holderTeamId === r.teamId ? <ShieldIcon size={15} title={`${shield.name} holder`} /> : null}
              {award?.crown.includes(r.teamId) ? <CrownIcon size={14} title={`Top score in round ${award.week}`} /> : null}
              {award?.spoon.includes(r.teamId) ? <SpoonIcon size={14} title={`Lowest score in round ${award.week}`} /> : null}
            </div>

            <div style={{ textAlign: "right", fontWeight: 700 }}>{r.pts}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => router.push("/league")}
          style={{
            background: "transparent",
            border: "none",
            color: teal,
            fontSize: 11,
            fontWeight: 600,
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
          }}
        >
          View Full Standings
        </button>
      </div>
    </div>
  );
}

// The power rankings, in the standings' place until round 1 kicks off
export function PowerCard({ leagueName, rows, teams }: { leagueName: string; rows: Array<{ teamId: string; rank: number }>; teams: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const openTeam = useTeamProfileStore.getState().openTeam; // tap a team: its profile pop-up
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 12, minWidth: 0 }}>{leagueName}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: teal, whiteSpace: "nowrap", flexShrink: 0 }}>Power Rankings</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8, fontSize: 11, fontWeight: 700, opacity: 0.9, padding: "0 6px 6px 6px" }}>
        <div>Rank</div>
        <div>Team</div>
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map((r) => {
          const t = teams.find((x) => x.id === r.teamId);
          return (
            <div
              key={r.teamId}
              role="button"
              tabIndex={0}
              onClick={() => openTeam(r.teamId)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openTeam(r.teamId)}
              style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 8, alignItems: "center", borderRadius: 10, background: "#f6f8fa", border: "1px solid #e5e9ef", padding: "6px 6px", fontSize: 12, cursor: "pointer" }}
            >
              <span style={{ width: 16, textAlign: "right", fontWeight: 700 }}>{r.rank}</span>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{t?.name ?? "—"}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <button
          onClick={() => router.push("/league?tab=Power")}
          style={{ background: "transparent", border: "none", color: teal, fontSize: 11, fontWeight: 600, textDecoration: "underline", cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
        >
          View Power Rankings
        </button>
      </div>
    </div>
  );
}
