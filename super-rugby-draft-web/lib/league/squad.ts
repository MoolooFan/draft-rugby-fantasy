// lib/league/squad.ts
// A league's squad: its starting spots, bench size and IR spots (Ethan, 19 Nov 2026).
// The commissioner can change it before the draft (League Settings / Create League); it locks
// when the draft starts. Standard is the usual 15 + 5 bench + 1 IR.
//
// Starting spots are "flex slots" (like ESPN): a slot is a position (PR, HO, LK, LF, HB, FH, CE,
// OB) or a group: Tight five (PR, HO, LK), Halves (HB, FH), Forward (any forward), Back (any back)
// or Any. E.g. 10 starters = 3 Tight five + 2 Forward + 2 Halves + 3 Back.
//
// The roster is the starting spots + the bench: a team must always be able to fill every
// starting spot (draft, adds, trades), and the bench takes anyone. Pure code (browser + server).
import { playerPositions } from "@/lib/players/positions";

export type SlotKind = "PR" | "HO" | "LK" | "LF" | "HB" | "FH" | "CE" | "OB" | "TF" | "HV" | "FW" | "BK" | "ANY";

export const FORWARD_POSITIONS = ["PR", "HO", "LK", "LF"];
export const BACK_POSITIONS = ["HB", "FH", "CE", "OB"];

/** Every kind, in the order the settings list them. */
export const SLOT_KINDS: Array<{ kind: SlotKind; label: string; short: string; positions: string[]; slotName: string }> = [
  { kind: "PR", label: "Prop", short: "PR", positions: ["PR"], slotName: "prop" },
  { kind: "HO", label: "Hooker", short: "HO", positions: ["HO"], slotName: "hooker" },
  { kind: "LK", label: "Lock", short: "LK", positions: ["LK"], slotName: "lock" },
  { kind: "LF", label: "Loose forward", short: "LF", positions: ["LF"], slotName: "looseforward" },
  { kind: "HB", label: "Halfback", short: "HB", positions: ["HB"], slotName: "halfback" },
  { kind: "FH", label: "Flyhalf", short: "FH", positions: ["FH"], slotName: "flyhalf" },
  { kind: "CE", label: "Centre", short: "CE", positions: ["CE"], slotName: "centre" },
  { kind: "OB", label: "Outside back", short: "OB", positions: ["OB"], slotName: "outsideback" },
  { kind: "TF", label: "Tight five", short: "TF", positions: ["PR", "HO", "LK"], slotName: "tightfive" },
  { kind: "HV", label: "Halves", short: "HV", positions: ["HB", "FH"], slotName: "halves" },
  { kind: "FW", label: "Forward", short: "FWD", positions: FORWARD_POSITIONS, slotName: "forward" },
  { kind: "BK", label: "Back", short: "BCK", positions: BACK_POSITIONS, slotName: "back" },
  { kind: "ANY", label: "Any position", short: "ANY", positions: [...FORWARD_POSITIONS, ...BACK_POSITIONS], slotName: "utility" },
];
const KIND = new Map(SLOT_KINDS.map((k) => [k.kind, k]));
const KIND_BY_SLOT_NAME = new Map(SLOT_KINDS.map((k) => [k.slotName, k.kind]));

export type SquadFormat = {
  /** How many starting spots of each kind. */
  starters: Partial<Record<SlotKind, number>>;
  bench: number;
  ir: number;
};

export const STANDARD_SQUAD: SquadFormat = {
  starters: { PR: 2, HO: 1, LK: 2, LF: 3, HB: 1, FH: 1, CE: 2, OB: 3 },
  bench: 5,
  ir: 1,
};

/**
 * The set 10-starter squad (Ethan, 19 Nov 2026): 5 forwards (3 of them tight five) and 5 backs
 * (2 of them halves), 5 bench, 1 IR.
 */
export const TEN_SQUAD: SquadFormat = {
  starters: { TF: 3, FW: 2, HV: 2, BK: 3 },
  bench: 5,
  ir: 1,
};

/** Are these the same squad? */
export function sameSquad(a: SquadFormat | null | undefined, b: SquadFormat | null | undefined): boolean {
  return squadKey(a ?? STANDARD_SQUAD) === squadKey(b ?? STANDARD_SQUAD);
}

export const SQUAD_LIMITS = { startersMin: 5, startersMax: 23, benchMax: 10, irMax: 3, rosterMax: 30 } as const;
/** Most teams a league can have (Ethan, 19 Nov 2026). */
export const MAX_LEAGUE_TEAMS = 16;

export const starterCount = (f: SquadFormat) => Object.values(f.starters).reduce((a, b) => a + (b ?? 0), 0);
/** Players on a roster (not counting IR). */
export const rosterSize = (f: SquadFormat) => starterCount(f) + f.bench;

