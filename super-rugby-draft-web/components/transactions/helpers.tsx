// components/transactions/helpers.tsx
// The Transactions page's own types, small helpers and constants (moved out of
// app/transactions/page.tsx to keep that file smaller; nothing changed in how they work).
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from "react";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";

// -----------------------
// Types (match your player shape)
// -----------------------
export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string | null;
  posName: string;
  secondaryPosName?: string | null;
  draftRank?: number;
  status?: any;

  // ✅ add these (so TS stops erroring on live hydration fields)
  totalPoints?: number | null;
  matchesPlayed?: number | null;
  avgPointsPerMatch?: number | null;

  stats?: any;
};

export type AnyFixture = {
  id: string;
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

export type TabKey = "Player Pool" | "Watchlist" | "Pending Claims" | "Transactions";


export function jerseySrcForTeamCode(teamCode: string | null | undefined, prefer: "angle" | "front" = "angle") {
  const code = normalizeTeamCode(teamCode);
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

export function JerseyTile({ teamCode, size = 34 }: { teamCode: string; size?: number }) {
  return (
    <img
      src={jerseySrcForTeamCode(teamCode, "angle")}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        objectFit: "contain",
        display: "block",
      }}
      draggable={false}
    />
  );
}

export function toNum(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function formatDeadline(dtMs: number, timeZone?: string) {
  const d = new Date(dtMs);
  return d.toLocaleString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

export function useNowTick(ms = 30_000) {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    // set immediately after mount so server/client match on first HTML
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);

  return now;
}

export function getInitials(name: string | null | undefined) {
  const s = String(name ?? "").trim();
  if (!s) return "??";

  const parts = s
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : (parts[0]?.[1] ?? "");
  return (first + last).toUpperCase();
}

export function normUser(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

export function extractRosterIdsClient(data: any): string[] {
  // Accept a bunch of possible shapes:
  // - { playerIds: ["p1","p2"] }
  // - { slots: { HO: ["p1"], PR: [{id:"p2"}], ... }, wildcards: [...] }
  // - ["p1","p2"] (rare but possible)

  const ids: string[] = [];

  const pushItem = (x: any) => {
    if (!x) return;
    if (typeof x === "string" || typeof x === "number") {
      ids.push(String(x));
      return;
    }
    if (typeof x === "object") {
      // common shapes
      if (x.id != null) ids.push(String(x.id));
      else if (x.playerId != null) ids.push(String(x.playerId));
    }
  };

  // If roster is literally an array of ids
  if (Array.isArray(data)) {
    data.forEach(pushItem);
    return ids;
  }

  if (Array.isArray(data?.playerIds)) {
    data.playerIds.forEach(pushItem);
    return ids;
  }

  // slots
  const slots = data?.slots ?? {};
  for (const arr of Object.values(slots)) {
    if (!Array.isArray(arr)) continue;
    arr.forEach(pushItem);
  }

  // wildcards
  const wildcards = data?.wildcards ?? [];
  if (Array.isArray(wildcards)) wildcards.forEach(pushItem);

  return ids;
}

/** Sort options for the player pool (the metric shown on each row). */
export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "DRAFT_RANK", label: "Draft Rank" },
  { value: "PROJECTED", label: "Projected (this round)" },
  { value: "MATCH_AVG", label: "Match Average" },
  { value: "TOTAL_PTS", label: "Points" },
  { value: "FORM_3", label: "Form" },
  { value: "LAST_SCORE", label: "Last Fixture" },
  { value: "GAMES_PLAYED", label: "Games Played" },
  { value: "TRIES", label: "Tries Scored" },
  { value: "TRY_ASSISTS", label: "Try Assists" },
  { value: "LINEBREAKS", label: "Line Breaks" },
  { value: "LINEBREAK_ASSISTS", label: "Line Break Assists" },
  { value: "DEFENDERS_BEATEN", label: "Defenders Beaten" },
  { value: "METRES_GAINED", label: "Metres Gained" },
  { value: "OFFLOADS", label: "Offloads" },
  { value: "TACKLES", label: "Tackles" },
  { value: "MISSED_TACKLES", label: "Missed Tackles" },
  { value: "TURNOVERS_FORCED", label: "Turnovers Forced" },
  { value: "INTERCEPTIONS", label: "Interceptions" },
  { value: "KICKS_50_22", label: "50:22 Kicks" },
  { value: "PENALTIES_CONCEDED", label: "Penalties Conceded" },
  { value: "ERRORS", label: "Errors" },
  { value: "LINEOUTS_WON", label: "Lineouts Won" },
  { value: "LINEOUT_STEALS", label: "Lineout Steals" },
  { value: "LINEOUT_ERRORS", label: "Lineout Errors" },
  { value: "SCRUMS_WON", label: "Scrums Won" },
  { value: "CONVERSIONS", label: "Conversions" },
  { value: "PENALTY_GOALS", label: "Penalty Goals" },
  { value: "DROP_GOALS", label: "Drop Goals" },
  { value: "YELLOW_CARDS", label: "Yellow Cards" },
  { value: "RED_CARDS", label: "Red Cards" }
];

/** Drop-list choice meaning "don't drop anyone" (the team has a free place). */
export const NO_DROP = "__no_drop__";

/** "C. Tangitau" (first initial and last name). */
export function shortName(p: { firstName?: string; lastName?: string } | null | undefined) {
  const first = (p?.firstName ?? "").trim();
  const last = (p?.lastName ?? "").trim();
  const initial = first ? first[0].toUpperCase() : "?";
  return last ? `${initial}. ${last}` : `${initial}.`;
}

/** The light list box the Transactions page uses for its lists. */
export const listBox: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};

// Moved out of app/transactions/page.tsx (20 Nov 2026)
export function pickFirstTruthy<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v != null && String(v).trim() !== "") return v as T;
  return null;
}

export function normStr(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

export function nextWeekFrom(weeksSorted: number[], week: number) {
  const idx = weeksSorted.indexOf(week);
  if (idx >= 0 && idx < weeksSorted.length - 1) return weeksSorted[idx + 1];
  return week + 1;
}
