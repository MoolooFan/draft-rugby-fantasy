// components/teamSelection/helpers.ts
// Team Selection's pure helpers and types (moved out of app/team-selection/page.tsx, 20 Nov 2026):
// slots, jerseys, the pitch layout, fitting a roster into the lineup, swaps, stat rows.
import { useEffect, useState } from "react";
import type { Fixture } from "@/lib/fixtures/types";
import { pitchRows, slotAccepts, squadSlots, type SlotKind, type SquadFormat } from "@/lib/league/squad";
import { pickValue } from "@/lib/league/weekHelpers";
import { pointsFromRow } from "@/lib/scoring";
import { JERSEYS } from "@/lib/teams/images";

export type ViewMode = "Projected" | "Fixture" | "Latest Score" | "PPG" | "LastSeason" | "Per80" | "Form";

/** Slot layout exactly as you provided */
/** a lineup slot ("prop1", "bench2", or a custom squad's "tightfive1"...: lib/league/squad.ts) */
export type SlotId = string;


/** Match your player shape from draft/player JSON */
export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string; // or team name (we handle both)
  posAbbrev: string; // e.g. PROP / HOOKER / etc (or your abbreviations)
  secondaryPosAbbrev?: string | null;
  posName: string;
  secondaryPosName?: string | null;
  draftRank?: number;
};

