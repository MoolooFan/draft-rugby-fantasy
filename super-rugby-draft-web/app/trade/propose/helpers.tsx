// app/trade/propose/helpers.tsx
// The trade page's helpers, types and styles (moved out of TradeProposePageInner.tsx, 20 Nov 2026):
// players' points, form and projections, the "can both squads still field a team" check, names,
// jerseys and grouping a roster by position.
import React from "react";
import { TEAM_OPTIONS } from "@/lib/constants";
import { canPlayPosition } from "@/lib/players/positions";
import { playerRoundRows } from "@/lib/players/roundIndex";
import { applyStatView, formatStatView, type StatView } from "@/lib/players/statView";
import { formatProjection, projectionFor, type WeekProjections } from "@/lib/projections/useProjections";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { card as themeCard } from "@/lib/ui/theme";

// -----------------------
// Types
// -----------------------
export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string;   // string | undefined
  posName: string;
  secondaryPosName?: string;     // string | undefined
  draftRank?: number;

  // live sheet fields (safe/optional)
  status?: any;
  weeklyStatus?: any;

  // modal expected / derived
  totalPoints?: number | null;
  matchesPlayed?: number | null;
  avgPointsPerMatch?: number | null;

  // stats object the modal reads from (or your metricValue reads from)
  stats?: any;
  playerStats?: any;
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

export type Step = "REQUESTING" | "OFFERING" | "REVIEW";
export type InfoMode = "DRAFT_RANK" | "AVG_PPG" | "TOTAL_PTS" | "FORM" | "PROJ";

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
      style={{ width: size, height: size, borderRadius: 10, objectFit: "contain", display: "block" }}
      draggable={false}
    />
  );
}

