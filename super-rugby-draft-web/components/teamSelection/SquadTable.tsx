"use client";
// components/teamSelection/SquadTable.tsx
// Team Selection on a computer (Ethan, 27 Nov 2026): your whole squad as a table beside the
// pitch, so you can compare everyone at once: where he is in your team, his game this week,
// status, expected points, latest score, form, points per game and last season's average.
// Tap a player for his card.
import React from "react";
import { StatusTag } from "@/components/StatusTag";
import { positionsLabel } from "@/lib/players/positions";
import { jerseySrcForTeamCode } from "@/components/dashboard/helpers";

export type SquadRow = {
  player: { id: string; firstName?: string; lastName?: string; teamCode: string; posAbbrev?: string; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null };
  /** "Prop", "Sub", "IR", "Not picked" */
  where: string;
  starter: boolean;
  captain: boolean;
  vice: boolean;
  /** "CHI (H)", "BYE" */
  opp: string;
  proj: string;
  latest: string;
  form: string;
  ppg: string;
  lastSeason: string;
};

const COLS = "minmax(0, 1.6fr) 52px 66px 48px 48px 48px 48px 58px";

/** "Loose Forward" -> "LF" (the full name shows when you hover). */
const SHORT_WHERE: Record<string, string> = { Prop: "PR", Hooker: "HO", Lock: "LK", "Loose Forward": "LF", Halfback: "HB", Flyhalf: "FH", "First Five": "FH", Centre: "CE", "Outside Back": "OB", Back: "BK", Forward: "FWD", Utility: "UT" };

export function SquadTable({ rows, lastSeasonYear, onOpen }: { rows: SquadRow[]; lastSeasonYear: number | null; onOpen: (id: string) => void }) {
  const head: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#64748b", textAlign: "center", whiteSpace: "nowrap" };
  const cell: React.CSSProperties = { fontSize: 12, fontWeight: 600, textAlign: "center", whiteSpace: "nowrap", color: "#0f172a" };
  return (
    <div style={{ borderRadius: 14, background: "rgba(255,255,255,0.96)", color: "#0f172a", overflow: "hidden", boxShadow: "0 10px 24px rgba(0,0,0,0.12)" }}>
      <div style={{ padding: "12px 14px 6px", display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>Your squad</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>Tap a player for his card</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, padding: "6px 14px", borderBottom: "1px solid #e5e9ef", alignItems: "end" }}>
        <div style={{ ...head, textAlign: "left" }}>Player</div>
        <div style={head}>In team</div>
        <div style={head}>Game</div>
        <div style={head} title="Expected points this week">Proj</div>
        <div style={head} title="His latest score">Latest</div>
        <div style={head} title="Average of his last 3 games">Form</div>
        <div style={head} title="Points per game this season">PPG</div>
        <div style={head} title={lastSeasonYear ? `Points per game in ${lastSeasonYear}` : "Last season's points per game"}>
          {lastSeasonYear ? `${lastSeasonYear} Avg` : "Last Avg"}
        </div>
      </div>
      {rows.map((r) => {
        const p = r.player;
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(p.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(p.id)}
            style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, padding: "7px 14px", borderBottom: "1px solid #eef1f5", alignItems: "center", cursor: "pointer", background: r.starter ? "transparent" : "rgba(15,23,42,0.03)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- small jersey icons, like the rest of the site */}
              <img src={jerseySrcForTeamCode(p.teamCode, "angle")} alt="" style={{ width: 26, height: 26, objectFit: "contain", flex: "0 0 auto" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.firstName} {p.lastName}
                  </span>
                  {r.captain ? <Badge text="C" /> : r.vice ? <Badge text="VC" ring /> : null}
                  <StatusTag player={p as never} />
                </div>
                <div style={{ fontSize: 10, color: "#64748b" }}>{positionsLabel(p)}</div>
              </div>
            </div>
            <div title={r.where} style={{ ...cell, fontWeight: r.starter ? 700 : 500, color: r.where === "IR" ? "#dc2626" : r.starter ? "#0f172a" : "#64748b" }}>
              {SHORT_WHERE[r.where] ?? (r.where === "Not picked" ? "Out" : r.where)}
            </div>
            <div style={{ ...cell, fontWeight: 500 }}>{r.opp || "–"}</div>
            <div style={{ ...cell, fontWeight: 700 }}>{r.proj}</div>
            <div style={cell}>{r.latest}</div>
            <div style={cell}>{r.form}</div>
            <div style={cell}>{r.ppg}</div>
            <div style={cell}>{r.lastSeason}</div>
          </div>
        );
      })}
    </div>
  );
}

function Badge({ text, ring = false }: { text: string; ring?: boolean }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        borderRadius: 999,
        padding: "0 5px",
        lineHeight: "15px",
        flex: "0 0 auto",
        background: ring ? "transparent" : "rgba(168,85,247,0.95)",
        color: ring ? "#9333ea" : "white",
        border: ring ? "1.5px solid rgba(168,85,247,0.95)" : "none",
      }}
    >
      {text}
    </span>
  );
}