export type AnyFixture = Fixture & {
  id: string;
  week: number;
  kickoffAt: string | number;
  status?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

export type SlotDef = {
  id: SlotId;
  label: string; // for empty state ("Loose Forward" shows on two lines)
  starter: boolean; // starters shown on field
};

export function normalizeTeamCode(teamCodeOrName: string) {
  const raw = (teamCodeOrName ?? "").trim();
  if (!raw) return "TBD";
  const upper = raw.toUpperCase();

  // ✅ hard aliases
  if (upper === "MOP") return "MOA";
  if (upper === "MOA") return "MOA";
  if (upper === "MOANA") return "MOA";

  // If it's already a 3-letter code, use it
  if (upper.length === 3) return upper;

  // Otherwise derive a 3-letter abbrev from the name (moana -> MOA)
  return abbrevTeam(raw).toUpperCase();
}

export function jerseySrcForTeam(teamCodeOrName: string) {
  const code = normalizeTeamCode(teamCodeOrName);
  const j = JERSEYS[code];

  // Team Selection: prefer FRONT, else ANGLE, else SINGLE, else placeholder
  return (
    j?.front ??
    j?.angle ??
    j?.single ??
    "/images/jersey-placeholder.webp"
  );
}

/** Empty-tile names for each kind of starting slot. */
export const KIND_TILE_LABEL: Record<SlotKind, string> = {
  PR: "Prop", HO: "Hooker", LK: "Lock", LF: "Loose Forward", HB: "Halfback", FH: "Flyhalf", CE: "Centre", OB: "Outside Back",
  TF: "Tight Five", HV: "Halves", FW: "Forward", BK: "Back", ANY: "Any",
};

/** The league's slots in order (Standard: prop1, hooker1, prop2, ... outsideback3, bench1-5). */
export function slotDefsFor(format: SquadFormat): SlotDef[] {
  const { starters, bench } = squadSlots(format);
  return [
    ...starters.map((s) => ({ id: s.id, label: KIND_TILE_LABEL[s.kind], starter: true })),
    ...bench.map((id) => ({ id, label: "Sub", starter: false })),
  ];
}

export function isFixtureComplete(f: AnyFixture) {
  if ((f.status ?? "").toLowerCase() === "complete") return true;
  if (f.homeScore != null && f.awayScore != null) return true;
  return false;
}

export function formatDeadline(dtMs: number, timeZone?: string) {
  const d = new Date(dtMs);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(d);
}

/** --- Field placement (percent coords): a row per line of the team (lib/league/squad.ts pitchRows) --- */
export const ROW_LEFTS: Record<number, string[]> = { 1: ["50%"], 2: ["38%", "62%"], 3: ["24%", "50%", "76%"], 4: ["14%", "38%", "62%", "86%"] };
export const STANDARD_ROW_TOPS = [14, 29, 44.5, 60, 75.5, 90.5];
/**
 * Pitch height: 520px for 6 rows (Standard), taller for bigger squads. Smaller squads (e.g. 10
 * starters, 4 rows) get a shorter pitch with the rows the same distance apart as Standard's,
 * so the tiles sit close together and the subs box comes up under them (Ethan, 19 Nov 2026).
 */
export const COMPACT_FIRST_TOP = 66; // px, like Standard's first row
export const COMPACT_ROW_GAP = 80; // px, like Standard's rows
export const pitchHeight = (rows: number) =>
  rows < 6 ? COMPACT_FIRST_TOP + (rows - 1) * COMPACT_ROW_GAP + 54 : Math.max(520, rows * 87);
export function fieldPositionsFor(format: SquadFormat): Record<SlotId, { top: string; left: string }> {
  const rows = pitchRows(format);
  const n = rows.length;
  const tops =
    n === 6
      ? STANDARD_ROW_TOPS.map((t) => `${t}%`)
      : n < 6
        ? rows.map((_, i) => `${COMPACT_FIRST_TOP + i * COMPACT_ROW_GAP}px`)
        : rows.map((_, i) => `${10 + (i * 80) / (n - 1)}%`);
  const out: Record<SlotId, { top: string; left: string }> = {};
  rows.forEach((row, i) => row.forEach((id, j) => (out[id] = { top: tops[i], left: (ROW_LEFTS[row.length] ?? ROW_LEFTS[3])[j] })));
  return out;
}

export type Lineup = Record<SlotId, Player | null>;

export function reconcileLineupWithRoster(prev: Lineup, rosterPool: Player[], SLOT_DEFS: SlotDef[]): Lineup {
  const BENCH_IDS = SLOT_DEFS.filter((s) => !s.starter).map((s) => s.id);
  const owned = new Map(rosterPool.map((p) => [p.id, p]));

  // 1) Remove players no longer owned, and refresh objects from rosterPool (so updated fields come through).
  //    Only this league's slots are kept (a lineup saved under other slot names starts again).
  const cleaned: Lineup = Object.fromEntries(SLOT_DEFS.map((s) => [s.id, prev?.[s.id] ?? null]));
  for (const s of SLOT_DEFS) {
    const p = cleaned[s.id];
    if (!p?.id) continue;

    const liveOwned = owned.get(p.id);
    if (!liveOwned) cleaned[s.id] = null;          // dropped
    else cleaned[s.id] = liveOwned;                // refresh to owned copy
  }

  // 2) Figure out who is already placed
  const placed = new Set<string>();
  for (const s of SLOT_DEFS) {
    const p = cleaned[s.id];
    if (p?.id) placed.add(p.id);
  }

  // 3) Remaining owned players not currently in lineup
  const remaining: Player[] = rosterPool.filter((p) => !placed.has(p.id));

  // 4) Fill empty starter slots with best-fitting remaining players
  for (const s of SLOT_DEFS) {
    if (!s.starter) continue;
    if (cleaned[s.id]) continue;

    const idx = remaining.findIndex((p) => canPlayerFitSlot(p, s));
    if (idx >= 0) cleaned[s.id] = remaining.splice(idx, 1)[0];
  }

  // 5) Fill bench slots with anything left
  for (const id of BENCH_IDS) {
    if (cleaned[id]) continue;
    cleaned[id] = remaining.shift() ?? null;
  }

  return cleaned;
}
export function canPlayerFitSlot(player: Player, slot: SlotDef) {
  // bench: anyone; starting slots: the league's squad rules (positions or groups)
  return slotAccepts(slot.id, player);
}

export function abbrevTeam(name: string) {
  const s = (name ?? "").trim();
  if (!s) return "TBD";
  // 3-letter-ish
  return s.slice(0, 3).toUpperCase();
}

export function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function fixtureTeamCode(nameOrCode: string) {
  return normalizeTeamCode(nameOrCode ?? "");
}


/** The player ids on a roster row (slots + wildcards, or a plain playerIds list). */
export function rosterRowToPlayerIds(data: any): string[] {
  const ids: string[] = [];

  // TeamRosterState style: { slots: { HO: [{id}], PR: [{id}], ... }, wildcards: [{id}] }
  const slots = data?.slots;
  if (slots && typeof slots === "object") {
    for (const arr of Object.values(slots)) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        const id = String((p as any)?.id ?? "");
        if (id) ids.push(id);
      }
    }
  }

  const wcs = data?.wildcards;
  if (Array.isArray(wcs)) {
    for (const p of wcs) {
      const id = String((p as any)?.id ?? "");
      if (id) ids.push(id);
    }
  }

  // fallback support: if you ever stored {playerIds:[...]}
  if (!ids.length && Array.isArray(data?.playerIds)) {
    for (const x of data.playerIds) {
      const id = String(x ?? "");
      if (id) ids.push(id);
    }
  }

  // unique
  return Array.from(new Set(ids));
}

