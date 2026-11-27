"use client";
// components/draftRoom/PickStrip.tsx
// Every pick of the draft as a row of boxes (Ethan, 27 Nov 2026; like ESPN's draft room), on a
// computer: earlier picks to the left, upcoming ones to the right. It keeps the pick on the clock
// in view as the draft goes on; scroll (or the arrows) to look back or ahead.
import React, { useEffect, useRef } from "react";
import type { Player } from "@/lib/draft/types";
import { positionsLabel } from "@/lib/players/positions";
import { JerseyTile } from "./ui";
import type { DraftPickRow } from "./DraftResultsTab";

const BOX_W = 150;
const GAP = 8;

export function PickStrip({
  results,
  teams,
  onClockPick,
  yourTeamId,
  draftComplete,
  onOpen,
}: {
  results: DraftPickRow[];
  teams: Array<{ id: string; name: string }>;
  /** the pick number on the clock (1 = first); 0 before the draft starts; ignored once it is complete */
  onClockPick: number;
  yourTeamId: string;
  draftComplete: boolean;
  onOpen: (p: Player) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const perRound = Math.max(1, teams.length);
  const nameOf = (id?: string) => teams.find((t) => t.id === id)?.name ?? "";
  const focus = draftComplete ? results.length : onClockPick;

  // keep the pick on the clock in view (a couple of earlier picks showing to its left)
  useEffect(() => {
    const el = ref.current;
    if (!el || !focus) return;
    el.scrollTo({ left: Math.max(0, (focus - 3) * (BOX_W + GAP)), behavior: "smooth" });
  }, [focus]);

  const scrollBy = (dir: number) => ref.current?.scrollBy({ left: dir * (BOX_W + GAP) * 4, behavior: "smooth" });
  const arrow: React.CSSProperties = {
    flex: "0 0 auto",
    width: 30,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    fontSize: 20,
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
      <button style={arrow} onClick={() => scrollBy(-1)} aria-label="Earlier picks">
        ‹
      </button>
      <div ref={ref} style={{ flex: 1, minWidth: 0, overflowX: "auto", display: "flex", gap: GAP, paddingBottom: 6, scrollbarWidth: "thin" }} aria-label="Every pick">
        {results.map((r) => {
          const round = Math.ceil(r.pickNumber / perRound);
          const inRound = ((r.pickNumber - 1) % perRound) + 1;
          const onClock = !draftComplete && r.pickNumber === onClockPick;
          const yours = !!r.ownerTeamId && r.ownerTeamId === yourTeamId;
          const p = r.player;
          return (
            <button
              key={r.pickNumber}
              onClick={p ? () => onOpen(p) : undefined}
              disabled={!p}
              style={{
                flex: `0 0 ${BOX_W}px`,
                height: 92,
                textAlign: "left",
                borderRadius: 12,
                padding: "7px 9px",
                cursor: p ? "pointer" : "default",
                color: "#0f172a",
                background: onClock ? "#fef3c7" : p ? "rgba(255,255,255,0.96)" : "rgba(241,245,249,0.85)",
                border: onClock ? "2px solid #f59e0b" : yours ? "2px solid #0d9488" : "1px solid rgba(0,0,0,0.08)",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 10, fontWeight: 700, color: "#64748b" }}>
                <span>
                  R{round} · P{inRound}
                </span>
                <span style={{ flex: 1 }} />
                <span>#{r.pickNumber}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: yours ? "#0f766e" : "#0f172a" }}>
                {nameOf(r.ownerTeamId) || r.ownerInitials || "—"}
              </div>
              {p ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <JerseyTile teamCode={p.teamCode} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.firstName?.[0] ?? "?"}. {p.lastName ?? ""}
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>{positionsLabel(p)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, fontWeight: 700, color: onClock ? "#b45309" : "#94a3b8", marginTop: 4 }}>{onClock ? "On the clock" : "Upcoming"}</div>
              )}
            </button>
          );
        })}
      </div>
      <button style={arrow} onClick={() => scrollBy(1)} aria-label="Later picks">
        ›
      </button>
    </div>
  );
}
