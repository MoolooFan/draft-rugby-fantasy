// app/league/fixtureRows.ts
// Shared by the League page and its Standings / Fixtures / Results tabs (split out 20 Nov 2026):
// the fixture list types, finals label helpers and styles.
import type React from "react";

export type FixtureRow = {
  weekNo: number;

  home: string;
  away: string;

  homeTeamId?: string | null;
  awayTeamId?: string | null;

  homeScore: number | null;
  awayScore: number | null;

  // ✅ ADD THESE (for playoff label rows)
  label?: string | null;
  kind?: "regular" | "playoffs" | "consolation" | string | null;
};

export type FixtureWeek = {
  weekNo: number;
  rows: FixtureRow[];
};

export type StandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pf: number;
  pa: number;
  pd: number;
  pts: number;
  movement: "same" | "up" | "down";
  /** places moved since the round before (+ = up) */
  moved: number;
};

export function isPlayoffsKind(kind: string | null) {
  return String(kind ?? "").toLowerCase() === "playoffs";
}

export function labelText(r: FixtureRow) {
  return String(r.home ?? "").trim().toLowerCase();
}

export function isGrandFinalHeader(r: FixtureRow) {
  return labelText(r) === "grand final";
}

export function shouldInjectPlaceholder(r: FixtureRow) {
  if (!isPlayoffsKind(r.kind ?? null)) return false;

  const text = labelText(r);

  // Do NOT inject if sheet already contains a real matchup row
  if (
    text === "consolation final" ||
    text === "consolation playoff"
  ) {
    return false;
  }

  return true;
}

// ------- styles -------
export const finalsLabelStyle: React.CSSProperties = {
  padding: "2px 10px",
  borderTop: "1px solid rgba(0,0,0,0.08)",
  fontSize: 11,          // smaller
  fontWeight: 500,
  textAlign: "center",
  background: "rgba(15,23,42,0.14)", // darker than normal label strip
  color: "#0f172a",
};

export const grandFinalLabelStyle: React.CSSProperties = {
  ...finalsLabelStyle,
  background: "rgba(245, 158, 11, 0.28)", // amber/gold tint
  borderTop: "1px solid rgba(245, 158, 11, 0.45)",
  borderBottom: "1px solid rgba(245, 158, 11, 0.45)",
};

export const finalsPlaceholderRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 10,
  padding: "7px 10px",
  borderTop: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 600,
  alignItems: "center",
  opacity: 0.85,
  background: "rgba(15,23,42,0.03)",
};

export const listBox: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};

export function pillButton(bg: string): React.CSSProperties {
  return {
    height: 40,
    width: "100%",
    borderRadius: 999,
    background: bg,
    color: "white",
    fontSize: 13,
    fontWeight: 600,
    border: "2px solid rgba(255,255,255,0.85)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    cursor: "pointer",
  };
}

export function outlinePillButton(): React.CSSProperties {
  return {
    height: 36,
    width: "100%",
    borderRadius: 999,
    background: "rgba(255,255,255,0.12)",
    color: "white",
    fontSize: 12,
    fontWeight: 600,
    border: "2px solid rgba(255,255,255,0.85)",
    cursor: "pointer",
  };
}