export function isStandardSquad(f: SquadFormat | null | undefined): boolean {
  if (!f) return true;
  const a = squadKey(f);
  return a === squadKey(STANDARD_SQUAD);
}
const squadKey = (f: SquadFormat) =>
  JSON.stringify([SLOT_KINDS.map((k) => f.starters[k.kind] ?? 0), f.bench, f.ir]);

/** A saved / sent format, checked. Anything missing or broken = Standard. */
export function cleanSquadFormat(input: unknown): { format: SquadFormat; error?: string } {
  if (!input || typeof input !== "object") return { format: STANDARD_SQUAD };
  const raw = input as { starters?: Record<string, unknown>; bench?: unknown; ir?: unknown };
  const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  const starters: Partial<Record<SlotKind, number>> = {};
  for (const k of SLOT_KINDS) {
    const n = int(raw.starters?.[k.kind], SQUAD_LIMITS.rosterMax);
    if (n) starters[k.kind] = n;
  }
  const format: SquadFormat = { starters, bench: int(raw.bench, SQUAD_LIMITS.benchMax), ir: int(raw.ir, SQUAD_LIMITS.irMax) };
  const n = starterCount(format);
  if (n < SQUAD_LIMITS.startersMin || n > SQUAD_LIMITS.startersMax) {
    return { format: STANDARD_SQUAD, error: `A team needs ${SQUAD_LIMITS.startersMin} to ${SQUAD_LIMITS.startersMax} starters` };
  }
  if (rosterSize(format) > SQUAD_LIMITS.rosterMax) {
    return { format: STANDARD_SQUAD, error: `Starters and bench can be at most ${SQUAD_LIMITS.rosterMax} players` };
  }
  return { format };
}

/** The format for a league row's squad_format (null / broken = Standard). */
export function squadFormatOf(value: unknown): SquadFormat {
  return value ? cleanSquadFormat(value).format : STANDARD_SQUAD;
}

// ---------------------------------------------------------------------------
// Slots. Ids are the kind's slot name + a number ("prop1", "tightfive2", "bench3"), so Standard
// keeps the ids lineups have always used.

export type SquadSlots = {
  starters: Array<{ id: string; kind: SlotKind }>;
  bench: string[];
  all: string[];
};

/** Field order: front row (props either side of the hookers), tight five, locks, back row, ... */
const FIELD_ORDER: SlotKind[] = ["TF", "LK", "LF", "FW", "HB", "FH", "HV", "CE", "OB", "BK", "ANY"];

const slotCache = new Map<string, SquadSlots>();
export function squadSlots(f: SquadFormat = STANDARD_SQUAD): SquadSlots {
  const key = squadKey(f);
  const hit = slotCache.get(key);
  if (hit) return hit;
  const starters: SquadSlots["starters"] = [];
  const add = (kind: SlotKind, n: number) => starters.push({ id: `${KIND.get(kind)!.slotName}${n}`, kind });
  const props = f.starters.PR ?? 0;
  const hookers = f.starters.HO ?? 0;
  const firstProps = Math.ceil(props / 2);
  for (let i = 1; i <= firstProps; i++) add("PR", i);
  for (let i = 1; i <= hookers; i++) add("HO", i);
  for (let i = firstProps + 1; i <= props; i++) add("PR", i);
  for (const kind of FIELD_ORDER) for (let i = 1; i <= (f.starters[kind] ?? 0); i++) add(kind, i);
  const bench = Array.from({ length: f.bench }, (_, i) => `bench${i + 1}`);
  const out = { starters, bench, all: [...starters.map((s) => s.id), ...bench] };
  slotCache.set(key, out);
  return out;
}

export const isBenchSlot = (slotId: string) => /^bench\d+$/.test(slotId);

/** The kind of a starting slot id ("tightfive2" -> TF), or null for the bench / unknown ids. */
export function slotKind(slotId: string): SlotKind | null {
  const m = /^([a-z]+)\d+$/.exec(String(slotId));
  return m ? KIND_BY_SLOT_NAME.get(m[1]) ?? null : null;
}

/** Positions a starting slot accepts (empty for the bench: anyone). */
export function slotPositions(slotId: string): string[] {
  const k = slotKind(slotId);
  return k ? KIND.get(k)!.positions : [];
}

type HasPositions = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null; thirdPosAbbrev?: string | null } | Record<string, unknown>;

/** Can this player go in this slot? (Bench: anyone.) */
export function slotAccepts(slotId: string, player: HasPositions): boolean {
  if (isBenchSlot(slotId)) return true;
  const want = slotPositions(slotId);
  if (!want.length) return false;
  const has = playerPositions(player);
  return has.some((p) => want.includes(p));
}

