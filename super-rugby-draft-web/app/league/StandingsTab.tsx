"use client";
// app/league/StandingsTab.tsx
// The League page's Standings tab: the ladder (crown / spoon / Shield icons, movement, playoff
// chances), the join code, Join / Create / League Settings and the new-season restart.
// Moved out of app/league/page.tsx.

import React from "react";

import { currentSeasonYear } from "@/lib/season";

import { TeamAvatar } from "@/components/TeamAvatar";
import { CrownIcon, ShieldIcon, SpoonIcon } from "@/components/AwardIcons";
import { MovementCircle } from "@/components/MovementCircle";
import { listBox, outlinePillButton, pillButton, type StandingRow } from "./fixtureRows";
import type { League } from "@/lib/league/types";

export function StandingsTab({
  league,
  leagueName,
  leagueCode,
  standings,
  latestAward,
  showOdds,
  playoffOdds,
  openTeam,
  isCreator,
  onOpenModal,
  restartLeague,
  restarting,
  restartMsg,
}: {
  league: League | null;
  leagueName: string;
  leagueCode: string;
  standings: StandingRow[];
  /** the latest finalised round's top and bottom scorers */
  latestAward: { week: number; crown: string[]; spoon: string[] } | null;
  /** show the Playoff % column */
  showOdds: boolean;
  playoffOdds: (teamId: string) => string;
  openTeam: (teamId: string) => void;
  isCreator: boolean;
  onOpenModal: (type: "join" | "create" | "settings") => void;
  restartLeague: () => void;
  restarting: boolean;
  restartMsg: string | null;
}) {
    // horizontally scrollable table; the team column fits the longest team name (no cutting off)
    const longest = Math.max(8, ...standings.map((r) => String(r.teamName ?? "").length));
    const teamCol = Math.round(32 + longest * 7.4 + 40); // avatar + name + room for the shield / crown / spoon
    const cols = `44px ${teamCol}px 24px 24px 24px 24px 38px 38px 40px 30px${showOdds ? " 56px" : ""}`;
    return (
      <>
        <div style={listBox}>
          <div style={{ padding: "10px 10px", overflowX: "auto" }}>
            <div style={{ width: "max-content", minWidth: "100%" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,

                  gap: 8,
                  fontSize: 10,
                  fontWeight: 500,
                  opacity: 0.7,
                  paddingBottom: 8,
                }}
              >
                <div>Rk</div>
                <div>Team</div>
                <div>P</div>
                <div>W</div>
                <div>D</div>
                <div>L</div>
                <div>PF</div>
                <div>PA</div>
                <div>PD</div>
                <div style={{ textAlign: "right" }}>Pts</div>
                {showOdds ? (
                  <div style={{ textAlign: "right", whiteSpace: "nowrap" }} title="Chance of making the playoffs">
                    Playoff %
                  </div>
                ) : null}
              </div>

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
                    gridTemplateColumns: cols,

                    gap: 8,
                    alignItems: "center",
                    padding: "10px 0",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 14, textAlign: "right", fontWeight: 700 }}>{r.rank}</span>
                    <MovementCircle movement={r.movement} moved={r.moved} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {(() => {
                      const t: any = (league?.teams ?? []).find((x: any) => x.id === r.teamId);
                      return <TeamAvatar pictureUrl={t?.pictureUrl} initials={t?.userInitials ?? t?.initials} size={24} stars={t?.stars} />;
                    })()}
                    <span style={{ minWidth: 0, display: "grid" }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.teamName}</span>
                      {(() => {
                        const owner = (league?.teams ?? []).find((x: any) => x.id === r.teamId)?.ownerName;
                        return owner ? (
                          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner}</span>
                        ) : null;
                      })()}
                    </span>
                    {league?.shield?.enabled && league.shield.holderTeamId === r.teamId ? (
                      <ShieldIcon size={16} title={`${league.shield.name} holder`} />
                    ) : null}
                    {latestAward?.crown.includes(r.teamId) ? (
                      <CrownIcon size={15} title={`Top score in round ${latestAward.week}`} />
                    ) : null}
                    {latestAward?.spoon.includes(r.teamId) ? (
                      <SpoonIcon size={15} title={`Lowest score in round ${latestAward.week}`} />
                    ) : null}
                  </div>
                  <div>{r.played}</div>
                  <div>{r.wins}</div>
                  <div>{r.draws}</div>
                  <div>{r.losses}</div>
                  <div>{r.pf}</div>
                  <div>{r.pa}</div>
                  <div>{r.pd}</div>
                  <div style={{ textAlign: "right", fontWeight: 700 }}>{r.pts}</div>
                  {showOdds ? <div style={{ textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{playoffOdds(r.teamId)}</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
          League Code: {leagueCode}
        </div>

        {/* E8: the commissioner starts last season's league again for this season (in the month before it starts) */}
        {isCreator && league?.canRestart ? (
          <div style={{ ...listBox, marginTop: 12, padding: 12, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>New season</div>
            <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
              Start {leagueName} again for {currentSeasonYear()}: same name, settings and history, with a new join code and draft.
              Everyone rejoins with the new code and gets their team name and picture back.
            </div>
            <button
              disabled={restarting}
              onClick={restartLeague}
              style={{ height: 38, borderRadius: 12, border: "none", background: "#22C55E", color: "white", fontWeight: 700, cursor: "pointer", opacity: restarting ? 0.7 : 1 }}
            >
              {restarting ? "Starting…" : `Start the ${currentSeasonYear()} season`}
            </button>
            {restartMsg ? <div style={{ fontSize: 12, fontWeight: 600 }}>{restartMsg}</div> : null}
          </div>
        ) : null}

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <button
            onClick={() => onOpenModal("join")}
            style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
          >
            Join League
          </button>

          <button
            onClick={() => onOpenModal("create")}
            style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
          >
            Create New League
          </button>

          <button
            onClick={() => onOpenModal("settings")}
            style={outlinePillButton()}
          >
            League Settings
          </button>
        </div>
      </>
    );
  }
