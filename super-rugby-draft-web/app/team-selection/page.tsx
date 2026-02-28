"use client";

import React, { useEffect, useMemo, useState } from "react";


import { AppMenu } from "@/components/AppMenu";
import { PlayerCardModal } from "@/components/PlayerCardModal";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { useTransactionsStore } from "@/lib/transactions/store";

import fixturesData from "@/data/fixtures-2026.json";
import type { Fixture } from "@/lib/fixtures/types";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { getActiveUsername, getActiveTimezone } from "@/lib/session";
import { usePlayersStore } from "@/lib/players/store";
import playersData from "@/data/players.json";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";

type ViewMode = "Fixture" | "Latest Score" | "PPG" | "Form";

/** Slot layout exactly as you provided */
type SlotId =
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
  | "outsideback3"
  | "bench1"
  | "bench2"
  | "bench3"
  | "bench4"
  | "bench5";


type PosGroup =
  | "PROP"
  | "HOOKER"
  | "LOCK"
  | "LOOSE"
  | "HB"
  | "FH"
  | "CENTRE"
  | "OB"
  | "WC";

/** Match your player shape from draft/player JSON */
type Player = {
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

type AnyFixture = Fixture & {
  id: string;
  week: number;
  kickoffAt: string | number;
  status?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

type SlotDef = {
  id: SlotId;
  label: string; // for empty state
  group: PosGroup;
  starter: boolean; // starters shown on field
};

// --- Jerseys (Team Selection uses FRONT if available, else fallback) ---
const JERSEYS: Record<
  string,
  { front?: string; angle?: string; single?: string }
> = {
  BLU: { front: "/images/jerseys/BLUJerseyFront.png", angle: "/images/jerseys/BLUJerseyAngle.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },

  CHI: { front: "/images/jerseys/CHIJerseyFront.png", angle: "/images/jerseys/CHIJerseyAngle.png" },
  CRU: { front: "/images/jerseys/CRUJerseyFront.png", angle: "/images/jerseys/CRUJerseyAngle.png" },

  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },

  HIG: { front: "/images/jerseys/HIGJerseyFront.png", angle: "/images/jerseys/HIGJerseyAngle.png" },
  HUR: { front: "/images/jerseys/HURJerseyFront.png", angle: "/images/jerseys/HURJerseyAngle.png" },
 // ✅ add this (Moana)
  MOA: { front: "/images/jerseys/MOPJerseyFront.png", angle: "/images/jerseys/MOPJerseyAngle.png" },

  MOP: { front: "/images/jerseys/MOPJerseyFront.png", angle: "/images/jerseys/MOPJerseyAngle.png" },

  RED: { single: "/images/jerseys/REDJersey.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};

function extractPlayerIdsFromRosterData(data: any): string[] {
  if (!data || typeof data !== "object") return [];

  // ✅ preferred modern shape
  const pidArr = data.playerIds;
  if (Array.isArray(pidArr)) {
    return pidArr.map((x: any) => String(x)).filter(Boolean);
  }

  // ✅ legacy/other shape: { slots: { CE: [{id}], PR: [{id}], ... } }
  const slots = data.slots;
  if (slots && typeof slots === "object") {
    const out: string[] = [];
    for (const v of Object.values(slots)) {
      if (Array.isArray(v)) {
        for (const item of v) {
          const id = item?.id;
          if (id) out.push(String(id));
        }
      } else if (v && typeof v === "object") {
        // if a slot ever stored a single object instead of array
        const id = (v as any).id;
        if (id) out.push(String(id));
      }
    }
    // unique
    return Array.from(new Set(out)).filter(Boolean);
  }

  return [];
}

function normalizeTeamCode(teamCodeOrName: string) {
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


function jerseySrcForTeam(teamCodeOrName: string) {
  const code = normalizeTeamCode(teamCodeOrName);
  const j = JERSEYS[code];

  // Team Selection: prefer FRONT, else ANGLE, else SINGLE, else placeholder
  return (
    j?.front ??
    j?.angle ??
    j?.single ??
    "/images/jersey-placeholder.png"
  );
}

/** --- Slot defs in EXACT order you gave --- */
const SLOT_DEFS: SlotDef[] = [
  { id: "prop1", label: "Prop", group: "PROP", starter: true },
  { id: "hooker1", label: "Hooker", group: "HOOKER", starter: true },
  { id: "prop2", label: "Prop", group: "PROP", starter: true },
  { id: "lock1", label: "Lock", group: "LOCK", starter: true },
  { id: "lock2", label: "Lock", group: "LOCK", starter: true },
  { id: "looseforward1", label: "Loose", group: "LOOSE", starter: true },
  { id: "looseforward2", label: "Loose", group: "LOOSE", starter: true },
  { id: "looseforward3", label: "Loose", group: "LOOSE", starter: true },
  { id: "halfback1", label: "Halfback", group: "HB", starter: true },
  { id: "flyhalf1", label: "Flyhalf", group: "FH", starter: true },
  { id: "centre1", label: "Centre", group: "CENTRE", starter: true },
  { id: "centre2", label: "Centre", group: "CENTRE", starter: true },
  { id: "outsideback1", label: "Outside", group: "OB", starter: true },
  { id: "outsideback2", label: "Outside", group: "OB", starter: true },
  { id: "outsideback3", label: "Outside", group: "OB", starter: true },

  
    // Bench (5 wildcards, no position restrictions)
  { id: "bench1", label: "Sub", group: "WC", starter: false },
  { id: "bench2", label: "Sub", group: "WC", starter: false },
  { id: "bench3", label: "Sub", group: "WC", starter: false },
  { id: "bench4", label: "Sub", group: "WC", starter: false },
  { id: "bench5", label: "Sub", group: "WC", starter: false },

];


const STARTER_IDS: SlotId[] = SLOT_DEFS.filter((s) => s.starter).map((s) => s.id);
const BENCH_IDS: SlotId[] = SLOT_DEFS.filter((s) => !s.starter).map((s) => s.id);

function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

function isFixtureComplete(f: AnyFixture) {
  if ((f.status ?? "").toLowerCase() === "complete") return true;
  if (f.homeScore != null && f.awayScore != null) return true;
  return false;
}

// function getSelectionDeadlineMs(firstKickoffMs: number) {
  // 2 hours before
//  return firstKickoffMs - 1 * 60 * 60 * 1000;
// }

function pad2(n: number) {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s;
}

function formatCountdown(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
}

function matchupSnapshotKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_snapshot_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

function getWeekFirstKickoffMs(fixtures: AnyFixture[], week: number) {
  const wk = fixtures.filter((f) => f.week === week);
  if (!wk.length) return 0;
  return Math.min(...wk.map((f: any) => f.kickoffMs ?? toMs(f.kickoffAt)));
}

function getWeekDeadlineMs(fixtures: AnyFixture[], realWeek: number) {
  const first = getWeekFirstKickoffMs(fixtures, realWeek);
  return first ? selectionDeadlineFromFirstKickoff(first) : 0;
}

function getWeeksSorted(fixtures: AnyFixture[]) {
  return Array.from(new Set(fixtures.map((f) => f.week))).sort((a, b) => a - b);
}


type LockedSnapshot = {
  week: number;
  teamId: string;
  lockedAtMs: number;
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
};

function formatDeadline(dtMs: number, timeZone?: string) {
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

/** --- Figma-ish field placement (percent coords) --- */
const FIELD_POS: Record<SlotId, { top: string; left: string }> = {
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

  // Bench positions are not on field:
    // Bench positions are not on field:
  bench1: { top: "0%", left: "0%" },
  bench2: { top: "0%", left: "0%" },
  bench3: { top: "0%", left: "0%" },
  bench4: { top: "0%", left: "0%" },
  bench5: { top: "0%", left: "0%" },

};

type Lineup = Record<SlotId, Player | null>;

function reconcileLineupWithRoster(prev: Lineup, rosterPool: Player[]): Lineup {
  const owned = new Map(rosterPool.map((p) => [p.id, p]));

  // 1) Remove players no longer owned, and refresh objects from rosterPool (so updated fields come through)
  const cleaned: Lineup = { ...prev };
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
function canPlayerFitSlot(player: Player, slot: SlotDef) {
  if (slot.group === "WC") return true;

  const primary = (player.posAbbrev ?? "").toUpperCase();
  const secondary = (player.secondaryPosAbbrev ?? "").toUpperCase();

  // Helper: true if either primary or secondary matches the rule
  const either = (fn: (p: string) => boolean) => fn(primary) || fn(secondary);

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


function abbrevTeam(name: string) {
  const s = (name ?? "").trim();
  if (!s) return "TBD";
  // 3-letter-ish
  return s.slice(0, 3).toUpperCase();
}
function pickValue(row: any, candidates: string[]) {
  if (!row || typeof row !== "object") return null;

  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

  // Build a lookup of normalizedKey -> actualKey
  const keyMap = new Map<string, string>();
  for (const k of Object.keys(row)) keyMap.set(norm(k), k);

  for (const c of candidates) {
    const k = keyMap.get(norm(c));
    if (k != null) {
      const v = (row as any)[k];
      if (v !== undefined && v !== null && v !== "") return v;
    }
  }
  return null;
}

function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fixtureTeamCode(nameOrCode: string) {
  return normalizeTeamCode(nameOrCode ?? "");
}

function lineupDraftStorageKey(leagueId: string, teamId: string) {
  return `ts_lineup_${leagueId}_${teamId}`;
}

function syncLineupToRoster(prev: Lineup, rosterPool: Player[]) {
  const ownedById = new Map(rosterPool.map((p) => [p.id, p]));
  const used = new Set<string>();

  // start with empty lineup
  const empty = Object.fromEntries(SLOT_DEFS.map((s) => [s.id, null])) as Lineup;
  const next: Lineup = { ...empty };

  // 1) Keep existing players where possible (still owned + still fits slot)
  for (const s of SLOT_DEFS) {
    const p = prev[s.id];
    if (!p?.id) continue;

    const owned = ownedById.get(p.id);
    if (!owned) continue; // dropped

    if (!canPlayerFitSlot(owned, s)) continue; // doesn’t fit anymore (rare, but safe)

    next[s.id] = owned;
    used.add(owned.id);
  }

  // remaining players not yet placed
  const remaining: Player[] = rosterPool.filter((p) => !used.has(p.id));

  const takeForSlot = (slot: SlotDef) => {
    const idx = remaining.findIndex((p) => canPlayerFitSlot(p, slot));
    if (idx >= 0) return remaining.splice(idx, 1)[0];
    return null;
  };

  // 2) Fill STARTERS with best-fitting remaining players
  for (const s of SLOT_DEFS) {
    if (!s.starter) continue;
    if (next[s.id]) continue;
    next[s.id] = takeForSlot(s);
  }

  // 3) Fill BENCH (wildcards = any position)
  for (const s of SLOT_DEFS) {
    if (s.starter) continue;
    if (next[s.id]) continue;
    next[s.id] = remaining.shift() ?? null;
  }

  // Did anything actually change?
  const changed =
    JSON.stringify(Object.values(prev).map((p) => p?.id ?? null)) !==
    JSON.stringify(Object.values(next).map((p) => p?.id ?? null));

  return { next, changed };
}

export default function TeamSelectionPage() {
  useRequireSession();
  // (router not needed anymore unless you use it elsewhere)

  // --- prevent hydration mismatch before zustand persist finishes ---
const [leagueHydrated, setLeagueHydrated] = useState(() =>
  // @ts-ignore
  useLeagueStore.persist?.hasHydrated?.() ?? true
);
const [draftHydrated, setDraftHydrated] = useState(() =>
  // @ts-ignore
  useDraftStore.persist?.hasHydrated?.() ?? true
);
const [txnHydrated, setTxnHydrated] = useState(() =>
  // @ts-ignore
  useTransactionsStore.persist?.hasHydrated?.() ?? true
);

useEffect(() => {
  // @ts-ignore
  const p = useLeagueStore.persist;
  if (!p?.onFinishHydration) { setLeagueHydrated(true); return; }
  setLeagueHydrated(p.hasHydrated());
  const unsub = p.onFinishHydration(() => setLeagueHydrated(true));
  return () => { try { unsub?.(); } catch {} };
}, []);

useEffect(() => {
  // @ts-ignore
  const p = useDraftStore.persist;
  if (!p?.onFinishHydration) { setDraftHydrated(true); return; }
  setDraftHydrated(p.hasHydrated());
  const unsub = p.onFinishHydration(() => setDraftHydrated(true));
  return () => { try { unsub?.(); } catch {} };
}, []);

useEffect(() => {
  // @ts-ignore
  const p = useTransactionsStore.persist;
  if (!p?.onFinishHydration) { setTxnHydrated(true); return; }
  setTxnHydrated(p.hasHydrated());
  const unsub = p.onFinishHydration(() => setTxnHydrated(true));
  return () => { try { unsub?.(); } catch {} };
}, []);

  // Menu + league swap
  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useLeagueStore((s) => s.activeLeague());
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  const userId = useMemo(() => getActiveUsername(), []);
  const userTz = useMemo(() => getActiveTimezone(), []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ready = mounted && leagueHydrated && draftHydrated && txnHydrated;


  // Determine your team in the active league
  const leagueTeams = useMemo(() => {
  return Array.isArray(activeLeague?.teams) ? activeLeague!.teams : [];
}, [activeLeague?.teams]);

type RosterData = { slots?: Record<string, Array<{ id: string }>>; wildcards?: Array<{ id: string }> };

const [serverRosters, setServerRosters] = useState<Map<string, { playerIds: string[] }>>(new Map());

const playersById = useMemo(() => {
  const m = new Map<string, Player>();
  for (const p of (playersData as any[])) {
    if (!p?.id) continue;
    m.set(String(p.id), p as Player);
  }
  return m;
}, []);

function rosterRowToPlayerIds(data: any): string[] {
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

useEffect(() => {
  const leagueId = activeLeague?.id;
  if (!leagueId) return;

  fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) return;
      const rows = Array.isArray(j.data) ? j.data : [];

      const m = new Map<string, { playerIds: string[] }>();
      for (const row of rows) {
        const teamId = String(row.team_id ?? "");
        if (!teamId) continue;

        const ids = rosterRowToPlayerIds(row?.data);
        m.set(teamId, { playerIds: ids });
      }

      setServerRosters(m);
    })
    .catch((e) => console.log("fetch /api/rosters failed", e));
}, [activeLeague?.id]);

const yourLeagueTeamId = useMemo(() => {
  if (!leagueTeams.length) return null;

  if (userId) {
  const me = String(userId).trim().toLowerCase();
  const t = leagueTeams.find((x: any) => String(x.userId ?? "").trim().toLowerCase() === me);
  if (t) return t.id;
}

  return leagueTeams[0]?.id ?? null;
}, [leagueTeams, userId]);

  // Draft store teams + rosters
  const draftTeams = useDraftStore((s) => s.teams);
  
const syncFromLeague = useDraftStore((s) => s.syncFromLeague);

  // 👇 MOVE THIS HERE
const yourDraftTeamId = useMemo(() => {
  if (yourLeagueTeamId && draftTeams.some((t) => t.id === yourLeagueTeamId)) {
    return yourLeagueTeamId;
  }
  return draftTeams[0]?.id ?? null;
}, [yourLeagueTeamId, draftTeams]);

  const yourTeamName = useMemo(() => {
  if (!yourDraftTeamId) return "Your Team";
  return draftTeams.find((t) => t.id === yourDraftTeamId)?.name ?? "Your Team";
}, [draftTeams, yourDraftTeamId]);

const leagueTeamsSig = useMemo(() => {
  return leagueTeams.map((t) => t.id).join("|");
}, [leagueTeams]);

useEffect(() => {
  if (!activeLeague?.id) return;
  if (!leagueTeams.length) return;

  const hasOrder =
    Array.isArray((activeLeague as any).draftOrder) &&
    (activeLeague as any).draftOrder.length > 0;

  syncFromLeague(leagueTeams, hasOrder);
}, [activeLeague?.id, leagueTeamsSig, syncFromLeague]);

const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
const sheetPlayers = usePlayersStore((s) => s.players);
const roundRows = usePlayersStore((s) => s.roundRows);

useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);
// ✅ subscribe to actual data so the page re-renders when sheet data arrives
const sheetPlayerById = useMemo(() => {
  const m = new Map<string, any>();

  for (const p of sheetPlayers ?? []) {
    const draftLikeId =
      pickValue(p, ["id", "draftId", "draft_id", "Draft ID", "playerKey"]) ?? null;

    const sheetPid =
      pickValue(p, ["playerId", "player_id", "player id", "Player ID"]) ?? null;

    // Map BOTH if present
    if (draftLikeId != null) m.set(normaliseId(draftLikeId), p);
    if (sheetPid != null) m.set(normaliseId(sheetPid), p);
  }

  return m;
}, [sheetPlayers]);



function toNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}




// Best-effort: find the round/week index (so we can sort)
function rowPlayerId(row: any) {
  return pickValue(row, [
    "playerId",
    "player_id",
    "player id",
    "playerID",
    "Player ID",
    "PlayerId",
    "id",
    "player",
    "Player",
  ]);
}

function rowRound(row: any) {
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

function calcFantasyPoints(row: any): number | null {
  const num = (...keys: string[]) => {
    const v = pickValue(row, keys);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const minutes = num("Minutes played", "minutes", "Minutes");

  let pts = 0;

  // Playing time
  if (minutes >= 2) pts += 2;
  else if (minutes > 0) pts += 1;

  // Tries / assists
  pts += num("Tries") * 1;
  pts += num("Try Assists", "Try assists") * 1;

  // Kicking
  pts += num("Conversions") * 1;
  pts += num("Conversions missed", "Missed conversions") * 1;

  pts += num("Penalty scored", "Penalty goal", "Penalties scored") * 1;
  pts += num("Penalty missed", "Missed penalties") * 1;

  pts += num("Drop goal scored", "Drop goals scored") * 1;
  pts += num("Drop goal missed", "Drop goals missed") * 1;

  // ✅ 50:22 kicks (big missing piece)
  pts += num("50:22 Kicks", "50:22 kicks", "5022 Kicks", "50 22 Kicks") * 1;

  // Cards
  pts += num("Yellow cards", "Yellow card") * 1;
  pts += num("Red cards", "Red card") * 1;

  // Turnovers / interceptions
  pts += num("Turnover Forced", "Turnovers forced") * 1;
  pts += num("Interceptions", "Interception") * 1;

  // Lineouts
  pts += num("Lineouts won", "Lineouts won on own throw") * 1;
  pts += num("Lineout steals", "Lineout steal on opponents throw") * 5;
  pts += num("Lineout errors", "Lineout error") * 1;

  // Tackling
  pts += num("Tackles") * 1;
  pts += num("Missed tackles") * 1;

  // Ball carrying / creation
  pts += num("Defenders beaten", "Defenders Beaten") * 1;
  pts += num("Offloads") * 1;

  // Line breaks
  pts += num("Linebreaks", "Line breaks", "Linebreak") * 1;
  pts += num("Linebreak assists", "Linebreak assists", "Line break assists") * 1;

  // ✅ Metres gained: 1 point per 10 metres
  // Your sheet column is "Carries (m)" which appears to actually be metres, not carry count.
  const metres = num("Carries (m)", "Metres gained", "Meters gained", "Run metres", "Running metres");
  pts += Math.floor(metres / 1);

  // Discipline errors
  pts += num("Penalties Conceded", "Penalties conceded") * 1;
  pts += num("Errors", "Error") * 1;

  // Scrum won outright
  pts += num("Scrums won outright", "Scrums won") * 1;

  return pts;
}


const statsByPlayerId = useMemo(() => {
  // normalizedId -> array of { round, points }
  const buckets = new Map<string, Array<{ r: number; pts: number }>>();

  for (const row of roundRows ?? []) {
  const pidRaw = rowPlayerId(row);
  if (!pidRaw) continue;

  const pid = normaliseId(pidRaw);

  const pts = calcFantasyPoints(row);
  if (pts == null) continue;

  const r = rowRound(row);

  const arr = buckets.get(pid) ?? [];
  arr.push({ r, pts });
  buckets.set(pid, arr);
}


  // normalizedId -> { latest, ppg, form }
  const out = new Map<string, { latest: number | null; ppg: number | null; form: number | null }>();

  for (const [pid, arr] of buckets.entries()) {
    // sort newest -> oldest by round, fallback stable
    const sorted = arr.slice().sort((a, b) => (b.r || 0) - (a.r || 0));

    const latest = sorted[0]?.pts ?? null;

    const all = sorted.map((x) => x.pts);
    const ppg = all.length ? all.reduce((s, x) => s + x, 0) / all.length : null;

    const last3 = sorted.slice(0, 3).map((x) => x.pts);
    const form = last3.length ? last3.reduce((s, x) => s + x, 0) / last3.length : null;

    out.set(pid, { latest, ppg, form });
  }

  return out;
}, [roundRows]);
useEffect(() => {
  if (!roundRows?.length) return;
  console.log("roundRows[0] keys:", Object.keys(roundRows[0] ?? {}));
  console.log("sample row:", roundRows[0]);
  console.log("statsByPlayerId size:", statsByPlayerId.size);
}, [roundRows, statsByPlayerId]);

function getPlayerSheetId(p: Player | null) {
  if (!p) return null;

  // 1) try the sheet player row (from the "players" tab)
  const sheetPlayer = sheetPlayerById.get(normaliseId(p.id));
  const sheetPid =
    pickValue(sheetPlayer, ["playerId", "player_id", "player id", "id", "Player ID"]) ?? null;

  if (sheetPid != null) return normaliseId(sheetPid);

  // 2) fallback: assume draft id matches roundRows id
  return normaliseId(p.id);
}

function getLiveStat(p: Player | null) {
  const pid = getPlayerSheetId(p);
  if (!pid) return null;
  return statsByPlayerId.get(pid) ?? null;
}


function getLivePlayerById(id: string) {
  return sheetPlayerById.get(normaliseId(id));
}




  // Fixtures
  const fixtures = useMemo(() => fixturesData as AnyFixture[], []);
  const normalizedFixtures = useMemo(() => {
    return fixtures
      .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
      .sort((a, b) => a.kickoffMs - b.kickoffMs);
  }, [fixtures]);

  // Next upcoming deadline (always the next week that has any non-complete fixture)
  const nowMs = useNowTick(30_000);

// --- Week logic ---
const fantasyWeek = activeLeague?.currentWeek ?? 1;
const startRound = activeLeague?.startRound ?? 1;

const realRoundForFantasyWeek = useMemo(() => {
  return fantasyWeekToRealRound(startRound, fantasyWeek);
}, [startRound, fantasyWeek]);

const deadlineMs = useMemo(() => {
  return getWeekDeadlineMs(normalizedFixtures as any, realRoundForFantasyWeek);
}, [normalizedFixtures, realRoundForFantasyWeek]);

const deadlineLocked = deadlineMs ? nowMs >= deadlineMs : false;

useEffect(() => {
  const leagueId = activeLeague?.id;
  if (!deadlineLocked) return;
  if (!leagueId || !yourDraftTeamId) return;

  saveSelection(fantasyWeek); // freeze THIS week
}, [deadlineLocked, activeLeague?.id, yourDraftTeamId, fantasyWeek]);

// after the current fantasy week locks, user edits NEXT fantasy week
const selectionWeek = useMemo(() => {
  if (!deadlineMs) return fantasyWeek;
  return deadlineLocked ? (fantasyWeek + 1) : fantasyWeek;
}, [deadlineMs, deadlineLocked, fantasyWeek]);

const selectionRealRound = useMemo(() => {
  return fantasyWeekToRealRound(startRound, selectionWeek);
}, [startRound, selectionWeek]);

const selectionDeadlineMs = useMemo(() => {
  return getWeekDeadlineMs(normalizedFixtures as any, selectionRealRound);
}, [normalizedFixtures, selectionRealRound]);

const deadlineText = useMemo(() => {
  if (!mounted) return ""; // avoid SSR/client mismatch
  return selectionDeadlineMs ? formatDeadline(selectionDeadlineMs, userTz) : "TBC";
}, [mounted, selectionDeadlineMs, userTz]);

  // View dropdown (DEV — you said remove later)
  const [viewMode, setViewMode] = useState<ViewMode>("Fixture");

  // Build roster pool from draft rosters (temporary)
  const rosterPool: Player[] = useMemo(() => {
  if (!yourDraftTeamId) return [];

  const row = serverRosters.get(yourDraftTeamId);
  const ids = row?.playerIds ?? [];

  const list: Player[] = [];
  for (const id of ids) {
    const p = playersById.get(id);
    if (p) list.push(p);
  }

  // unique by id (safety)
  const seen = new Set<string>();
  return list.filter((p) => {
    if (!p?.id) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}, [yourDraftTeamId, serverRosters, playersById]);

  // Initial lineup:
  // - If no roster: all empty tiles
  // - Else: fill starters/bench by matching pos group; leftovers into wildcards
  const initialLineup = useMemo<Lineup>(() => {
    const empty = Object.fromEntries(SLOT_DEFS.map((s) => [s.id, null])) as Lineup;
    if (!rosterPool.length) return empty;

    const remaining = [...rosterPool];

    const take = (slot: SlotDef) => {
      const idx = remaining.findIndex((p) => canPlayerFitSlot(p, slot));
      if (idx >= 0) return remaining.splice(idx, 1)[0];
      return null;
    };

        const filled: Lineup = { ...empty };

    // Fill starters by position first
    for (const s of SLOT_DEFS) {
      if (!s.starter) continue;
      filled[s.id] = take(s);
    }

    // Bench is 5 wildcards (any position)
    const benchIds: SlotId[] = ["bench1", "bench2", "bench3", "bench4", "bench5"];
    for (const id of benchIds) {
      filled[id] = remaining.shift() ?? null;
    }


    return filled;
  }, [rosterPool]);

  const [lineup, setLineup] = useState<Lineup>(() => initialLineup);

// Captain/VC (starter-only)
const [captainId, setCaptainId] = useState<string | null>(null);
const [viceId, setViceId] = useState<string | null>(null);

// Save button state
const [hasLoadedSaved, setHasLoadedSaved] = useState(false);
const [isDirty, setIsDirty] = useState(false);
const [saveToast, setSaveToast] = useState<string | null>(null);
const [loadedFromServer, setLoadedFromServer] = useState(false);
const [loadedWeek, setLoadedWeek] = useState<number | null>(null);

// Captain/VC storage keys (scoped per league + team)
const storageKeyBase = useMemo(() => {
  return `ts_caps_${activeLeague?.id ?? "no-league"}_${yourDraftTeamId ?? "no-team"}`;
}, [activeLeague?.id, yourDraftTeamId]);

const CAPTAIN_KEY = `${storageKeyBase}_captain`;
const VICE_KEY = `${storageKeyBase}_vice`;
const INIT_KEY = `${storageKeyBase}_initDone`;

useEffect(() => {
  if (!yourDraftTeamId) return;
  if (!hasLoadedSaved) return; // ✅ don't touch lineup until after server load attempt

  setLineup((prev) => {
    const next = reconcileLineupWithRoster(prev, rosterPool);

    const prevIds = Object.values(prev).map((p) => p?.id ?? null);
    const nextIds = Object.values(next).map((p) => p?.id ?? null);
    const changed = JSON.stringify(prevIds) !== JSON.stringify(nextIds);

    if (changed) {
      // If roster changed (drops/adds), mark dirty so user can re-save
      setIsDirty(true);

      // also clear badges if their player disappeared
      setCaptainId((cid) => (cid && rosterPool.some((p) => p.id === cid) ? cid : null));
      setViceId((vid) => (vid && rosterPool.some((p) => p.id === vid) ? vid : null));
    }

    return next;
  });
}, [yourDraftTeamId, rosterPool, hasLoadedSaved]);

async function saveSelection(weekOverride?: number) {
  if (!activeLeague?.id || !yourDraftTeamId) return;

  try {
    const res = await fetch("/api/team-selection/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        leagueId: activeLeague.id,
        week: weekOverride ?? selectionWeek,
        teamId: yourDraftTeamId,
        lineup,
        captainId,
        viceId,
      }),
    });

    const json = await res.json();
    if (!json?.ok) {
      console.error("Save failed:", json?.error);
      return;
    }

    setIsDirty(false);
    setSaveToast("Saved");
    window.setTimeout(() => setSaveToast(null), 1200);
  } catch (e) {
    console.error("Save error:", e);
  }
}

useEffect(() => {
  const leagueIdRaw = activeLeague?.id;
  if (!leagueIdRaw || !yourDraftTeamId) return;

  // ✅ Force a definite string for encodeURIComponent (fixes TS error)
  const leagueId = String(leagueIdRaw);

  let cancelled = false;

  async function loadSelection() {
    try {
      const res = await fetch(
        `/api/team-selection/get?leagueId=${encodeURIComponent(leagueId)}&week=${selectionWeek}`,
        { credentials: "include", cache: "no-store" }
      );

      const json = await res.json();
      if (cancelled) return;

      if (!json?.ok) {
        setLoadedFromServer(false);
        setHasLoadedSaved(true);
        return;
      }

      const row = (json.rows ?? []).find(
        (r: any) => String(r.team_id ?? r.teamId) === String(yourDraftTeamId)
      );

      if (!row?.lineup) {
        setLoadedFromServer(false);
        setLoadedWeek(selectionWeek);
        setHasLoadedSaved(true);
        return;
      }

      // ✅ Use server lineup as truth, then reconcile ONLY for ownership changes
      const reconciled = reconcileLineupWithRoster(row.lineup as Lineup, rosterPool);

      setLineup(reconciled);
      setCaptainId(row.captain_id ?? row.captainId ?? null);
      setViceId(row.vice_id ?? row.viceId ?? null);

      setLoadedFromServer(true);
      setLoadedWeek(selectionWeek);
      setIsDirty(false);
      setHasLoadedSaved(true);
    } catch (e) {
      if (cancelled) return;
      console.error("Load selection failed:", e);
      setLoadedFromServer(false);
      setHasLoadedSaved(true);
    }
  }

  loadSelection();
  return () => {
    cancelled = true;
  };
}, [activeLeague?.id, yourDraftTeamId, selectionWeek, rosterPool]);

  useEffect(() => {
  if (!hasLoadedSaved) return;          // wait until we know whether server had a save
  if (loadedFromServer) return;         // server already set the lineup
  if (!rosterPool.length) return;       // still nothing to build from

  // If lineup is currently empty (all nulls), replace with initialLineup
  const isEmpty = Object.values(lineup).every((p) => !p?.id);
  if (!isEmpty) return;

  setLineup(initialLineup);
  setIsDirty(true); // optional: you can keep false if you don't want "Save" lit up by default
}, [hasLoadedSaved, loadedFromServer, rosterPool.length, initialLineup, lineup]);

// One-time default assignment (first open after draft):
// C = starting flyhalf, V = first outside back
useEffect(() => {
  // only set defaults if nothing chosen yet
  if (captainId || viceId) return;

  const fly = lineup["flyhalf1"];
  const ob1 = lineup["outsideback1"];
  if (!fly?.id || !ob1?.id) return;

  setCaptainId(fly.id);
  setViceId(ob1.id);
  setIsDirty(true);
}, [lineup, captainId, viceId]);




function hydratePlayer(p: Player): Player & { status?: any; weeklyStatus?: any } {
  const live = getLivePlayerById(p.id);
  if (!live) return p as any;

  return {
    ...p,
    status: live.status ?? null,
    weeklyStatus: live.weeklyStatus ?? {},
  };
}

  // Modal + swap flow
  const [modalPlayer, setModalPlayer] = useState<(Player & { status?: any; weeklyStatus?: any }) | null>(null);

  const [swapFromSlot, setSwapFromSlot] = useState<SlotId | null>(null);

  const openPlayer = (p: Player) => setModalPlayer(hydratePlayer(p) as any);


  const slotOfPlayer = useMemo(() => {
    const map = new Map<string, SlotId>();
    for (const s of SLOT_DEFS) {
      const p = lineup[s.id];
      if (p?.id) map.set(p.id, s.id);
    }
    return map;
  }, [lineup]);

  type SwapPlan =
  | { kind: "direct" }
  | { kind: "pivot"; pivotId: SlotId };

function getSwapPlan(fromId: SlotId, toId: SlotId, l: Lineup = lineup): SwapPlan | null {

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
function isStarterSlotId(id: SlotId) {
  const s = SLOT_DEFS.find((x) => x.id === id);
  return !!s?.starter;
}

function findSlotOfPlayer(l: Lineup, playerId: string | null): SlotId | null {
  if (!playerId) return null;
  for (const s of SLOT_DEFS) {
    const p = l[s.id];
    if (p?.id === playerId) return s.id;
  }
  return null;
}

function adjustBadgeAfterLineupChange(prev: Lineup, next: Lineup, badgeId: string | null) {
  if (!badgeId) return null;

  const prevSlot = findSlotOfPlayer(prev, badgeId);
  const nextSlot = findSlotOfPlayer(next, badgeId);

  // If badge player is still in a starter slot, keep it on them
  if (nextSlot && isStarterSlotId(nextSlot)) return badgeId;

  // If they moved off the starters (bench), transfer badge to whoever replaced them
  // in their previous STARTER slot (this matches your “bench -> starter swap means
  // incoming player becomes captain/vice” rule)
  if (prevSlot && isStarterSlotId(prevSlot)) {
    const replacement = next[prevSlot];
    if (replacement?.id) return replacement.id;
  }

  // If we can’t resolve, clear it
  return null;
}


  function onTilePress(slotId: SlotId) {
    const p = lineup[slotId];

    // If we are in "swap select target" mode:
if (swapFromSlot) {
  const fromId = swapFromSlot;
  const toId = slotId;

  if (fromId === toId) {
    setSwapFromSlot(null);
    return;
  }

  setLineup((prev) => {
  const plan = getSwapPlan(fromId, toId, prev);
  if (!plan) return prev;

  const a = prev[fromId];
  const b = prev[toId];
  if (!a || !b) return prev;

  let next: Lineup;

  if (plan.kind === "direct") {
    next = { ...prev, [fromId]: b, [toId]: a };
  } else {
    const pId = plan.pivotId;
    const c = prev[pId];
    if (!c) return prev;

    next = { ...prev, [pId]: a, [toId]: c, [fromId]: b };
  }

  setCaptainId((cid) => adjustBadgeAfterLineupChange(prev, next, cid));
  setViceId((vid) => adjustBadgeAfterLineupChange(prev, next, vid));
setIsDirty(true);


  return next;
});

  setSwapFromSlot(null);
  return;
}


    // Normal tap: open player card
    if (p) openPlayer(p);
  }

function getUpcomingFixtureTag(teamCodeOrName: string) {
  const teamCode = normalizeTeamCode(teamCodeOrName);

  const f = normalizedFixtures.find((x) => {
    if (x.week !== selectionWeek) return false;
    if (isFixtureComplete(x)) return false;

    const homeCode = fixtureTeamCode(x.homeTeam ?? "");
    const awayCode = fixtureTeamCode(x.awayTeam ?? "");

    return homeCode === teamCode || awayCode === teamCode;
  });

  if (!f) return "-";

  const homeCode = fixtureTeamCode(f.homeTeam ?? "");
  const awayCode = fixtureTeamCode(f.awayTeam ?? "");

  const isHome = homeCode === teamCode;
  const oppCode = isHome ? awayCode : homeCode;

  return `${oppCode} (${isHome ? "H" : "A"})`;
}


  function getLatestScoreTag(teamCodeOrName: string) {
  const teamCode = normalizeTeamCode(teamCodeOrName);

  const completed = normalizedFixtures
    .filter((f) => isFixtureComplete(f))
    .sort((a, b) => (b as any).kickoffMs - (a as any).kickoffMs);

  const f = completed.find((x) => {
    const homeCode = fixtureTeamCode(x.homeTeam ?? "");
    const awayCode = fixtureTeamCode(x.awayTeam ?? "");
    return homeCode === teamCode || awayCode === teamCode;
  });

  if (!f) return "—";

  const homeCode = fixtureTeamCode(f.homeTeam ?? "");
  const awayCode = fixtureTeamCode(f.awayTeam ?? "");

  const isHome = homeCode === teamCode;
  const oppCode = isHome ? awayCode : homeCode;

  const hs = f.homeScore ?? 0;
  const as = f.awayScore ?? 0;
  const score = `${hs}-${as}`;

  return `${oppCode} ${score}`;
}


function tileSubtext(p: Player | null) {
  
  if (!p) return "";

  if (viewMode === "Fixture") return getUpcomingFixtureTag(p.teamCode);

  const stats = getLiveStat(p);

  if (viewMode === "Latest Score") {
    const v = stats?.latest;
    return v == null ? "-" : String(v);
  }

  if (viewMode === "PPG") {
    const v = stats?.ppg;
    if (v == null) return "-";
    return Number(v).toFixed(1);
  }

  // Form
  const v = stats?.form;
  if (v == null) return "-";
  return Number(v).toFixed(1);
}



  


  // -----------------------
  // Styles (match your app)
  // -----------------------
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const listBox: React.CSSProperties = {
    borderRadius: 14,
    background: "rgba(255,255,255,0.18)",
    border: "1px solid rgba(255,255,255,0.18)",
    overflow: "hidden",
  };

  function Hamburger() {
    return (
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "white",
          fontSize: 30,
          fontWeight: 900,
          lineHeight: "30px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }
const pulseStyle: React.CSSProperties = {
  animation: "swapPulse 1.6s ease-in-out infinite",
};

  function CaptainBadge({ kind }: { kind: "C" | "V" }) {
    return (
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          background: "rgba(168,85,247,0.95)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.9)",


          fontSize: 10,
          fontWeight: 900,
          display: "grid",
          placeItems: "center",
          boxShadow: "0 6px 12px rgba(0,0,0,0.18)",
        }}
      >
        {kind}
      </div>
    );
  }

  function PlayerTile({ slotId }: { slotId: SlotId }) {
  const slot = SLOT_DEFS.find((s) => s.id === slotId)!;
  const p = lineup[slotId];

  const isCaptain = !!p?.id && captainId === p.id && slot.starter;
const isVice = !!p?.id && viceId === p.id && slot.starter;


  const swapping = !!swapFromSlot;
  const isSwapSource = swapFromSlot === slotId;

    const swapPlayer = swapFromSlot ? lineup[swapFromSlot] : null;

  // ✅ Eligible swap targets: positions the swap player can legally go to.
  // (Matches your current swap rules: must swap with another PLAYER tile, not empty)
  const isSwapTarget =
  !!swapFromSlot &&
  slotId !== swapFromSlot &&
  !!p &&
  !!getSwapPlan(swapFromSlot, slotId);

 const border =
  isSwapSource
    ? "2px solid rgba(250,204,21,0.95)"
    : isSwapTarget
    ? "2px solid rgba(250,204,21,0.85)"
    : swapping
    ? "1px solid rgba(250,204,21,0.25)"
    : "1px solid rgba(255,255,255,0.22)";

const boxShadow = isSwapSource
  ? `
      0 10px 22px rgba(0,0,0,0.16),
      0 0 0 3px rgba(250,204,21,0.85),
      0 0 18px rgba(250,204,21,0.55)
    `
  : isSwapTarget
  ? `
      0 10px 22px rgba(0,0,0,0.16),
      0 0 0 3px rgba(250,204,21,0.75),
      0 0 14px rgba(250,204,21,0.45)
    `
  : "0 10px 22px rgba(0,0,0,0.16)";

const jerseyUrl = p ? jerseySrcForTeam(p.teamCode) : "";


  return (
    <button
      onClick={() => onTilePress(slotId)}
      style={{
        width: 70,
        height: 70,
        borderRadius: 14,
        border,

        background: p ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
        backdropFilter: "blur(8px)",
        boxShadow,
opacity: swapping && !isSwapSource && !isSwapTarget ? 0.45 : 1,
...(isSwapTarget ? pulseStyle : {}),

        padding: 0,
        cursor: "pointer",
        position: "relative",
        overflow: "visible",
        color: "white",
      }}
    >
      {/* Corner badges are relative to the TILE */}
      <div style={{ position: "absolute", top: -6, left: -2, zIndex: 3 }}>
        {isCaptain ? <CaptainBadge kind="C" /> : null}
        {!isCaptain && isVice ? <CaptainBadge kind="V" /> : null}
      </div>

      <div
        style={{
          position: "absolute",
          top: -6,
          right: -2,
          zIndex: 3,
          fontSize: 12,
          opacity: p ? 0.95 : 0,
          lineHeight: "16px",
        }}
        aria-hidden="true"
      >
        {p ? (() => {
  const live = getLivePlayerById(p.id);
  const s = String(live?.status ?? "").toLowerCase();
  if (s === "starting") return "👍";
  if (s === "benched") return "⚠️";
  if (s) return "⛔";
  return "";
})() : ""}

      </div>

      {/* Main content */}
      {p ? (
        <>
          {/* Jersey image square (centered), partially covered by pill */}
          <div
            style={{
              position: "absolute",
              top: 3,
              left: "50%",
              transform: "translateX(-50%)",
              width: 65,
              height: 65,
              display: "grid",
              placeItems: "center",
              zIndex: 1,
            }}
          >
            <img
              src={jerseyUrl}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.25))",
              }}
            />
          </div>

          {/* Combined pill (split horizontally) */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 999,
              overflow: "hidden",
              zIndex: 2,
              boxShadow: "0 10px 18px rgba(0,0,0,0.18)",
            }}
          >
            {/* Top half: name */}
            <div
              style={{
                background: "rgba(255,255,255,0.95)",
                color: "#0f2a4a",
                textAlign: "center",
                padding: "3px 6px",
                fontSize: 10,
                fontWeight: 500,
                lineHeight: "8px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.lastName}
            </div>

            {/* Bottom half: view info */}
            <div
              style={{
                background: "#133454",
                color: "white",
                textAlign: "center",
                padding: "0px 0px",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: "12px",
                borderTop: "1px solid rgba(15,23,42,0.10)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tileSubtext(p)}
            </div>
          </div>
        </>
      ) : (
        // Empty state: ONLY position label, no jersey placeholder
        <div
  style={{
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 6px",
    fontSize: 10,
    fontWeight: 900,
    opacity: 0.75,
    lineHeight: "12px", // 👈 tighter
    textAlign: "center",
  }}
>
  {slot.label === "Loose" ? (
    <>
      <span>Loose</span>
      <span>Forward</span>
    </>
  ) : slot.label === "Outside" ? (
    <>
      <span>Outside</span>
      <span>Back</span>
    </>
  ) : (
    <span>{slot.label}</span>
  )}
</div>


      )}
    </button>
  );
}


  function FieldStarters() {
    return (
      <div
        style={{
          marginTop: 10,
          borderRadius: 18,
          overflow: "hidden",
          position: "relative",
          height: 520,
          background:
            // Use your field PNG later (drop it into /public/images/field.png)
            `linear-gradient(to bottom, rgba(5,150,105,0.92), rgba(16,185,129,0.92))`,
          backgroundImage: `url("/images/field.png")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          
          boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
        }}
      >
        {/* Light overlay so tiles pop even if image is bright */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(2,6,23,0.10)",
          }}
        />

        {STARTER_IDS.map((id) => {
          const pos = FIELD_POS[id];
          return (
            <div
              key={id}
              style={{
                position: "absolute",
                top: pos.top,
                left: pos.left,
                transform: "translate(-50%, -50%)",
              }}
            >
              <PlayerTile slotId={id} />
            </div>
          );
        })}
      </div>
    );
  }

  function BenchPanel() {
    return (
      <div style={{ marginTop: 10, ...card35, padding: 12, borderRadius: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.95, marginBottom: 8 }}>
          Substitutes
        </div>

        {/* Bench layout: match field spacing (OB row + Centre row) */}
<div
  style={{
    position: "relative",
    height: 145, // enough for 2 rows of 70px tiles
  }}
>
  {BENCH_IDS.map((id, idx) => {
    // Top row: 3 tiles at 24/50/76 (like outside backs)
    const topRowLefts = ["24%", "50%", "76%"];
    // Bottom row: 2 tiles at 38/62 (like centres)
    const bottomRowLefts = ["37%", "63%"];

    const isTopRow = idx < 3;
    const left = isTopRow ? topRowLefts[idx] : bottomRowLefts[idx - 3];
    const top = isTopRow ? "20%" : "75%";

    return (
      <div
        key={id}
        style={{
          position: "absolute",
          top,
          left,
          transform: "translate(-50%, -50%)",
        }}
      >
        <PlayerTile slotId={id} />
      </div>
    );
  })}
</div>


      </div>
    );
  }

  // Build modal actions for current modal player
  const modalActions = useMemo(() => {
    if (!modalPlayer) return [];

    const slotId = slotOfPlayer.get(modalPlayer.id) ?? null;
    const slot = slotId ? SLOT_DEFS.find((s) => s.id === slotId)! : null;
    const isStarter = !!slot?.starter;

    const actions: Array<{ label: string; onClick: () => void; variant: "primary" | "secondary" }> = [];

    // Swap always available if player exists in lineup
    actions.push({
      label: swapFromSlot ? "Cancel Swap" : "Swap",
      onClick: () => {
        if (!slotId) return;
        setModalPlayer(null);
        setSwapFromSlot((prev) => (prev ? null : slotId));
      },
      variant: "secondary",
    });

    // Captain / Vice (starter-only)
    actions.push({
      label: "Make Captain",
      onClick: () => {
        if (!isStarter) return;
        setCaptainId(modalPlayer.id);
        // prevent same id for VC
        setViceId((v) => (v === modalPlayer.id ? null : v));
        setIsDirty(true);

        setModalPlayer(null);
      },
      variant: "primary",
    });

    actions.push({
      label: "Make Vice",
      onClick: () => {
        if (!isStarter) return;
        setViceId(modalPlayer.id);
        setCaptainId((c) => (c === modalPlayer.id ? null : c));
        setIsDirty(true);

        setModalPlayer(null);
      },
      variant: "primary",
    });

    // If not starter, disable intent by no-op; you can later add UI disable inside PlayerCardModal if desired.
    return actions;
  }, [modalPlayer, slotOfPlayer, swapFromSlot]);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Background */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -2,
          background:
            "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      {!ready ? (
  <div style={{ minHeight: "100svh", display: "grid", placeItems: "center", color: "white" }}>
    <div style={{ fontWeight: 900 }}>Loading…</div>
  </div>
) : (
  <div
    style={{
      maxWidth: 420,
      margin: "0 auto",
      padding: "16px 18px",
      paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
    }}
  >
        {/* Header + Hamburger */}
        <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Hamburger />
           
            <div style={{ flex: 1 }} />
            {/* DEV dropdown (you said remove later) */}
            
          </div>

          {/* Deadline banner (shared dashboard style) */}
<div
  style={{
    marginTop: 10,

    /* 👇 THIS is the important part */
    marginLeft: -14,
    marginRight: -14,

    borderRadius: 999,
    overflow: "hidden",
    boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
  }}
>

  <div
    style={{
      background: "#FACC15",
      color: "#0f172a",
      textAlign: "center",
      padding: "3px 12px",
      fontWeight: 800,
      fontSize: 11,
    }}
  >
   Week {selectionWeek} • Team Selection Deadline

  </div>

    <div
    suppressHydrationWarning
    style={{
      background: "rgba(255,255,255,0.88)",
      color: "#0f172a",
      textAlign: "center",
      padding: "3px 12px",
      fontWeight: 700,
      fontSize: 11,
      borderTop: "1px solid rgba(15,23,42,0.12)",
    }}
  >
    {deadlineText}
  </div>
</div>
<div style={{ marginTop: 10, fontSize: 18, fontWeight: 900 }}>
  Team Selection
</div>

        </div>

{/* DEV dropdown (temporary) — below header, top-right */}
<div
  style={{
    marginTop: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  }}
>
  <select
    value={viewMode}
    onChange={(e) => setViewMode(e.target.value as ViewMode)}
    style={{
      height: 30,
      width: 130,
      borderRadius: 12,
      border: "none",
      outline: "none",
      padding: "0 10px",
      fontSize: 11,
      fontWeight: 700,
      color: "#0f172a",
      background: "rgba(255,255,255,0.9)",
      boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
    }}
    title="DEV: view mode"
  >
    <option value="Fixture">Next Fixture</option>
    <option value="Latest Score">Latest Score</option>
    <option value="PPG">Match Average</option>
    <option value="Form">Form</option>
  </select>

  <button
  onClick={() => saveSelection()}   // ✅ important
  disabled={!hasLoadedSaved || !isDirty}
    style={{
      height: 30,
      padding: "0 30px",
      borderRadius: 12,
      border: "none",
      fontSize: 11,
      fontWeight: 900,
      cursor: !hasLoadedSaved || !isDirty ? "default" : "pointer",
      color: "#0f172a",
      background: !hasLoadedSaved || !isDirty ? "rgba(255,255,255,0.55)" : "#FACC15",
      boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
      opacity: !hasLoadedSaved || !isDirty ? 0.7 : 1,
      whiteSpace: "nowrap",
    }}
  >
    {saveToast ? saveToast : "Save"}
</button>
</div>



        {/* Starters on field */}
        <FieldStarters />

    {/* Bench */}
    <BenchPanel />
  </div>
)}

      {/* Menu */}
      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeague?.id ?? null}
        setActiveLeague={setActiveLeague}
        activeItem="Team Selection"
      />

      {/* Player modal */}
      {modalPlayer ? (
  <PlayerCardModal
    onClose={() => setModalPlayer(null)}
    player={{
      ...(modalPlayer as any),
      // safety: if modalPlayer came from old lineup state, re-hydrate here too
      status: (getLivePlayerById(modalPlayer.id)?.status ?? (modalPlayer as any).status ?? null) as any,
      weeklyStatus:
  getLivePlayerById(modalPlayer.id)?.weeklyStatus ??
  (modalPlayer as any).weeklyStatus ??
  {},

    }}
    // IMPORTANT: don’t pass status prop unless you want to override sheet-based status
    // status={...}  <-- remove entirely

    teamLabel={yourTeamName}
    initialTab="Stats"
    actions={modalActions}
  />
) : null}

            <style>{`
        @keyframes swapPulse {
          0% {
            box-shadow: 0 0 0 3px rgba(250,204,21,0.55), 0 0 10px rgba(250,204,21,0.35);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(250,204,21,0.9), 0 0 18px rgba(250,204,21,0.65);
          }
          100% {
            box-shadow: 0 0 0 3px rgba(250,204,21,0.55), 0 0 10px rgba(250,204,21,0.35);
          }
        }
      `}</style>

    </main>
  );
}

/** small time tick hook (same idea as your other pages) */
function useNowTick(ms = 500) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((x) => x + 1), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return Date.now();
}
