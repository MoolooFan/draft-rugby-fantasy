// app/team-of-the-week/helpers.ts
// Team of the Week's helpers (moved out of page.tsx, 20 Nov 2026): the 15 starting spots and
// where they sit on the field, a round's points, picking the best player for each spot and who
// owns which player.
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { pointsFromRow } from "@/lib/scoring";
import { playerPositions } from "@/lib/players/positions";
import { JERSEYS, JERSEY_PLACEHOLDER } from "@/lib/teams/images";

// -----------------------
// Types / helpers
// -----------------------
export type AnyFixture = {
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
};

// -----------------------
// Slot model = Team Selection starters (no bench)
// -----------------------
export type SlotId =
  | "prop1"
  | "hooker1"
  | "prop2"
  | "lock1"
  | "lock2"
  | "looseforward1"
  | "looseforward2"
  | "looseforward3"
  | "halfback1"
  | "flyhalf1"
  | "centre1"
  | "centre2"
  | "outsideback1"
  | "outsideback2"
  | "outsideback3";

export type PosGroup = "PROP" | "HOOKER" | "LOCK" | "LOOSE" | "HB" | "FH" | "CENTRE" | "OB";

export type SlotDef = {
  id: SlotId;
  label: string;
  group: PosGroup;
};

export const SLOT_DEFS: SlotDef[] = [
  { id: "prop1", label: "Prop", group: "PROP" },
  { id: "hooker1", label: "Hooker", group: "HOOKER" },
  { id: "prop2", label: "Prop", group: "PROP" },

  { id: "lock1", label: "Lock", group: "LOCK" },
  { id: "lock2", label: "Lock", group: "LOCK" },

  { id: "looseforward1", label: "Loose", group: "LOOSE" },
  { id: "looseforward2", label: "Loose", group: "LOOSE" },
  { id: "looseforward3", label: "Loose", group: "LOOSE" },

  { id: "halfback1", label: "Halfback", group: "HB" },
  { id: "flyhalf1", label: "Flyhalf", group: "FH" },

  { id: "centre1", label: "Centre", group: "CENTRE" },
  { id: "centre2", label: "Centre", group: "CENTRE" },

  { id: "outsideback1", label: "Outside", group: "OB" },
  { id: "outsideback2", label: "Outside", group: "OB" },
  { id: "outsideback3", label: "Outside", group: "OB" },
];

// Same placement map as Team Selection starters
export const FIELD_POS: Record<SlotId, { top: string; left: string }> = {
  prop1: { top: "14%", left: "24%" },
  hooker1: { top: "14%", left: "50%" },
  prop2: { top: "14%", left: "76%" },

  lock1: { top: "29%", left: "38%" },
  lock2: { top: "29%", left: "62%" },

  looseforward1: { top: "44.5%", left: "24%" },
  looseforward2: { top: "44.5%", left: "50%" },
  looseforward3: { top: "44.5%", left: "76%" },

  halfback1: { top: "60%", left: "38%" },
  flyhalf1: { top: "60%", left: "62%" },

  centre1: { top: "75.5%", left: "38%" },
  centre2: { top: "75.5%", left: "62%" },

  outsideback1: { top: "90.5%", left: "24%" },
  outsideback2: { top: "90.5%", left: "50%" },
  outsideback3: { top: "90.5%", left: "76%" },
};

// -----------------------
// Player model (best-effort from store)
// -----------------------
export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string; // HO/PR/LK/LF/HB/FH/CE/OB etc
  secondaryPosAbbrev?: string | null;
  posName?: string; // optional
  status?: any;
  weeklyStatus?: any;
};

export function pickStr(v: any) {
  return String(v ?? "").trim();
}

// Same position matching rules as Team Selection
export function canPlayerFitSlot(player: Player, slot: SlotDef) {
  // any of the player's positions (up to three)
  const either = (fn: (p: string) => boolean) => playerPositions(player).some(fn);

  if (slot.group === "PROP") return either((p) => p.includes("PROP") || p === "PR");
  if (slot.group === "HOOKER") return either((p) => p.includes("HOOK") || p === "HO");
  if (slot.group === "LOCK") return either((p) => p.includes("LOCK") || p === "LK");
  if (slot.group === "LOOSE") return either((p) => p.includes("LOOSE") || p === "LF");

  if (slot.group === "HB") return either((p) => p.includes("HALF") || p === "HB");
  if (slot.group === "FH") return either((p) => p.includes("FLY") || p === "FH");

  if (slot.group === "CENTRE") return either((p) => p.includes("CENTRE") || p === "CE");
  if (slot.group === "OB") return either((p) => p.includes("OUT") || p.includes("BACK") || p === "OB");

  return false;
}

export function jerseySrcForTeam(teamCodeOrName: string) {
  const code = normalizeTeamCode(teamCodeOrName);
  const j = JERSEYS[code];
  return j?.front ?? j?.angle ?? j?.single ?? JERSEY_PLACEHOLDER;
}

// -----------------------
// Points (same as dashboard)
// -----------------------
export function rowPlayerId(row: any) {
  return row?.playerId ?? row?.["Player ID"] ?? row?.player_id ?? row?.id ?? null;
}
export function rowRound(row: any) {
  const v = row?.round ?? row?.Round ?? row?.week ?? row?.Week ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcFantasyPoints(row: any, player?: Player | null): number {
  return pointsFromRow(row, player ?? null);
}

// -----------------------
// Build TOTW lineup (greedy best-by-slot)
// -----------------------
export type Lineup = Record<SlotId, Player | null>;

export function buildTeamOfWeek(players: Player[], pointsById: Map<string, number>): Lineup {
  const empty = Object.fromEntries(SLOT_DEFS.map((s) => [s.id, null])) as Lineup;

  const sorted = players.slice().sort((a, b) => {
    const ap = pointsById.get(a.id.toLowerCase()) ?? 0;
    const bp = pointsById.get(b.id.toLowerCase()) ?? 0;
    if (bp !== ap) return bp - ap;
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  const used = new Set<string>();
  const next: Lineup = { ...empty };

  for (const slot of SLOT_DEFS) {
    const pickIdx = sorted.findIndex((p) => !used.has(p.id) && canPlayerFitSlot(p, slot));
    if (pickIdx >= 0) {
      const p = sorted[pickIdx];
      next[slot.id] = p;
      used.add(p.id);
    }
  }

  return next;
}

// -----------------------
// Rosters ownership helpers (same logic as Team Selection)
// -----------------------
export function rosterRowToPlayerIds(data: any): string[] {
  const ids: string[] = [];

  const slots = data?.slots;
  if (slots && typeof slots === "object") {
    for (const arr of Object.values(slots)) {
      if (!Array.isArray(arr)) continue;
      for (const p of arr as any[]) {
        const id = String(p?.id ?? "");
        if (id) ids.push(id);
      }
    }
  }

  const wcs = data?.wildcards;
  if (Array.isArray(wcs)) {
    for (const p of wcs as any[]) {
      const id = String(p?.id ?? "");
      if (id) ids.push(id);
    }
  }

  if (!ids.length && Array.isArray(data?.playerIds)) {
    for (const x of data.playerIds) {
      const id = String(x ?? "");
      if (id) ids.push(id);
    }
  }

  return Array.from(new Set(ids));
}

export function safeLower(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

export const POS_NAME: Record<string, string> = {
  PR: "Prop",
  HO: "Hooker",
  LK: "Lock",
  LF: "Loose Forward",
  HB: "Halfback",
  FH: "Flyhalf",
  CE: "Centre",
  OB: "Outside Back",
};