export function normUser(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

// -----------------------
// Position + roster validity helpers (matches your waiver validity logic)
// -----------------------
export const POSITION_ORDER: Record<string, number> = {
  HO: 1,
  PR: 2,
  LK: 3,
  LF: 4,
  HB: 5,
  FH: 6,
  CE: 7,
  OB: 8,
};

export function playerCanPlayPos(p: any, pos: string) {
  return canPlayPosition(p, pos);
}

export function buildRequiredSlots() {
  const req: string[] = [];
  req.push("HO");
  req.push("PR", "PR");
  req.push("LK", "LK");
  req.push("LF", "LF", "LF");
  req.push("HB");
  req.push("FH");
  req.push("CE", "CE");
  req.push("OB", "OB", "OB");
  return req;
}

export function canFillRequiredSlots(players: Player[]) {
  const REQUIRED_POS_SLOTS = buildRequiredSlots();
  const required = REQUIRED_POS_SLOTS.slice();

  const candidatesByPos = new Map<string, number[]>();
  for (const pos of new Set(required)) {
    const idxs: number[] = [];
    players.forEach((pl, i) => {
      if (playerCanPlayPos(pl, pos)) idxs.push(i);
    });
    candidatesByPos.set(pos, idxs);
  }

  required.sort((a, b) => {
    const ca = candidatesByPos.get(a)?.length ?? 0;
    const cb = candidatesByPos.get(b)?.length ?? 0;
    return ca - cb;
  });

  const used = new Array(players.length).fill(false);

  function dfs(i: number): boolean {
    if (i >= required.length) return true;
    const pos = required[i];
    const cand = candidatesByPos.get(pos) ?? [];
    for (const pi of cand) {
      if (used[pi]) continue;
      used[pi] = true;
      if (dfs(i + 1)) return true;
      used[pi] = false;
    }
    return false;
  }

  return dfs(0);
}

export function toNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function getRowNumber(row: any, header: string): number {
  if (!row) return 0;

  if (row[header] != null) {
    const n = toNum(row[header]);
    return n != null ? n : 0;
  }

  const keys = Object.keys(row);
  const found = keys.find((k) => String(k).trim().toLowerCase() === header.trim().toLowerCase());
  if (found && row[found] != null) {
    const n = toNum(row[found]);
    return n != null ? n : 0;
  }

  return 0;
}

export function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function playerGetsScrumPoints(p: Player): boolean {
  return canPlayPosition(p, "PR") || canPlayPosition(p, "HO");
}

export function getRoundPointsFromRow(row: any, p: Player): number | null {
  if (!row) return null;

  const minutes = getRowNumber(row, "Minutes played");
  if (!minutes) return null;

  let total = 0;

  // minutes
  total += minutes >= 61 ? 2 : 1;

  // attack
  total += getRowNumber(row, "Tries") * 15;
  total += getRowNumber(row, "Try Assists") * 9;
  total += getRowNumber(row, "Linebreaks") * 7;
  total += getRowNumber(row, "Linebreak assists") * 5;
  total += getRowNumber(row, "Defenders beaten") * 2;
  total += Math.floor(getRowNumber(row, "Carries (m)") / 10);
  total += getRowNumber(row, "Offloads") * 2;

  // defence / playmaking
  total += getRowNumber(row, "Tackles") * 1;
  total += getRowNumber(row, "Missed tackles") * -1;
  total += getRowNumber(row, "Turnover Forced") * 4;
  total += getRowNumber(row, "Interceptions") * 5;
  total += getRowNumber(row, "50:22 Kicks") * 10;

  // discipline / errors
  total += getRowNumber(row, "Penalties Conceded") * -1;
  total += getRowNumber(row, "Errors") * -1;

  // set piece
  total += getRowNumber(row, "Lineouts won") * 1;
  total += getRowNumber(row, "Lineout steals") * 5;
  total += getRowNumber(row, "Lineout errors") * -2;

  if (playerGetsScrumPoints(p)) {
    total += getRowNumber(row, "Scrums won outright") * 3;
  }

  // kicking
  total += getRowNumber(row, "Conversions") * 2;
  total += getRowNumber(row, "Conversions missed") * -1;
  total += getRowNumber(row, "Penalty scored") * 3;
  total += getRowNumber(row, "Penalty missed") * -1;
  total += getRowNumber(row, "Drop goal scored") * 3;
  total += getRowNumber(row, "Drop goal missed") * -1;

  // cards
  total += getRowNumber(row, "Yellow cards") * -5;
  total += getRowNumber(row, "Red cards") * -10;

  return Number.isFinite(total) ? total : null;
}

export function getPlayerRounds(playerId: string, roundRows: any[]) {
  return playerRoundRows(roundRows, playerId); // grouped by player once (lib/players/roundIndex)
}

export function getTotalPointsFromRounds(p: Player, roundRows: any[]): number | null {
  const rounds = getPlayerRounds(p.id, roundRows);
  if (!rounds.length) return null;

  let total = 0;
  let any = false;

  for (const r of rounds) {
    const pts = getRoundPointsFromRow(r, p);
    if (pts == null) continue;
    total += pts;
    any = true;
  }

  return any ? total : null;
}

export function getMatchesPlayedFromRounds(p: Player, roundRows: any[]): number | null {
  const rounds = getPlayerRounds(p.id, roundRows);
  if (!rounds.length) return null;

  const played = rounds.reduce(
    (acc: number, r: any) => acc + (getRoundPointsFromRow(r, p) != null ? 1 : 0),
    0
  );

  return played || null;
}

export function getAvgPPGFromRounds(p: Player, roundRows: any[]): number | null {
  const tot = getTotalPointsFromRounds(p, roundRows);
  const gp = getMatchesPlayedFromRounds(p, roundRows);
  if (tot != null && gp != null && gp > 0) return tot / gp;
  return null;
}

export function getFormLast3AvgFromRounds(p: Player, roundRows: any[]): number | null {
  const rounds = getPlayerRounds(p.id, roundRows);
  if (!rounds.length) return null;

  const played = rounds
    .map((r: any) => ({ r, pts: getRoundPointsFromRow(r, p) }))
    .filter((x: any) => typeof x.pts === "number");

  if (!played.length) return null;

  played.sort((a: any, b: any) => (toNum(a.r?.round) ?? 0) - (toNum(b.r?.round) ?? 0));

  const last3 = played.slice(-3);
  const sum = last3.reduce((acc: number, x: any) => acc + (x.pts as number), 0);
  return sum / last3.length;
}

export function metricValue(p: Player, mode: InfoMode, roundRows: any[], view: StatView = "game", proj: WeekProjections | null = null): string {
  // projected points for the next round (Ethan, 20 Nov 2026)
  if (mode === "PROJ") {
    const v = projectionFor(proj, p.id)?.pts;
    return v == null ? "-" : formatProjection(v);
  }
  if (mode === "DRAFT_RANK") {
    return typeof p.draftRank === "number" ? String(p.draftRank) : "-";
  }

  if (mode === "TOTAL_PTS") {
    // C1: points follow the Per game / Total / Per 80 switch
    const t = getTotalPointsFromRounds(p, roundRows);
    const gp = getMatchesPlayedFromRounds(p, roundRows) ?? 0;
    const mins = getPlayerRounds(p.id, roundRows).reduce((a: number, r: any) => a + (toNum(r?.["Minutes played"]) ?? 0), 0);
    return formatStatView(applyStatView(t, gp, mins, view), view);
  }

  if (mode === "AVG_PPG") {
    const v = getAvgPPGFromRounds(p, roundRows);
    return typeof v === "number" ? v.toFixed(1) : "-";
  }

  if (mode === "FORM") {
    const f = getFormLast3AvgFromRounds(p, roundRows);
    return typeof f === "number" ? f.toFixed(1) : "-";
  }

  return "—";
}

export function fullTeamName(teamCode: string) {
  const code = normalizeTeamCode(teamCode);

  // normal lookup
  const direct = TEAM_OPTIONS.find((t) => t.value === code)?.label;
  if (direct) return direct;

  // handle Moana code mismatch (MOA vs MOP)
  if (code === "MOA") return TEAM_OPTIONS.find((t) => t.value === "MOP")?.label ?? "Moana Pasifika";
  if (code === "MOP") return TEAM_OPTIONS.find((t) => t.value === "MOA")?.label ?? "Moana Pasifika";

  return code;
}

export function shortName(p: { firstName?: string; lastName?: string } | null | undefined) {
  const first = (p?.firstName ?? "").trim();
  const last = (p?.lastName ?? "").trim();
  const initial = first ? first[0].toUpperCase() : "?";
  return last ? `${initial}. ${last}` : `${initial}.`;
}

// -----------------------
// Roster helpers (canonical = data.playerIds from API)
// -----------------------
export function normId(x: any) {
  return String(x ?? "").trim();
}

export function extractRosterIdsFromData(data: any): string[] {
  // canonical
  if (Array.isArray(data?.playerIds)) return data.playerIds.map(normId).filter(Boolean);

  // fallback if older slot-based shape is ever returned
  const ids: string[] = [];
  for (const arr of Object.values(data?.slots ?? {})) {
    if (!Array.isArray(arr)) continue;
    for (const p of arr as any[]) if (p?.id != null) ids.push(normId(p.id));
  }
  for (const p of (data?.wildcards ?? []) as any[]) if (p?.id != null) ids.push(normId(p.id));

  return Array.from(new Set(ids.filter(Boolean)));
}

export type ModalContext = "REQUESTING" | "OFFERING";

// Group-by-position helper (keeps your exact order)
export function groupByPosition(players: Player[]) {
  const map = new Map<string, Player[]>();
  for (const p of players) {
    const key = String(p.posAbbrev ?? "").toUpperCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase();
      const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });
  }

  const orderedKeys = Object.keys(POSITION_ORDER).sort((a, b) => (POSITION_ORDER[a] ?? 99) - (POSITION_ORDER[b] ?? 99));
  return orderedKeys
    .map((k) => ({ pos: k, players: map.get(k) ?? [] }))
    .filter((g) => g.players.length > 0);
}

// Toggle select helper
export function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// ---- styles (match your Transactions vibe) ----
export const card35: React.CSSProperties = { ...themeCard, padding: undefined };

export const listBox: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};

export const inputWrap: React.CSSProperties = {
  background: "rgba(255,255,255,0.92)",
  borderRadius: 10,
  padding: "8px 10px",
  boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
};