// Best-effort: the stat row's player and round (so we can sort)
export function rowPlayerId(row: any) {
  return pickValue(row, [
    // prefer explicit sheet player id columns
    "playerId",
    "player_id",
    "player id",
    "playerID",
    "Player ID",
    "PlayerId",

    // fallbacks commonly used in other exports
    "id",
    "draftId",
    "draft_id",
    "Draft ID",
    "playerKey",
  ]);
}

export function rowRound(row: any) {
  const v = pickValue(row, [
    "round",
    "Round",
    "week",
    "Week",
    "gameweek",
    "Gameweek",
    "GW",
    "Round #",
    "Week #",
  ]);

  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcFantasyPoints(row: any, player?: Player | null): number {
  return pointsFromRow(row, player ?? null);
}

export type SwapPlan = { kind: "direct" } | { kind: "pivot"; pivotId: SlotId };

/**
 * Can these two tiles swap? Directly, or (for a starting slot) by moving a third starter round
 * ("pivot"): pivot <- source, target <- pivot, source <- target. Bench tiles never pivot.
 */
export function swapPlanFor(fromId: SlotId, toId: SlotId, l: Lineup, SLOT_DEFS: SlotDef[], STARTER_IDS: SlotId[]): SwapPlan | null {
  if (fromId === toId) return null;

  const fromSlot = SLOT_DEFS.find((x) => x.id === fromId)!;
  const toSlot = SLOT_DEFS.find((x) => x.id === toId)!;

  const a = l[fromId];
  const b = l[toId];

  // must swap with another PLAYER tile (no empty)
  if (!a || !b) return null;

  // ✅ Direct swap (always allowed if legal)
  if (canPlayerFitSlot(a, toSlot) && canPlayerFitSlot(b, fromSlot)) {
    return { kind: "direct" };
  }

  // ✅ IMPORTANT: Pivot rearrange ONLY to solve STARTING-LINEUP placement
  // If the user tapped a bench tile as the TARGET, do NOT attempt a pivot.
  if (!toSlot.starter) return null;

  // Quick reject: if target player can't go back to fromSlot, no pivot can fix it
  if (!canPlayerFitSlot(b, fromSlot)) return null;

  // Pivot must be a STARTER slot (so rearrange never shuffles bench)
  for (const pivotId of STARTER_IDS) {
    if (pivotId === fromId || pivotId === toId) continue;

    const pSlot = SLOT_DEFS.find((x) => x.id === pivotId)!;
    const c = l[pivotId];
    if (!c) continue;

    // rotation:
    // pivot <- source (a)
    // target <- pivot (c)
    // source <- target (b)

    if (!canPlayerFitSlot(a, pSlot)) continue;     // a can go to pivot
    if (!canPlayerFitSlot(c, toSlot)) continue;   // c can go to target

    return { kind: "pivot", pivotId };
  }

  return null;
}

/** small time tick hook (same idea as your other pages) */
export function useNowTick(ms = 500) {
  // the time is kept in state and moved on by the timer (not read while drawing; React 19 rules)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
