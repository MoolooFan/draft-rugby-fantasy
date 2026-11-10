"use client";
// components/playerCard/helpers.tsx
// (moved out of PlayerCardModal.tsx unchanged)
import { type ReactNode } from "react";

import { isFrontRow } from "@/lib/scoring";

import { JERSEYS, TEAM_LOGOS, TEAM_LOGO_PLACEHOLDER } from "@/lib/teams/images";

export type FixtureRow = {
  week: number;
  opponent?: string;         // undefined = bye
  homeAway?: "H" | "A";
  kickoff?: string;
  isBye?: boolean;

  // ✅ add these:
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isComplete?: boolean;
  fdr?: number | null;

};

export function teamLogoSrc(codeOrName: string | null | undefined) {
  const code =
    normalizeTeamCodeLocal(codeOrName) ??
    String(codeOrName ?? "").toUpperCase().slice(0, 3);

  return TEAM_LOGOS[code] ?? TEAM_LOGO_PLACEHOLDER;
}

export function normalizeTeamCodeLocal(raw: string | null | undefined): string | null {

  const s = (raw ?? "").trim();
  if (!s) return null;

  const upper = s.toUpperCase();
// hard alias: if sheet sends MOA, use MOA; if anything sends MOP, treat as MOA
if (upper === "MOP") return "MOA";
if (upper === "MOA") return "MOA";

  // 1) direct match (already BLU/BRU/CHI/.../MOP etc)
  if (JERSEYS[upper]) return upper;

  // 2) "clean" token version for mapping
  const key = upper.replace(/\s+/g, "_").replace(/[^A-Z_]/g, "");

  const NAME_TO_CODE: Record<string, string> = {
    BLUES: "BLU",
    BRUMBIES: "BRU",
    CHIEFS: "CHI",
    CRUSADERS: "CRU",
    DRUA: "DRU",
    FIJIAN_DRUA: "DRU",
    FORCE: "FOR",
    WESTERN_FORCE: "FOR",
    HIGHLANDERS: "HIG",
    HURRICANES: "HUR",
    MOANA: "MOA",
MOANA_PASIFIKA: "MOA",
MOANAPASIFIKA: "MOA",
MOP: "MOA",     // backwards compatibility
MOA: "MOA",     // explicit
    REDS: "RED",
    WARATAHS: "WAR",
  };

  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];

  // 3) FUZZY match (this is the key missing piece)
  // Strip everything except letters so "(NZ)" "-" etc don't matter
  const lettersOnly = upper.replace(/[^A-Z]/g, "");

  if (lettersOnly.includes("MOANA")) return "MOA";
if (lettersOnly.includes("PASIFIKA")) return "MOA";

  if (lettersOnly.includes("HIGHLANDERS")) return "HIG";
  if (lettersOnly.includes("HURRICANES")) return "HUR";
  if (lettersOnly.includes("WARATAHS")) return "WAR";
  if (lettersOnly.includes("BRUMBIES")) return "BRU";
  if (lettersOnly.includes("CRUSADERS")) return "CRU";
  if (lettersOnly.includes("CHIEFS")) return "CHI";
  if (lettersOnly.includes("BLUES")) return "BLU";
  if (lettersOnly.includes("DRUA")) return "DRU";
  if (lettersOnly.includes("FORCE")) return "FOR";
  if (lettersOnly.includes("REDS")) return "RED";

  // 4) last resort: try first 3 letters
  const guess = upper.slice(0, 3);
  return JERSEYS[guess] ? guess : null;
}

export function playerGetsScrumPointsForCard(player: {
  posAbbrev?: string;
  secondaryPosAbbrev?: string;
}) {
  return isFrontRow(player);
}

export function computeGames(rounds: { points: number; minutes?: number }[]) {
  // If you track minutes, use minutes > 0. If not, just count rounds.
  return rounds?.length ?? 0;
}

export function TabCard({ children }: { children: ReactNode }) {

  return (
    <div
      style={{
        borderRadius: 12,
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: 12,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

export function totalDerived(rounds: any[], key: string) {
  return rounds.reduce((sum, r) => sum + (Number(r?.breakdown?.[key]) || 0), 0);
}

export function perGameDerived(rounds: any[], key: string) {
  const gp = computeGames(rounds);
  if (!gp) return 0;
  return totalDerived(rounds, key) / gp;
}

/**
 * Single row component matching screenshot:
 * - left label
 * - right value
 * - optional second right value (for Starts)
 * - optional small "Missed x" under the right value
 */
export function StatRow({
  label,
  right,
  subRight,
  right2,
  right2Label,
}: {
  label: string;
  right: string;
  subRight?: string;      // number only, e.g. "3.5" or "-"
  right2?: string;        // starts value
  right2Label?: string;   // "Starts"
}) {
  const hasThirdCol = typeof right2 === "string" || !!subRight;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: hasThirdCol ? "1fr 56px 90px" : "1fr 90px",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid rgba(0,0,0,0.18)",
        alignItems: "center",
      }}
    >
      {/* label */}
      <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>{label}</div>

      {/* main value */}
      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
        {right}
      </div>

      {/* third column: Starts OR Missed (inline, same row) */}
      {typeof right2 === "string" ? (
        <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
          <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 800, marginRight: 16 }}>
            {right2Label ?? ""}
          </span>
          {right2}
        </div>
      ) : subRight ? (
        <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
          <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 800, marginRight: 16 }}>
            Missed
          </span>
          {subRight}
        </div>
      ) : null}
    </div>
  );
}

export function fdrTheme(val: number | null) {
  // Adjust these colours to EXACTLY match your Fixtures page FDR tab if needed
  if (val == null) return { bg: "rgba(15,23,42,0.06)", border: "rgba(0,0,0,0.10)", text: "#0f172a" };

  if (val === 1) return { bg: "#375523", text: "white" };   // green
  if (val === 2) return { bg: "#01FC7A", text: "#000000" };   // green
  if (val === 3) return { bg: "#E7E7E7", text: "#000000" };   // amber
  if (val === 4) return { bg: "#FF1751", text: "white" };   // green
  return { bg: "#80072D", text: "white" };                   // red
}

export function formatKickoffLocal(input: any): string {
  if (!input) return "";

  // Works best if input is an ISO string (e.g. "2026-02-22T02:35:00Z")
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input); // fallback if it's not parseable

  // Viewer’s local timezone is used by default (no timeZone option)
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d);
  const day = new Intl.DateTimeFormat(undefined, { day: "2-digit" }).format(d);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(d);

  const time = d
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(" ", "")    // "10:35 am" -> "10:35am"
    .toLowerCase();

  return `${weekday} ${day} ${month} ${time}`;
}
