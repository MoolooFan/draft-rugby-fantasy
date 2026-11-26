"use client";
// components/draftPrep/PlayerLine.tsx
// One player in a draft prep list (Draft Strategy, Mock Draft): a number on the left, the jersey,
// name, team and positions, a tag (e.g. "Early target"), and buttons on the right.
import React from "react";
import { jerseySrcForTeam } from "@/components/playerCard/cardData";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { positionsLabel } from "@/lib/players/positions";
import { ink, line, muted, num, teal } from "@/lib/ui/theme";

export type LinePlayer = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string | null;
  thirdPosAbbrev?: string | null;
  draftRank?: number | null;
  status?: string | null;
};

export function PlayerLine({
  p,
  number,
  numberLabel,
  tag,
  tagTone = "teal",
  highlight,
  dim,
  onOpen,
  right,
}: {
  p: LinePlayer;
  number?: React.ReactNode;
  numberLabel?: string;
  tag?: string;
  tagTone?: "teal" | "red" | "grey";
  /** teal edge: suits this round's plan */
  highlight?: boolean;
  /** faded: e.g. a do-not-draft player */
  dim?: boolean;
  onOpen?: () => void;
  right?: React.ReactNode;
}) {
  const team = normalizeTeamCode(p.teamCode);
  const tones = { teal: { bg: "rgba(13,148,136,0.12)", fg: teal }, red: { bg: "rgba(239,68,68,0.12)", fg: "#dc2626" }, grey: { bg: "#eef2f6", fg: muted } };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 8px",
        borderBottom: `1px solid ${line}`,
        borderLeft: `3px solid ${highlight ? teal : "transparent"}`,
        opacity: dim ? 0.55 : 1,
        minWidth: 0,
      }}
    >
      {number != null ? (
        <div title={numberLabel} style={{ ...num, width: 30, textAlign: "center", fontSize: 15, fontWeight: 700, color: ink, flexShrink: 0 }}>{number}</div>
      ) : null}
      <img src={jerseySrcForTeam(team)} alt="" width={30} height={30} style={{ width: 30, height: 30, objectFit: "contain", flexShrink: 0 }} />
      <button
        onClick={onOpen}
        disabled={!onOpen}
        style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: 0, color: ink, cursor: onOpen ? "pointer" : "default" }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {p.firstName} {p.lastName}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, fontWeight: 500, color: muted, minWidth: 0, overflow: "hidden" }}>
          <span style={{ whiteSpace: "nowrap" }}>{team} · {positionsLabel(p)}</span>
          {tag ? (
            <span style={{ padding: "1px 6px", borderRadius: 999, background: tones[tagTone].bg, color: tones[tagTone].fg, fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>{tag}</span>
          ) : null}
        </div>
      </button>
      {right ? <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>{right}</div> : null}
    </div>
  );
}

/** Small square icon button (▲ ▼ ✕ ...). */
export function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${line}`, background: "white", color: ink, fontSize: 12, fontWeight: 700, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.3 : 1, padding: 0 }}
    >
      {children}
    </button>
  );
}
