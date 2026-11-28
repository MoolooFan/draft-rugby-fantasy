"use client";
// components/dashboard/MatchupCard.tsx
// The Dashboard's league card: league name, the round, both teams' scores (picture, Shield holder,
// record), View Matchup, Select Team and Make Transfers (with the pending trade offers count).
// Moved out of app/dashboard/page.tsx.
import React from "react";
import { useRouter } from "next/navigation";
import { ShieldIcon } from "@/components/AwardIcons";
import { TeamAvatar } from "@/components/TeamAvatar";
import { num } from "@/lib/ui/theme";
import { cardStyle, primaryButton, secondaryButton } from "./helpers";

type LeagueTeam = { id: string; pictureUrl?: string | null; userInitials?: string | null; initials?: string | null; stars?: number };

export type ScoreSide = { score: number; team: string; record: string; teamId: string | null };

function ScoreBlock({
  score,
  team,
  record,
  align,
  teamId,
  teams,
  shieldHolderTeamId,
  shieldName,
}: {
  score: number;
  team: string;
  record: string;
  align: "left" | "right";
  teamId?: string | null;
  teams: LeagueTeam[];
  shieldHolderTeamId: string | null;
  shieldName: string | undefined;
}) {
  // the team's picture (E5) beside the score
  const t: any = teamId ? teams.find((x) => x.id === teamId) : null;
  return (
    <div style={{ textAlign: align as any }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: align === "right" ? "row-reverse" : "row" }}>
        {t ? <TeamAvatar pictureUrl={t.pictureUrl} initials={t.userInitials ?? t.initials} size={36} stars={t.stars} /> : null}
        <div style={{ ...num, fontSize: 38, fontWeight: 600, lineHeight: "36px" }}>{score}</div>
      </div>
      <div style={{ marginTop: 6, fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {align === "right" && (!!teamId && teamId === shieldHolderTeamId) ? <ShieldIcon size={20} title={`${shieldName} holder`} /> : null}
        {team}
        {align !== "right" && (!!teamId && teamId === shieldHolderTeamId) ? <ShieldIcon size={20} title={`${shieldName} holder`} /> : null}
      </div>
      <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, opacity: 0.9 }}>{record}</div>
    </div>
  );
}

export function MatchupCard({
  hideTitle = false,
  leagueName,
  weekLabel,
  left,
  right,
  teams,
  shieldHolderTeamId,
  shieldName,
  pendingTradeCount,
}: {
  /** computers: the league name and round are in the header across the top instead */
  hideTitle?: boolean;
  leagueName: string;
  weekLabel: string;
  left: ScoreSide;
  right: ScoreSide;
  teams: LeagueTeam[];
  /** the Shield holder (null when the league doesn't use the Shield) */
  shieldHolderTeamId: string | null;
  shieldName: string | undefined;
  pendingTradeCount: number;
}) {
  const router = useRouter();
  return (
        <div style={cardStyle}>
          {hideTitle ? null : (
            <>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: 24 }}>
                {leagueName}
              </div>
              <div style={{ textAlign: "center", marginTop: 4, fontSize: 18, fontWeight: 600 }}>
                {weekLabel}
              </div>
            </>
          )}

          <div
            style={{
              marginTop: hideTitle ? 0 : 10,
              borderTop: hideTitle ? "none" : "1px solid #e5e9ef",
              paddingTop: hideTitle ? 0 : 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <ScoreBlock {...left} align="left" teams={teams} shieldHolderTeamId={shieldHolderTeamId} shieldName={shieldName} />
<ScoreBlock {...right} align="right" teams={teams} shieldHolderTeamId={shieldHolderTeamId} shieldName={shieldName} />
          </div>

          <button style={{ ...primaryButton, marginTop: 12 }} onClick={() => router.push("/matchup")}>
  View Matchup
</button>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button style={secondaryButton} onClick={() => router.push("/team-selection")}>
  Select Team
</button>
<button
  style={{ ...secondaryButton, position: "relative" }}
  onClick={() => router.push("/transactions")}
>
  Make Transfers

  {pendingTradeCount > 0 ? (
    <span
      style={{
        position: "absolute",
        top: -6,
        right: -6,
        minWidth: 18,
        height: 18,
        padding: "0 6px",
        borderRadius: 999,
        background: "#EF4444",
        color: "white",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: "18px",
        border: "2px solid rgba(255,255,255,0.9)",
        boxShadow: "0 10px 18px rgba(0,0,0,0.25)",
      }}
      aria-label={`${pendingTradeCount} pending trade offers`}
    >
      {pendingTradeCount > 99 ? "99+" : pendingTradeCount}
    </span>
  ) : null}
</button>
          </div>
        </div>
  );
}
