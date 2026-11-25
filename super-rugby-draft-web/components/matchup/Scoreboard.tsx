"use client";
// components/matchup/Scoreboard.tsx
// The Matchup page's scoreboard: both teams (picture, Shield holder, record and streak, SHIELD
// DEFENCE / CHALLENGE), the scores with their projections, FINAL / LIVE / UPCOMING and the win
// probability bar. Tap a team for its profile (components/TeamProfileModal.tsx). Moved out of
// app/matchup/page.tsx.
import React from "react";
import { ShieldIcon } from "@/components/AwardIcons";
import { TeamAvatar } from "@/components/TeamAvatar";
import { useTeamProfileStore } from "@/lib/league/teamProfileStore";
import { formatProjection } from "@/lib/projections/useProjections";
import { muted, num } from "@/lib/ui/theme";
import { listBox, recordText, streakColor, streakText, type Streak, type TeamRecord } from "./helpers";

export type ScoreboardSide = {
  teamId: string | null;
  name: string;
  pictureUrl: string | null;
  initials: string | null;
  stars: number;
  holdsShield: boolean;
  record: TeamRecord;
  streak: Streak;
  /** "SHIELD DEFENCE" / "SHIELD CHALLENGE" when this is a Shield game */
  shieldTag: string | null;
  score: number;
  /** expected points, when there are projections */
  projected: number | null;
};

function TeamSide({ side, align, mounted, shieldName }: { side: ScoreboardSide; align: "left" | "right"; mounted: boolean; shieldName: string | undefined }) {
  const right = align === "right";
  const shield = side.holdsShield ? <ShieldIcon size={28} title={`${shieldName} holder`} /> : null;
  const avatar = <TeamAvatar pictureUrl={side.pictureUrl} initials={side.initials} size={44} stars={side.stars} />;
  return (
    <div style={{ textAlign: align, cursor: side.teamId ? "pointer" : "default" }} onClick={() => side.teamId && useTeamProfileStore.getState().openTeam(side.teamId)}>
      {side.teamId ? (
        // the Shield sits beside the holder's team picture (Ethan, 19 Nov 2026)
        <div style={{ display: "flex", alignItems: "center", ...(right ? { justifyContent: "flex-end" } : {}), gap: 6, marginBottom: 6, marginTop: 6 }}>
          {right ? shield : avatar}
          {right ? avatar : shield}
        </div>
      ) : null}
      {/* home is always on the left, away on the right (Ethan, 23 Nov 2026) */}
      {side.teamId ? (
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, opacity: 0.6 }}>{right ? "AWAY" : "HOME"}</div>
      ) : null}
      <div style={{ fontSize: 18, fontWeight: 700 }}>{side.name}</div>

      <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.75 }}>
        {recordText(side.record)}{" "}
        <span style={{ color: streakColor(side.streak), fontWeight: 500 }}>{streakText(side.streak)}</span>
      </div>
      {mounted && side.shieldTag ? (
        <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: "#6a4426" }}>{side.shieldTag}</div>
      ) : null}
    </div>
  );
}

/** A team's total, pulled in towards the middle. */
function Total({ side, align }: { side: ScoreboardSide; align: "left" | "right" }) {
  const left = align === "left";
  return (
    <div style={left ? { display: "flex", justifyContent: "flex-end", paddingRight: 20 } : { display: "flex", justifyContent: "flex-start", paddingLeft: 20 }}>
      <div style={{ textAlign: left ? "right" : "left" }}>
        <div style={{ ...num, fontSize: 34, fontWeight: 600, lineHeight: 1 }}>{side.score}</div>
        {side.projected != null ? (
          <div style={{ ...num, fontSize: 14, fontWeight: 500, color: muted, marginTop: 3 }} title="Expected points">
            Proj {formatProjection(side.projected)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Scoreboard({
  left,
  right,
  mounted,
  shieldName,
  statusLabel,
  leftWinPct,
}: {
  left: ScoreboardSide;
  right: ScoreboardSide;
  mounted: boolean;
  shieldName: string | undefined;
  /** FINAL / LIVE / UPCOMING (null: none) */
  statusLabel: string | null;
  leftWinPct: number | null;
}) {
  return (
    <div style={{ marginTop: 10, ...listBox, padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10 }}>
        <TeamSide side={left} align="left" mounted={mounted} shieldName={shieldName} />
        <div style={{ fontSize: 18, fontWeight: 700, opacity: 0.85 }}></div>
        <TeamSide side={right} align="right" mounted={mounted} shieldName={shieldName} />
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
        <Total side={left} align="left" />

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>vs</div>
          {statusLabel ? <div style={{ marginTop: 2, fontSize: 9, fontWeight: 700, letterSpacing: 0.6, opacity: 0.6 }}>{statusLabel}</div> : null}
        </div>

        <Total side={right} align="right" />
      </div>

      {/* Win probability (from the projections; moves as real points come in) */}
      {leftWinPct != null ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700 }}>
            <span>{leftWinPct}%</span>
            <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}>Win Probability</span>
            <span>{100 - leftWinPct}%</span>
          </div>
          <div style={{ marginTop: 4, height: 6, borderRadius: 999, overflow: "hidden", display: "flex", background: "rgba(15,23,42,0.12)" }}>
            <div style={{ width: `${leftWinPct}%`, background: "#16a34a", transition: "width 0.4s" }} />
            <div style={{ flex: 1, background: "rgba(15,23,42,0.35)" }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
