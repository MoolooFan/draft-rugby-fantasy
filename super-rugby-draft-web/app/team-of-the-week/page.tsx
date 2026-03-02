"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PlayerCardModal } from "@/components/PlayerCardModal";

import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { usePlayersStore } from "@/lib/players/store";

import fixturesData from "@/data/fixtures-2026.json";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";
import { getActiveTimezone, getActiveUsername } from "@/lib/session";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";

// -----------------------
// Types / helpers
// -----------------------
type AnyFixture = {
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
};

type SheetFixtureRow = {
  season: number;
  weekFantasy: number;
  weekReal: number | null;
  label: string | null;
  kind: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  status: string; // upcoming | complete
  homeScore: number | null;
  awayScore: number | null;
};

function isSheetLabelRow(r: SheetFixtureRow) {
  return !!r.label || String(r.kind ?? "").toLowerCase() === "label";
}
function isSheetPlayableRow(r: SheetFixtureRow) {
  return !isSheetLabelRow(r);
}
function isFantasyWeekCompleteFromSheet(rows: SheetFixtureRow[], weekNo: number) {
  const wk = rows.filter((r) => Number(r.weekFantasy) === weekNo && isSheetPlayableRow(r));
  if (!wk.length) return false;
  return wk.every((r) => String(r.status ?? "").toLowerCase() === "complete");
}
function latestCompletedWeekFromSheet(rows: SheetFixtureRow[]) {
  const weeks = Array.from(
    new Set(
      rows
        .filter(isSheetPlayableRow)
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  let latest = 0;
  for (const w of weeks) {
    if (isFantasyWeekCompleteFromSheet(rows, w)) latest = w;
  }
  return latest;
}
function currentWeekFromSheet(rows: SheetFixtureRow[]) {
  const weeks = Array.from(
    new Set(
      rows
        .filter(isSheetPlayableRow)
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  for (const w of weeks) {
    if (!isFantasyWeekCompleteFromSheet(rows, w)) return w;
  }
  return latestCompletedWeekFromSheet(rows) || 1;
}

function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

// -----------------------
// Slot model = Team Selection starters (no bench)
// -----------------------
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
  | "outsideback3";

type PosGroup = "PROP" | "HOOKER" | "LOCK" | "LOOSE" | "HB" | "FH" | "CENTRE" | "OB";

type SlotDef = {
  id: SlotId;
  label: string;
  group: PosGroup;
};

const SLOT_DEFS: SlotDef[] = [
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
};

// -----------------------
// Player model (best-effort from store)
// -----------------------
type Player = {
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

function pickStr(v: any) {
  return String(v ?? "").trim();
}

// Same position matching rules as Team Selection
function canPlayerFitSlot(player: Player, slot: SlotDef) {
  const primary = (player.posAbbrev ?? "").toUpperCase();
  const secondary = (player.secondaryPosAbbrev ?? "").toUpperCase();

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

// -----------------------
// Jerseys (Team Selection preference: FRONT > ANGLE > SINGLE)
// -----------------------
const JERSEYS: Record<string, { front?: string; angle?: string; single?: string }> = {
  BLU: { front: "/images/jerseys/BLUJerseyFront.png", angle: "/images/jerseys/BLUJerseyAngle.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },
  CHI: { front: "/images/jerseys/CHIJerseyFront.png", angle: "/images/jerseys/CHIJerseyAngle.png" },
  CRU: { front: "/images/jerseys/CRUJerseyFront.png", angle: "/images/jerseys/CRUJerseyAngle.png" },
  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },
  HIG: { front: "/images/jerseys/HIGJerseyFront.png", angle: "/images/jerseys/HIGJerseyAngle.png" },
  HUR: { front: "/images/jerseys/HURJerseyFront.png", angle: "/images/jerseys/HURJerseyAngle.png" },
  MOA: { front: "/images/jerseys/MOPJerseyFront.png", angle: "/images/jerseys/MOPJerseyAngle.png" },
  MOP: { front: "/images/jerseys/MOPJerseyFront.png", angle: "/images/jerseys/MOPJerseyAngle.png" },
  RED: { single: "/images/jerseys/REDJersey.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};

const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.png";

function jerseySrcForTeam(teamCodeOrName: string) {
  const code = normalizeTeamCode(teamCodeOrName);
  const j = JERSEYS[code];
  return j?.front ?? j?.angle ?? j?.single ?? JERSEY_PLACEHOLDER;
}

// -----------------------
// Points (same as dashboard)
// -----------------------
function rowPlayerId(row: any) {
  return row?.playerId ?? row?.["Player ID"] ?? row?.player_id ?? row?.id ?? null;
}
function rowRound(row: any) {
  const v = row?.round ?? row?.Round ?? row?.week ?? row?.Week ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function calcFantasyPoints(row: any): number {
  const toNumber = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const POINT_COLUMNS = [
    "Minutes played",
    "Tries",
    "Try Assists",
    "Linebreaks",
    "Linebreak assists",
    "Defenders beaten",
    "Carries (m)",
    "Offloads",
    "Tackles",
    "Missed tackles",
    "Turnover Forced",
    "Interceptions",
    "50:22 Kicks",
    "Penalties Conceded",
    "Errors",
    "Lineouts won",
    "Lineout steals",
    "Lineout errors",
    "Scrums won outright",
    "Conversions",
    "Conversions missed",
    "Penalty scored",
    "Penalty missed",
    "Drop goal scored",
    "Drop goal missed",
    "Yellow cards",
    "Red cards",
  ];

  let pts = 0;
  for (const col of POINT_COLUMNS) pts += toNumber(row?.[col]);
  return pts;
}

// -----------------------
// Build TOTW lineup (greedy best-by-slot)
// -----------------------
type Lineup = Record<SlotId, Player | null>;

function buildTeamOfWeek(players: Player[], pointsById: Map<string, number>): Lineup {
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
function rosterRowToPlayerIds(data: any): string[] {
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

function safeLower(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

const POS_NAME: Record<string, string> = {
  PR: "Prop",
  HO: "Hooker",
  LK: "Lock",
  LF: "Loose Forward",
  HB: "Halfback",
  FH: "Flyhalf",
  CE: "Centre",
  OB: "Outside Back",
};

// -----------------------
// Page
// -----------------------
export default function TeamOfTheWeekPage() {
  useRequireSession();
  const router = useRouter();

  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useMemo(
    () => leagues.find((l) => l.id === activeLeagueId) ?? null,
    [leagues, activeLeagueId]
  );

  // not strictly required for logic, but kept as in your snippet
  useMemo(() => getActiveTimezone(), []);
  const username = useMemo(() => getActiveUsername(), []);

  // Draft teams (for owner label)
  const draftTeams = useDraftStore((s) => s.teams);

  // live now (client-only)
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // fixtures normalized
  const fixtures = useMemo(() => {
    const raw = fixturesData as AnyFixture[];
    return raw
      .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
      .sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0));
  }, []);

  // sheet fixtures (league schedule/results)
  const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);
  useEffect(() => {
    if (!activeLeague?.id) return;
    const season = 2026;

    fetch(`/api/fixtures/leagueMatches?season=${season}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setSheetFixtures(j.rows ?? []);
        else console.error("fixtures fetch failed", j?.error);
      })
      .catch((e) => console.error(e));
  }, [activeLeague?.id]);

  // match dashboard week logic
  const selectionWeek = useMemo(() => {
    if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
    return currentWeekFromSheet(sheetFixtures);
  }, [sheetFixtures, activeLeague?.currentWeek]);

  const startRound = activeLeague?.startRound ?? 1;
  const selectionRealRound = useMemo(
    () => fantasyWeekToRealRound(startRound, selectionWeek),
    [startRound, selectionWeek]
  );

  const deadlineMs = useMemo(() => {
    const wk = fixtures.filter((f) => f.week === selectionRealRound);
    if (!wk.length) return 0;
    const firstKickoff = Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
    if (!Number.isFinite(firstKickoff) || firstKickoff <= 0) return 0;
    return selectionDeadlineFromFirstKickoff(firstKickoff);
  }, [fixtures, selectionRealRound]);

  const deadlineLocked = deadlineMs ? nowMs >= deadlineMs : false;

  const displayWeekDefault = useMemo(() => {
    return deadlineLocked ? selectionWeek : selectionWeek - 1;
  }, [deadlineLocked, selectionWeek]);

  const maxFantasyWeek = useMemo(() => {
    const w = sheetFixtures
      .filter(isSheetPlayableRow)
      .map((r) => Number(r.weekFantasy))
      .filter((n) => Number.isFinite(n) && n > 0);
    return w.length ? Math.max(...w) : Math.max(1, selectionWeek);
  }, [sheetFixtures, selectionWeek]);

  const [week, setWeek] = useState<number>(1);
  useEffect(() => {
    const w = Math.min(Math.max(1, displayWeekDefault || 1), maxFantasyWeek || 1);
    setWeek(w);
  }, [displayWeekDefault, maxFantasyWeek]);

  const realRound = useMemo(() => {
    if (week <= 0) return 0;
    return fantasyWeekToRealRound(startRound, week);
  }, [startRound, week]);

  // -------- Players / stats from store --------
  const livePlayersLoaded = usePlayersStore((s) => s.loaded);
  const refreshLivePlayers = usePlayersStore((s) => s.refresh);
  const roundRows = usePlayersStore((s) => s.roundRows);

  // IMPORTANT: keep this best-effort; your store could be `players` or `allPlayers`
  const allPlayersRaw = usePlayersStore((s: any) => s.players ?? s.allPlayers ?? []);

  useEffect(() => {
    if (!livePlayersLoaded) refreshLivePlayers();
  }, [livePlayersLoaded, refreshLivePlayers]);

  const weekPointsByPlayerId = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of roundRows ?? []) {
      if (rowRound(row) !== realRound) continue;
      const pid = rowPlayerId(row);
      if (!pid) continue;
      m.set(String(pid).toLowerCase(), calcFantasyPoints(row));
    }
    return m;
  }, [roundRows, realRound]);

  const players: Player[] = useMemo(() => {
    const src = Array.isArray(allPlayersRaw) ? allPlayersRaw : [];
    return src
      .map((p: any) => {
        const id = pickStr(p.id ?? p.playerId ?? p.player_id);
        if (!id) return null;

        return {
          id,
          firstName: pickStr(p.firstName ?? p.first_name) || "?",
          lastName: pickStr(p.lastName ?? p.last_name) || "?",
          teamCode: pickStr(p.teamCode ?? p.team ?? p.team_code) || "TBC",
          posAbbrev: pickStr(p.posAbbrev ?? p.pos ?? p.position) || "—",
          secondaryPosAbbrev:
            pickStr(p.secondaryPosAbbrev ?? p.pos2 ?? p.secondaryPos ?? p.secondary_position ?? p.secondaryPosition) ||
            null,
          status: p.status ?? null,
          weeklyStatus: p.weeklyStatus ?? {},
        };
      })
      .filter(Boolean) as Player[];
  }, [allPlayersRaw]);

  // POTW ids (ties allowed)
  const potwIds = useMemo(() => {
    let best = -Infinity;
    const ids: string[] = [];

    for (const p of players) {
      const pts = weekPointsByPlayerId.get(p.id.toLowerCase()) ?? 0;
      if (pts > best) {
        best = pts;
        ids.length = 0;
        ids.push(p.id);
      } else if (pts === best) {
        ids.push(p.id);
      }
    }

    if (!Number.isFinite(best) || best <= 0) return new Set<string>();
    return new Set(ids.map(String));
  }, [players, weekPointsByPlayerId]);

  const lineup: Lineup = useMemo(() => {
    if (!players.length) return Object.fromEntries(SLOT_DEFS.map((s) => [s.id, null])) as Lineup;
    return buildTeamOfWeek(players, weekPointsByPlayerId);
  }, [players, weekPointsByPlayerId]);

  const totalPoints = useMemo(() => {
    let sum = 0;
    for (const s of SLOT_DEFS) {
      const p = lineup[s.id];
      if (!p?.id) continue;
      sum += weekPointsByPlayerId.get(p.id.toLowerCase()) ?? 0;
    }
    return sum;
  }, [lineup, weekPointsByPlayerId]);

  // -------- Ownership map (server rosters) --------
  const leagueTeams = useMemo(() => {
    return Array.isArray(activeLeague?.teams) ? (activeLeague!.teams as any[]) : [];
  }, [activeLeague?.teams]);

  const yourLeagueTeamId = useMemo(() => {
    if (!leagueTeams.length) return null;

    const me = safeLower(username);
    if (me) {
      const t = leagueTeams.find((x: any) => safeLower(x.userId) === me);
      if (t) return String(t.id);
    }
    return String(leagueTeams[0]?.id ?? "");
  }, [leagueTeams, username]);

  const [serverRosters, setServerRosters] = useState<Map<string, { playerIds: string[] }>>(new Map());

  useEffect(() => {
    const leagueId = activeLeague?.id;
    if (!leagueId) return;

    fetch(`/api/rosters?leagueId=${encodeURIComponent(String(leagueId))}`, {
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

  const ownerTeamIdByPlayerId = useMemo(() => {
    // playerId -> teamId
    const m = new Map<string, string>();
    for (const [teamId, row] of serverRosters.entries()) {
      for (const pid of row.playerIds ?? []) {
        if (!pid) continue;
        m.set(String(pid), teamId);
      }
    }
    return m;
  }, [serverRosters]);

  function ownerLabelForTeam(teamId: string | null) {
    if (!teamId) return "Available";
    const t =
      draftTeams.find((x: any) => String(x.id) === String(teamId)) ??
      leagueTeams.find((x: any) => String(x.id) === String(teamId));
    return t?.name ?? "Team";
  }

  // -------- Period (waivers vs free agency) --------
  // Best-effort: use an explicit flag if you have one. Otherwise treat as free agency.
  const isWaiversPeriod = useMemo(() => {
    const a: any = activeLeague as any;
    if (typeof a?.waiversOpen === "boolean") return a.waiversOpen;
    if (typeof a?.isWaivers === "boolean") return a.isWaivers;
    return false;
  }, [activeLeague]);

  // -------- Watchlist (store if available, else localStorage fallback) --------
  const leagueIdForWatchlist = activeLeague?.id ?? "no-league";
  const watchKey = useMemo(() => {
    return `watchlist_${String(leagueIdForWatchlist)}_${String(yourLeagueTeamId ?? "no-team")}`;
  }, [leagueIdForWatchlist, yourLeagueTeamId]);

  const storeWatchlistIds = usePlayersStore((s: any) => s.watchlistIds ?? s.watchlist ?? null);
  const storeToggleWatchlist = usePlayersStore((s: any) => s.toggleWatchlist ?? null);
  const storeAddToWatchlist = usePlayersStore((s: any) => s.addToWatchlist ?? null);
  const storeRemoveFromWatchlist = usePlayersStore((s: any) => s.removeFromWatchlist ?? null);

  const [localWatchlistIds, setLocalWatchlistIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(watchKey);
      const arr = raw ? (JSON.parse(raw) as any[]) : [];
      setLocalWatchlistIds(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      setLocalWatchlistIds([]);
    }
  }, [watchKey]);

  // 👇 ADD THIS DIRECTLY BELOW 👇
useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  fetch(`/api/watchlist?leagueId=${encodeURIComponent(leagueId)}`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) return;
      const ids = Array.isArray(j.data) ? j.data.map(String) : [];
      setLocalWatchlistIds(ids);
      try {
        localStorage.setItem(watchKey, JSON.stringify(ids));
      } catch {}
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id, watchKey]);

  function isWatched(playerId: string) {
    const pid = String(playerId);
    if (Array.isArray(storeWatchlistIds)) return storeWatchlistIds.map(String).includes(pid);
    return localWatchlistIds.includes(pid);
  }

  async function supabaseToggleWatchlist(leagueId: string, playerId: string, nextWatched: boolean) {
  if (nextWatched) {
    // add
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ leagueId, playerId }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed to add to watchlist");
    return;
  }

  // remove
  const res = await fetch(
    `/api/watchlist?leagueId=${encodeURIComponent(leagueId)}&playerId=${encodeURIComponent(playerId)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed to remove from watchlist");
}

  function toggleWatch(playerId: string) {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  const pid = String(playerId);

  const currentlyWatched =
    Array.isArray(storeWatchlistIds) ? storeWatchlistIds.map(String).includes(pid) : localWatchlistIds.includes(pid);

  const nextWatched = !currentlyWatched;

  // Optimistic UI update (store OR local)
  if (Array.isArray(storeWatchlistIds) && typeof storeToggleWatchlist === "function") {
    // if your store has a toggle, keep UI in sync
    storeToggleWatchlist(pid);
  } else {
    setLocalWatchlistIds((prev) => {
      const next = prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid];
      try {
        localStorage.setItem(watchKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Write to Supabase via existing API route
  supabaseToggleWatchlist(leagueId, pid, nextWatched).catch((e: any) => {
    console.error(e);

    // Roll back optimistic update if API fails
    if (Array.isArray(storeWatchlistIds) && typeof storeToggleWatchlist === "function") {
      storeToggleWatchlist(pid);
    } else {
      setLocalWatchlistIds((prev) => {
        const rolled = prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid];
        try {
          localStorage.setItem(watchKey, JSON.stringify(rolled));
        } catch {}
        return rolled;
      });
    }

    alert(e?.message ?? "Watchlist update failed");
  });
}

  // -------- Modal state --------
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);

  function openPlayer(p: Player) {
    const code = String(p.posAbbrev ?? "").toUpperCase();
    const posName = POS_NAME[code] ?? String(p.posAbbrev ?? "—");

    // PlayerCardModal in your build shows posAbbrev, so for the modal ONLY:
    // - keep posName for future-proofing
    // - override posAbbrev to full name so it displays "Prop" instead of "PR"
    setModalPlayer({
      ...p,
      posName,
      posAbbrev: posName,
    });
  }

  const modalActions = useMemo(() => {
    if (!modalPlayer) return [];

    const ownerTeamId = ownerTeamIdByPlayerId.get(String(modalPlayer.id)) ?? null;

    const ownedByYou = !!ownerTeamId && !!yourLeagueTeamId && String(ownerTeamId) === String(yourLeagueTeamId);
    const ownedByOther = !!ownerTeamId && !ownedByYou;
    const unowned = !ownerTeamId;

    if (ownedByYou) return [];

    const actions: Array<{ label: string; onClick: () => void; variant: "primary" | "secondary" }> = [];

    // Watchlist always available if not your player
    actions.push({
      label: isWatched(modalPlayer.id) ? "Remove from Watchlist" : "Add to Watchlist",
      onClick: () => toggleWatch(modalPlayer.id),
      variant: "secondary",
    });

    if (ownedByOther) {
      actions.push({
        label: "Trade",
        onClick: () => {
          setModalPlayer(null);
          router.push(`/trade/propose?playerId=${encodeURIComponent(String(modalPlayer.id))}`);
        },
        variant: "primary",
      });
    }

    if (unowned) {
      actions.push({
        label: isWaiversPeriod ? "Submit Claim" : "Sign Player",
        onClick: () => {
          setModalPlayer(null);
          router.push(
            `/transactions?mode=${encodeURIComponent(isWaiversPeriod ? "waivers" : "freeagency")}&playerId=${encodeURIComponent(
              String(modalPlayer.id)
            )}`
          );
        },
        variant: "primary",
      });
    }

    return actions;
  }, [
    modalPlayer,
    ownerTeamIdByPlayerId,
    yourLeagueTeamId,
    isWaiversPeriod,
    router,
    localWatchlistIds,
    storeWatchlistIds,
  ]);

  // -----------------------
  // Styles
  // -----------------------
  const containerMax = 420;

  const headerCard: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.12)",
    border: "1px solid rgba(255,255,255,0.14)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    padding: 12,
  };

  const weekBtn: React.CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(0,0,0,0.18)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  };

  function PlayerTile({ slotId }: { slotId: SlotId }) {
    const slot = SLOT_DEFS.find((s) => s.id === slotId)!;
    const p = lineup[slotId];

    const isPOTW = !!p?.id && potwIds.has(String(p.id));
    const pts = p?.id ? (weekPointsByPlayerId.get(p.id.toLowerCase()) ?? 0) : 0;

    const border = isPOTW ? "2px solid rgba(250,204,21,0.95)" : "1px solid rgba(255,255,255,0.22)";
    const boxShadow = isPOTW
      ? `
        0 10px 22px rgba(0,0,0,0.16),
        0 0 0 3px rgba(250,204,21,0.85),
        0 0 18px rgba(250,204,21,0.55)
      `
      : "0 10px 22px rgba(0,0,0,0.16)";

    const jerseyUrl = p ? jerseySrcForTeam(p.teamCode) : "";

    return (
      <button
        onClick={() => {
          if (p) openPlayer(p);
        }}
        disabled={!p}
        style={{
          width: 70,
          height: 70,
          borderRadius: 14,
          border,
          background: p ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
          backdropFilter: "blur(8px)",
          boxShadow,
          padding: 0,
          position: "relative",
          overflow: "visible",
          color: "white",
          cursor: p ? "pointer" : "default",
        }}
      >
        {p ? (
          <>
            {/* Jersey */}
            <div
              style={{
                position: "absolute",
                top: 3,
                left: "50%",
                transform: "translateX(-50%)",
                width: 65,
                height: 44,
                overflow: "hidden",
                zIndex: 1,
                display: "grid",
                placeItems: "center",
              }}
            >
              <img
                src={jerseyUrl}
                alt=""
                draggable={false}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = JERSEY_PLACEHOLDER;
                }}
                style={{
                  width: "100%",
                  height: 65,
                  objectFit: "contain",
                  filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.25))",
                }}
              />
            </div>

            {/* Pill */}
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
                {pts}
              </div>
            </div>
          </>
        ) : (
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
              lineHeight: "12px",
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

  function Field() {
    return (
      <div
        style={{
          marginTop: 10,
          borderRadius: 18,
          overflow: "hidden",
          position: "relative",
          height: 520,
          backgroundImage: `url("/images/field.png")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
        }}
      >
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(2,6,23,0.10)" }} />

        {(SLOT_DEFS.map((s) => s.id) as SlotId[]).map((id) => {
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

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div
        style={{
          maxWidth: containerMax,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={headerCard}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 26, opacity: 0.9 }}>Team of the Week</div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => router.push("/dashboard")}
              aria-label="Close"
              style={{
                width: 34,
                height: 34,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.28)",
                background: "rgba(0,0,0,0.18)",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <button
              style={{ ...weekBtn, opacity: week <= 1 ? 0.35 : 1, cursor: week <= 1 ? "default" : "pointer" }}
              onClick={() => setWeek((w) => Math.max(1, w - 1))}
              disabled={week <= 1}
              aria-label="Previous week"
            >
              ‹
            </button>

            <div style={{ fontWeight: 900, fontSize: 12 }}>Week {week}</div>

            <button
              style={{
                ...weekBtn,
                opacity: week >= maxFantasyWeek ? 0.35 : 1,
                cursor: week >= maxFantasyWeek ? "default" : "pointer",
              }}
              onClick={() => setWeek((w) => Math.min(maxFantasyWeek, w + 1))}
              disabled={week >= maxFantasyWeek}
              aria-label="Next week"
            >
              ›
            </button>
          </div>

          <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
            <div
              style={{
                minWidth: 90,
                textAlign: "center",
                padding: "10px 14px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.85)",
                color: "#0f172a",
                fontWeight: 900,
                fontSize: 26,
                boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
              }}
            >
              {totalPoints}
            </div>
          </div>
        </div>

        <Field />
      </div>

      {/* Player modal */}
      {modalPlayer ? (
        <PlayerCardModal
          onClose={() => setModalPlayer(null)}
          player={modalPlayer as any}
          teamLabel={ownerLabelForTeam(ownerTeamIdByPlayerId.get(String(modalPlayer.id)) ?? null)}
          initialTab="Stats"
          actions={modalActions}
        />
      ) : null}
    </main>
  );
}