export const kindLabel = (k: SlotKind) => KIND.get(k)?.label ?? k;
export const kindShort = (k: SlotKind) => KIND.get(k)?.short ?? k;

/** Short label for a slot on the pitch / matchup ("PR", "TF", "FWD", or "1" for bench1). */
export function slotShortLabel(slotId: string): string {
  if (isBenchSlot(slotId)) return slotId.slice(5);
  const k = slotKind(slotId);
  return k ? kindShort(k) : slotId;
}

/** "15 starters (2 PR, 1 HO, ...), 5 bench, 1 IR" */
export function squadSummary(f: SquadFormat): string {
  const parts = SLOT_KINDS.filter((k) => (f.starters[k.kind] ?? 0) > 0).map((k) => `${f.starters[k.kind]} ${k.short}`);
  return `${starterCount(f)} starters (${parts.join(", ")}), ${f.bench} bench, ${f.ir} IR`;
}

/**
 * The pitch's rows of starting slots (team selection): a row per line of the team, split so no
 * row has more than 3 (4 when a line has exactly 4).
 */
export function pitchRows(f: SquadFormat = STANDARD_SQUAD): string[][] {
  const { starters } = squadSlots(f);
  const lines: SlotKind[][] = [["PR", "HO"], ["TF"], ["LK"], ["LF"], ["FW"], ["HB", "FH", "HV"], ["CE"], ["OB"], ["BK"], ["ANY"]];
  const rows: string[][] = [];
  for (const kinds of lines) {
    const ids = starters.filter((s) => kinds.includes(s.kind)).map((s) => s.id);
    if (!ids.length) continue;
    const per = ids.length === 4 ? 4 : 3;
    for (let i = 0; i < ids.length; i += per) rows.push(ids.slice(i, i + per));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Roster rules

/** Match players to slots (each player one slot). Returns how many players got a slot. */
function matchPlayers(players: HasPositions[], slots: string[]): number {
  const fits = players.map((p) => slots.map((s, i) => (slotAccepts(s, p) ? i : -1)).filter((i) => i >= 0));
  const owner = new Array(slots.length).fill(-1);
  const place = (p: number, seen: boolean[]): boolean => {
    for (const s of fits[p]) {
      if (seen[s]) continue;
      seen[s] = true;
      if (owner[s] < 0 || place(owner[s], seen)) {
        owner[s] = p;
        return true;
      }
    }
    return false;
  };
  let n = 0;
  for (let p = 0; p < players.length; p++) if (place(p, new Array(slots.length).fill(false))) n++;
  return n;
}

/** Can these players all have a roster place (starting slots by position, bench = anyone)? */
export function squadFits(players: HasPositions[], f: SquadFormat = STANDARD_SQUAD): boolean {
  if (players.length > rosterSize(f)) return false;
  return matchPlayers(players, squadSlots(f).all) === players.length;
}

/** How many starting slots these players can't fill between them (0 = a full team is possible). */
export function squadStartingGaps(players: HasPositions[], f: SquadFormat = STANDARD_SQUAD): number {
  const slots = squadSlots(f).starters.map((s) => s.id);
  // match slots to players (a slot is "filled" if some player takes it)
  return slots.length - Math.min(slots.length, matchPlayers(players, slots));
}

/**
 * Put players into the squad's slots for showing a roster (draft room): starting slots first,
 * players earlier in the list get the first claim, the rest go on the bench.
 * Returns slot id -> player (or null).
 */
export function assignToSlots<T extends HasPositions>(players: T[], f: SquadFormat = STANDARD_SQUAD): Map<string, T | null> {
  const { starters, bench } = squadSlots(f);
  const slots = starters.map((s) => s.id);
  const fits = players.map((p) => slots.map((s, i) => (slotAccepts(s, p) ? i : -1)).filter((i) => i >= 0));
  const owner = new Array(slots.length).fill(-1);
  const place = (p: number, seen: boolean[]): boolean => {
    for (const s of fits[p]) {
      if (seen[s]) continue;
      seen[s] = true;
      if (owner[s] < 0 || place(owner[s], seen)) {
        owner[s] = p;
        return true;
      }
    }
    return false;
  };
  for (let p = 0; p < players.length; p++) place(p, new Array(slots.length).fill(false));
  const out = new Map<string, T | null>();
  const used = new Set<number>();
  slots.forEach((id, i) => {
    out.set(id, owner[i] >= 0 ? players[owner[i]] : null);
    if (owner[i] >= 0) used.add(owner[i]);
  });
  const rest = players.filter((_, i) => !used.has(i));
  bench.forEach((id, i) => out.set(id, rest[i] ?? null));
  return out;
}
