"use client";
// components/dashboard/UpcomingFixtureCard.tsx
// The Dashboard's Upcoming Fixture: your next matchup with both teams' projected scores, a Shield
// game note, the win probability and a lineup warning (Fix lineup). Moved out of
// app/dashboard/page.tsx.
import React from "react";
import { useRouter } from "next/navigation";
import { ShieldIcon } from "@/components/AwardIcons";
import { formatProjection } from "@/lib/projections/useProjections";
import { muted, num } from "@/lib/ui/theme";
import { cardStyle } from "./helpers";

export function UpcomingFixtureCard({
  upcomingWeek,
  upcomingHome,
  upcomingAway,
  upcomingOutlook,
  upcomingShield,
  shieldName,
  myLineupCheck,
}: {
  upcomingWeek: string;
  upcomingHome: string;
  upcomingAway: string;
  upcomingOutlook: { left: number; right: number; leftWin: number } | null;
  upcomingShield: "defending" | "challenging" | "other" | null;
  shieldName: string | undefined;
  myLineupCheck: string | null;
}) {
  const router = useRouter();
  return (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Upcoming Fixture</div>

          <div
            style={{
              borderRadius: 12,
              background: "#f6f8fa",
              border: "1px solid #e5e9ef",
              padding: 12,
            }}
          >
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 500, opacity: 0.85 }}>
              {upcomingWeek}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <div style={{ textAlign: "left" }}>{upcomingHome}</div>
              <div style={{ opacity: 0.85 }}>v</div>
              <div style={{ textAlign: "right" }}>{upcomingAway}</div>
            </div>

            {/* projected scores under each team (separate from the win probability bar) */}
            {upcomingOutlook ? (
              <div style={{ ...num, display: "grid", gridTemplateColumns: "1fr 1fr", marginTop: 2, fontSize: 13, fontWeight: 500, color: muted }}>
                <div style={{ textAlign: "left" }}>Proj {formatProjection(upcomingOutlook.left)}</div>
                <div style={{ textAlign: "right" }}>Proj {formatProjection(upcomingOutlook.right)}</div>
              </div>
            ) : null}

            {upcomingShield ? (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 700 }}>
                <ShieldIcon size={18} />
                {upcomingShield === "defending"
                  ? `Shield defence: ${shieldName} on the line at home`
                  : upcomingShield === "challenging"
                    ? `Shield challenge: you can take ${shieldName} away`
                    : `Shield challenge: ${shieldName} on the line`}
              </div>
            ) : null}

            {upcomingOutlook ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ textAlign: "center", fontSize: 11, fontWeight: 500, color: muted }}>Win Probability</div>
                <div style={{ marginTop: 4, display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
                  <span style={{ color: "#15803d" }}>{upcomingOutlook.leftWin}%</span>
                  <div style={{ height: 7, borderRadius: 999, overflow: "hidden", display: "flex", background: "#2563eb" }}>
                    <div style={{ width: `${upcomingOutlook.leftWin}%`, background: "#16a34a" }} />
                  </div>
                  <span style={{ color: "#1d4ed8" }}>{100 - upcomingOutlook.leftWin}%</span>
                </div>
              </div>
            ) : null}
          </div>

          {myLineupCheck ? (
            <button
              onClick={() => router.push("/team-selection")}
              style={{
                marginTop: 8,
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 600,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <span>{myLineupCheck}</span>
              <span style={{ whiteSpace: "nowrap" }}>Fix lineup ›</span>
            </button>
          ) : null}
        </div>
  );
}
