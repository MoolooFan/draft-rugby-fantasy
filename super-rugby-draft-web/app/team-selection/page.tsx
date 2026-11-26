"use client";

import { PER80_MIN_MINUTES } from "@/lib/players/statView";
import { useSeasonStatRows } from "@/lib/players/useStatRows";
import { pitchRows, rosterSize, STANDARD_SQUAD } from "@/lib/league/squad";
import React, { useEffect, useMemo, useState } from "react";
import { formatProjection, projectionFor, useProjections } from "@/lib/projections/useProjections";
import { teamOutlook } from "@/lib/projections/live";
import { CAPTAIN_MULTIPLIER, statCountsFromRow } from "@/lib/scoring";

import { AppMenu } from "@/components/AppMenu";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { DragSwapTile, justDraggedTile, SwapDnd } from "@/components/teamSelection/DragSwap";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { useTransactionsStore } from "@/lib/transactions/store";

import { useFixturesWithScores } from "@/lib/fixtures/useScores";
import { currentSeasonYear, fixturesByFantasyWeek, roundLabel, SEASONS } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import { useRequireSession } from "@/lib/session/useRequireSession";
import { getActiveUsername, getActiveTimezone } from "@/lib/session";
import { usePlayersStore } from "@/lib/players/store";
import { usePlayerPool } from "@/lib/players/pool";
import { fantasyWeekToRealRound } from "@/lib/league/week";
import { toMs, getWeekDeadlineMs, type SheetFixtureRow, currentWeekFromSheet, pickValue } from "@/lib/league/weekHelpers";
import { fixCaptains } from "@/lib/league/lineup";
import type { Lineup as ServerLineup } from "@/lib/scoring/week";
import { irEligible } from "@/lib/league/ir";
import { currentStatusText } from "@/lib/status/kind";
import { SelectionHeader } from "@/components/teamSelection/SelectionHeader";
import { BenchPanel, Pitch } from "@/components/teamSelection/Pitch";
import { IrTile, PlayerTile } from "@/components/teamSelection/Tiles";
import {
  calcFantasyPoints,
  canPlayerFitSlot,
  fieldPositionsFor,
  fixtureTeamCode,
  formatDeadline,
  isFixtureComplete,
  normaliseId,
  normalizeTeamCode,
  reconcileLineupWithRoster,
  rosterRowToPlayerIds,
  rowPlayerId,
  rowRound,
  slotDefsFor,
  swapPlanFor,
  useNowTick,
  type AnyFixture,
  type Lineup,
  type Player,
  type SlotDef,
  type SlotId,
  type SwapPlan,
  type ViewMode,
} from "@/components/teamSelection/helpers";

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
const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

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

  // the league's squad (lib/league/squad.ts): its starting slots, bench and IR spots
  const squad = activeLeague?.squadFormat ?? STANDARD_SQUAD;
  const squadSig = JSON.stringify(squad);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const SLOT_DEFS = useMemo(() => slotDefsFor(squad), [squadSig]);
  const STARTER_IDS = useMemo(() => SLOT_DEFS.filter((s) => s.starter).map((s) => s.id), [SLOT_DEFS]);
  const BENCH_IDS = useMemo(() => SLOT_DEFS.filter((s) => !s.starter).map((s) => s.id), [SLOT_DEFS]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const FIELD_POS = useMemo(() => fieldPositionsFor(squad), [squadSig]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const PITCH_ROWS = useMemo(() => pitchRows(squad).length, [squadSig]);

  const userId = useMemo(() => getActiveUsername(), []);
  const userTz = useMemo(() => getActiveTimezone(), []);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const ready = mounted && leagueHydrated && draftHydrated && txnHydrated;

  // Determine your team in the active league
  const leagueTeams = useMemo(() => {
  return Array.isArray(activeLeague?.teams) ? activeLeague!.teams : [];
}, [activeLeague?.teams]);

useEffect(() => {
  if (!activeLeague?.id) return;

  const season = currentSeasonYear();

  fetch(`/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(activeLeague.id)}`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id]);

const [serverRosters, setServerRosters] = useState<Map<string, { playerIds: string[]; irIds: string[] }>>(new Map());

const playerPool = usePlayerPool();
const playersById = useMemo(() => {
  const m = new Map<string, Player>();
  for (const p of (playerPool as any[])) {
    if (!p?.id) continue;
    m.set(String(p.id), p as Player);
  }
  return m;
}, [playerPool]);

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

      const m = new Map<string, { playerIds: string[]; irIds: string[] }>();
      for (const row of rows) {
        const teamId = String(row.team_id ?? "");
        if (!teamId) continue;

        // players in the IR spot aren't part of the lineup
        const irIds: string[] = Array.isArray(row?.data?.irIds) ? row.data.irIds.map(String).filter(Boolean) : [];
        const ids = rosterRowToPlayerIds(row?.data).filter((id) => !irIds.includes(id));
        m.set(teamId, { playerIds: ids, irIds });
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
const sheetPlayerByDraftId = useMemo(() => {
  const m = new Map<string, any>();
  for (const p of sheetPlayers ?? []) {
    const draftLikeId =
      pickValue(p, ["id", "draftId", "draft_id", "Draft ID", "playerKey"]) ?? null;
    if (draftLikeId != null) m.set(normaliseId(draftLikeId), p);
  }
  return m;
}, [sheetPlayers]);

const sheetPlayerByPlayerId = useMemo(() => {
  const m = new Map<string, any>();
  for (const p of sheetPlayers ?? []) {
    const sheetPid =
      pickValue(p, ["playerId", "player_id", "player id", "Player ID"]) ?? null;
    if (sheetPid != null) m.set(normaliseId(sheetPid), p);
  }
  return m;
}, [sheetPlayers]);

// Best-effort: find the round/week index (so we can sort)

const statsByPlayerId = useMemo(() => {
  const buckets = new Map<string, Array<{ r: number; pts: number; mins: number }>>();

  for (const row of roundRows ?? []) {
    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = normaliseId(pidRaw);
    const r = rowRound(row);

    const playerMeta =
      sheetPlayerByPlayerId.get(pid) ??
      sheetPlayerByDraftId.get(pid) ??
      null;

    const pts = calcFantasyPoints(row, playerMeta);
    if (!Number.isFinite(pts)) continue;

    const arr = buckets.get(pid) ?? [];
    arr.push({ r, pts, mins: statCountsFromRow(row).minutesPlayed ?? 0 });
    buckets.set(pid, arr);
  }

  const out = new Map<
    string,
    { latest: number | null; ppg: number | null; form: number | null; per80: number | null }
  >();

  for (const [pid, arr] of buckets.entries()) {
    const sorted = arr.slice().sort((a, b) => (b.r || 0) - (a.r || 0));

    const latest = sorted[0]?.pts ?? null;

    const all = sorted.map((x) => x.pts);
    const ppg = all.length ? all.reduce((s, x) => s + x, 0) / all.length : null;

    const last3 = sorted.slice(0, 3).map((x) => x.pts);
    const form = last3.length ? last3.reduce((s, x) => s + x, 0) / last3.length : null;

    // points per 80 minutes (once he has 20+ minutes: lib/players/statView)
    const mins = arr.reduce((s, x) => s + x.mins, 0);
    const per80 = mins >= PER80_MIN_MINUTES ? (all.reduce((s, x) => s + x, 0) / mins) * 80 : null;

    out.set(pid, { latest, ppg, form, per80 });
  }

  return out;
}, [roundRows, sheetPlayerByPlayerId, sheetPlayerByDraftId]);

// last season's match average (e.g. "2026 Average" during 2027), from that season's stat rows
const lastSeasonYear = currentSeasonYear() - 1;
const hasLastSeason = !!SEASONS[lastSeasonYear];
const { rows: lastSeasonRows } = useSeasonStatRows(hasLastSeason ? lastSeasonYear : currentSeasonYear());
const lastSeasonAvgById = useMemo(() => {
  const out = new Map<string, number>();
  if (!hasLastSeason) return out;
  const sum = new Map<string, { pts: number; n: number }>();
  for (const row of lastSeasonRows ?? []) {
    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;
    const pid = normaliseId(pidRaw);
    const counts = statCountsFromRow(row);
    if (!((counts.minutesPlayed ?? 0) > 0)) continue;
    const meta = sheetPlayerByPlayerId.get(pid) ?? sheetPlayerByDraftId.get(pid) ?? null;
    const pts = calcFantasyPoints(row, meta);
    if (!Number.isFinite(pts)) continue;
    const cur = sum.get(pid) ?? { pts: 0, n: 0 };
    sum.set(pid, { pts: cur.pts + pts, n: cur.n + 1 });
  }
  for (const [pid, v] of sum) out.set(pid, v.pts / v.n);
  return out;
}, [hasLastSeason, lastSeasonRows, sheetPlayerByPlayerId, sheetPlayerByDraftId]);

useEffect(() => {
  if (!roundRows?.length) return;
  console.log("roundRows[0] keys:", Object.keys(roundRows[0] ?? {}));
  
  console.log("sample row:", roundRows[0]);
  console.log("statsByPlayerId size:", statsByPlayerId.size);
}, [roundRows, statsByPlayerId]);

function getPlayerSheetId(p: Player | null) {
  if (!p) return null;

  // players.json id is your "draft id" in most setups
  const draftKey = normaliseId(p.id);

  // 1) look up the player row by draft id ONLY
  const sheetPlayer = sheetPlayerByDraftId.get(draftKey);

  // 2) extract the real sheet playerId from that row
  const sheetPid =
    pickValue(sheetPlayer, ["playerId", "player_id", "player id", "Player ID"]) ?? null;

  if (sheetPid != null) return normaliseId(sheetPid);

  // 3) fallback (only if your roundRows are keyed by draft id)
  return draftKey;
}

function getLiveStat(p: Player | null) {
  const pid = getPlayerSheetId(p);
  if (!pid) return null;
  return statsByPlayerId.get(pid) ?? null;
}

function getLivePlayerById(id: string) {
  // "id" here is a players.json id (draft id)
  return sheetPlayerByDraftId.get(normaliseId(id));
}

  // Fixtures
  // with the real final scores (lib/fixtures/useScores.ts), so finished games count as finished
  const fixtures = useFixturesWithScores(fixturesData as AnyFixture[]);
  const normalizedFixtures = useMemo(() => {
    return fixtures
      .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
      .sort((a, b) => a.kickoffMs - b.kickoffMs);
  }, [fixtures]);

  // Next upcoming deadline (always the next week that has any non-complete fixture)
  const nowMs = useNowTick(30_000);

// --- Week logic ---
const startRound = activeLeague?.startRound ?? 1;

// Sheet-driven current fantasy week, same pattern as your other pages
const fantasyWeek = useMemo(() => {
  if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
  return currentWeekFromSheet(sheetFixtures);
}, [sheetFixtures, activeLeague?.currentWeek]);

const realRoundForFantasyWeek = useMemo(() => {
  return fantasyWeekToRealRound(startRound, fantasyWeek);
}, [startRound, fantasyWeek]);

const deadlineMs = useMemo(() => {
  return getWeekDeadlineMs(normalizedFixtures as any, realRoundForFantasyWeek);
}, [normalizedFixtures, realRoundForFantasyWeek]);

const deadlineLocked = deadlineMs ? nowMs >= deadlineMs : false;

// after the current fantasy week locks, user edits NEXT fantasy week
const selectionWeek = useMemo(() => {
  if (!deadlineMs) return fantasyWeek;
  return deadlineLocked ? fantasyWeek + 1 : fantasyWeek;
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
  const [viewMode, setViewMode] = useState<ViewMode>("Projected");

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

  // The players in IR (not in the lineup, don't score). Rules in lib/league/ir.ts. A league can
  // have 0-3 IR spots; the actions below work on the IR player last tapped (irFocus).
  const irPlayers: Player[] = useMemo(() => {
    if (!yourDraftTeamId) return [];
    const ids = serverRosters.get(yourDraftTeamId)?.irIds ?? [];
    return ids.map((id) => playersById.get(id)).filter((x): x is Player => !!x);
  }, [yourDraftTeamId, serverRosters, playersById]);
  const [irFocus, setIrFocus] = useState(0);
  const irPlayer: Player | null = irPlayers[irFocus] ?? irPlayers[0] ?? null;
  const irFull = irPlayers.length >= squad.ir;

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

    // Bench: anyone
    for (const id of BENCH_IDS) {
      filled[id] = remaining.shift() ?? null;
    }

    return filled;
  }, [rosterPool, SLOT_DEFS, BENCH_IDS]);

  const [lineup, setLineup] = useState<Lineup>(() => initialLineup);

// Captain/VC (starter-only)
const [captainId, setCaptainId] = useState<string | null>(null);
const [viceId, setViceId] = useState<string | null>(null);
// each player's pick number in this league's draft (for "highest draft pick")
const [pickNumbers, setPickNumbers] = useState<Record<string, number>>({});

// Save button state
const [hasLoadedSaved, setHasLoadedSaved] = useState(false);
const [isDirty, setIsDirty] = useState(false);
const [saveToast, setSaveToast] = useState<string | null>(null);
const [loadedFromServer, setLoadedFromServer] = useState(false);
const [loadedWeek, setLoadedWeek] = useState<number | null>(null);

useEffect(() => {
  if (!yourDraftTeamId) return;
  if (!hasLoadedSaved) return; // ✅ don't touch lineup until after server load attempt

  setLineup((prev) => {
    const next = reconcileLineupWithRoster(prev, rosterPool, SLOT_DEFS);

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
}, [yourDraftTeamId, rosterPool, hasLoadedSaved, SLOT_DEFS]);

async function saveSelection(weekOverride?: number) {
  if (!activeLeague?.id || !yourDraftTeamId) return;

  const weekToSave = weekOverride ?? selectionWeek;

  const requiredSlots: SlotId[] = SLOT_DEFS.map((s) => s.id);

  const hasAnyPlayer = requiredSlots.some((slotId) => !!lineup[slotId]?.id);
  if (!hasAnyPlayer) {
    console.error("Refusing to save blank lineup");
    return;
  }

  try {
    const res = await fetch("/api/team-selection/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        leagueId: activeLeague.id,
        week: weekToSave,
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

    if (json.lineup) setLineup(reconcileLineupWithRoster(json.lineup as Lineup, rosterPool, SLOT_DEFS));
    if ("captainId" in json) setCaptainId(json.captainId ?? null);
    if ("viceId" in json) setViceId(json.viceId ?? null);
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

      setPickNumbers(json.pickNumbers ?? {});
      // the lineup saved for this week, or the most recent earlier one (carried over)
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
            const weekLoaded = selectionWeek;
      const reconciled = reconcileLineupWithRoster(row.lineup as Lineup, rosterPool, SLOT_DEFS);

      setLineup(reconciled);
      setCaptainId(row.captain_id ?? row.captainId ?? null);
      setViceId(row.vice_id ?? row.viceId ?? null);

      setLoadedFromServer(true);
      setLoadedWeek(weekLoaded);
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
}, [activeLeague?.id, yourDraftTeamId, selectionWeek, rosterPool, SLOT_DEFS]);

useEffect(() => {
  if (!hasLoadedSaved) return;
  if (loadedFromServer) return;
  if (!rosterPool.length) return;
  if (loadedWeek !== selectionWeek) return;

  const isEmpty = Object.values(lineup).every((p) => !p?.id);
  if (!isEmpty) return;

  setLineup(initialLineup);
  setIsDirty(false);
}, [hasLoadedSaved, loadedFromServer, loadedWeek, selectionWeek, rosterPool.length, initialLineup, lineup]);

// Captain / vice-captain rules (same as the server, lib/league/lineup.ts): both must be starting.
// Start of the season: the team's 1st and 2nd draft picks. If the captain is benched (or leaves),
// the vice becomes captain and the new vice is the starter taken earliest in the draft.
const pickRank = useMemo(() => {
  return (id: string) => pickNumbers[id] ?? 100_000 + Number(sheetPlayerByDraftId.get(normaliseId(id))?.draftRank ?? 9999);
}, [pickNumbers, sheetPlayerByDraftId]);
useEffect(() => {
  if (!hasLoadedSaved) return;
  if (!Object.values(lineup).some((p) => p?.id)) return;
  const caps = fixCaptains(lineup as unknown as ServerLineup, captainId, viceId, pickRank);
  if (caps.captainId !== captainId) setCaptainId(caps.captainId);
  if (caps.viceId !== viceId) setViceId(caps.viceId);
}, [lineup, captainId, viceId, hasLoadedSaved, pickRank]);

// Expected points for the week being picked (like the matchup page): each player's, and the
// team's total for this lineup (captain x2, auto-subs for anyone ruled out). Updates as you
// change the team.
const weekProj = useProjections(mounted && activeLeague?.id ? activeLeague.id : null, mounted && selectionWeek > 0 ? selectionWeek : null);
const projReady = !!weekProj && weekProj.week === selectionWeek;
function playerProj(p: Player | null): number | null {
  if (!projReady || !p?.id) return null;
  const pr = projectionFor(weekProj, p.id);
  if (!pr) return null;
  return p.id === captainId ? pr.pts * CAPTAIN_MULTIPLIER : pr.pts;
}
const teamProj = useMemo(() => {
  if (!projReady || !Object.values(lineup).some((p) => p?.id)) return null;
  return teamOutlook({
    lineup: lineup as unknown as ServerLineup,
    captainId,
    viceId,
    state: (id) => {
      const pr = projectionFor(weekProj, id);
      return pr ? { projected: pr.pts, spread: pr.spread, actual: null, minutes: 0, kickoffMs: pr.kickoffMs, ruledOut: pr.role === "out" } : null;
    },
    nowMs,
    format: squad,
  }).expected;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [projReady, weekProj, lineup, captainId, viceId, nowMs, squadSig]);

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

  // ---- IR spot ----
  // Move an injured player (or one out for e.g. personal reasons) to IR, swap him with the IR
  // player, or activate the IR player (dropping someone if the team is full). The server checks
  // the rules and fixes the lineups for the weeks that aren't locked yet.
  const [irBusy, setIrBusy] = useState(false);
  const [irNotice, setIrNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [irDropMode, setIrDropMode] = useState(false); // choosing a player to drop to activate the IR player

  const nameOf = (p: { firstName?: string; lastName?: string } | null | undefined) =>
    p ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : "";
  const canGoInIr = (id: string) => irEligible(currentStatusText(getLivePlayerById(id)));
  // any IR player who is fit again (must be activated before adds / claims / trades)
  const fitIrPlayer = irPlayers.find((p) => !canGoInIr(p.id)) ?? null;

  async function irRequest(body: Record<string, unknown>, doneText: string) {
    if (!activeLeague?.id || !yourDraftTeamId || irBusy) return;
    setIrBusy(true);
    setIrNotice(null);
    try {
      if (isDirty) await saveSelection(); // keep the changes made on this page first
      const res = await fetch("/api/ir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leagueId: activeLeague.id, ...body }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setIrNotice({ kind: "error", text: json?.error ?? "That didn't work - please try again" });
        return;
      }
      const teamId = yourDraftTeamId;
      setServerRosters((prev) => {
        const m = new Map(prev);
        m.set(teamId, { playerIds: (json.playerIds ?? []).map(String), irIds: (json.irIds ?? []).map(String) });
        return m;
      });
      setIrNotice({ kind: "info", text: doneText });
      window.setTimeout(() => setIrNotice(null), 4000);
    } catch (e) {
      console.error("IR move failed:", e);
      setIrNotice({ kind: "error", text: "That didn't work - please try again" });
    } finally {
      setIrBusy(false);
    }
  }

  function moveToIr(p: Player) {
    if (!window.confirm(`Move ${nameOf(p)} to IR?

He won't be in your lineup or score while he's in IR.`)) return;
    irRequest({ action: "move", playerId: p.id }, `${nameOf(p)} moved to IR`);
  }

  function swapWithIr(p: Player) {
    if (!irPlayer) return;
    if (!window.confirm(`Move ${nameOf(p)} to IR and bring ${nameOf(irPlayer)} back into your team?`)) return;
    irRequest({ action: "swap", playerId: irPlayer.id, swapPlayerId: p.id }, `${nameOf(irPlayer)} is back; ${nameOf(p)} moved to IR`);
  }

  function startActivate() {
    if (!irPlayer) return;
    if (rosterPool.length < rosterSize(squad)) {
      if (!window.confirm(`Bring ${nameOf(irPlayer)} back from IR into your team?`)) return;
      irRequest({ action: "activate", playerId: irPlayer.id }, `${nameOf(irPlayer)} is back in your team`);
      return;
    }
    setSwapFromSlot(null);
    setIrDropMode(true);
    setIrNotice({ kind: "info", text: `Your team is full - tap the player to drop to make room for ${nameOf(irPlayer)}` });
  }

  function chooseDrop(p: Player) {
    if (!irPlayer) return;
    setIrDropMode(false);
    setIrNotice(null);
    if (!window.confirm(`Drop ${nameOf(p)} and bring ${nameOf(irPlayer)} back from IR?`)) return;
    irRequest({ action: "activate", playerId: irPlayer.id, dropPlayerId: p.id }, `${nameOf(irPlayer)} is back; ${nameOf(p)} dropped`);
  }

  const slotOfPlayer = useMemo(() => {
    const map = new Map<string, SlotId>();
    for (const s of SLOT_DEFS) {
      const p = lineup[s.id];
      if (p?.id) map.set(p.id, s.id);
    }
    return map;
  }, [lineup, SLOT_DEFS]);

function getSwapPlan(fromId: SlotId, toId: SlotId, l: Lineup = lineup): SwapPlan | null {
  return swapPlanFor(fromId, toId, l, SLOT_DEFS, STARTER_IDS);
}
function isStarterSlotId(id: SlotId) {
  const s = SLOT_DEFS.find((x) => x.id === id);
  return !!s?.starter;
}

  function onTilePress(slotId: SlotId) {
    const p = lineup[slotId];

    // choosing who to drop to activate the IR player
    if (irDropMode) {
      if (p) chooseDrop(p);
      return;
    }

    // If we are in "swap select target" mode:
if (swapFromSlot) {
  doSwap(swapFromSlot, slotId);
  return;
}

    // Normal tap: open player card
    if (p) openPlayer(p);
  }

  /** Swap two tiles' players (tap Swap then the other player, or drag one onto the other). */
  function doSwap(fromId: SlotId, toId: SlotId) {
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

setIsDirty(true);

  return next;
});

  setSwapFromSlot(null);
  }

function getUpcomingFixtureTag(teamCodeOrName: string) {
  const teamCode = normalizeTeamCode(teamCodeOrName);

  const f = normalizedFixtures.find((x) => {
    if (x.week !== selectionRealRound) return false;
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

function tileSubtext(p: Player | null) {
  
  if (!p) return "";

  if (viewMode === "Projected") {
    const v = playerProj(p);
    return v == null ? "-" : formatProjection(v);
  }

  if (viewMode === "Fixture") return getUpcomingFixtureTag(p.teamCode);

  const stats = getLiveStat(p);

  if (viewMode === "Latest Score") {
    const v = stats?.latest;
    return v == null ? "-" : String(v);
  }

  if (viewMode === "LastSeason") {
    const pid = getPlayerSheetId(p);
    const v = pid ? lastSeasonAvgById.get(pid) : undefined;
    return v == null ? "-" : v.toFixed(1);
  }

  if (viewMode === "Per80") {
    const v = stats?.per80;
    return v == null ? "-" : v.toFixed(1);
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

  

  // dragging a tile onto another swaps them (components/teamSelection/DragSwap.tsx)
  const [dragSlot, setDragSlot] = useState<SlotId | null>(null);

  // a lineup tile (components/teamSelection/Tiles.tsx); bare = the copy that follows your finger
  const renderTile = (slotId: SlotId, bare = false) => {
    const slot = SLOT_DEFS.find((s) => s.id === slotId)!;
    const p = lineup[slotId];
    const isCaptain = !!p?.id && captainId === p.id && slot.starter;
    const tile = (
      <PlayerTile
        slot={slot}
        player={p}
        isCaptain={isCaptain}
        isVice={!!p?.id && viceId === p.id && slot.starter}
        swapping={!!swapFromSlot}
        isSwapSource={swapFromSlot === slotId}
        // the tiles the swapping player can legally go to (another player's tile, not an empty one)
        isSwapTarget={!!swapFromSlot && slotId !== swapFromSlot && !!p && !!getSwapPlan(swapFromSlot, slotId)}
        irDropMode={irDropMode}
        subtext={tileSubtext(p)}
        captainProj={!!p && viewMode === "Projected" && p.id === captainId}
        livePlayer={p ? getLivePlayerById(p.id) : null}
        onPress={() => {
          if (!justDraggedTile()) onTilePress(slotId);
        }}
      />
    );
    if (bare) return tile;
    return (
      <DragSwapTile id={slotId} canDrag={!!p && !irDropMode}>
        {tile}
      </DragSwapTile>
    );
  };

  const renderIr = (index: number) => {
    const p = irPlayers[index] ?? null;
    const swapping = !!swapFromSlot;
    return (
      <IrTile
        player={p}
        thisFit={!!p && !canGoInIr(p.id)}
        swapping={swapping}
        livePlayer={p ? getLivePlayerById(p.id) : null}
        onPress={() => {
      if (swapping) { setSwapFromSlot(null); return; } // IR isn't part of lineup swaps
      if (irDropMode) { setIrDropMode(false); setIrNotice(null); return; }
      if (p) { setIrFocus(index); openPlayer(p); }
      else setIrNotice({ kind: "info", text: "To use your IR spot, tap an injured player (or one who is out) and choose Move to IR" });
        }}
      />
    );
  };

  // Build modal actions for current modal player
  const modalActions = useMemo(() => {
    if (!modalPlayer) return [];

    const slotId = slotOfPlayer.get(modalPlayer.id) ?? null;
    const slot = slotId ? SLOT_DEFS.find((s) => s.id === slotId)! : null;
    const isStarter = !!slot?.starter;

    const actions: Array<{ label: string; onClick: () => void; variant: "primary" | "secondary" }> = [];

    // The IR player: only activating (he isn't in the lineup)
    if (irPlayers.some((x) => x.id === modalPlayer.id)) {
      actions.push({
        label: "Activate",
        onClick: () => {
          setModalPlayer(null);
          startActivate();
        },
        variant: "primary",
      });
      return actions;
    }

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
        // the vice made captain: the old captain becomes vice
        if (viceId === modalPlayer.id) setViceId(captainId);
        setCaptainId(modalPlayer.id);
        setIsDirty(true);

        setModalPlayer(null);
      },
      variant: "primary",
    });

    actions.push({
      label: "Make Vice",
      onClick: () => {
        if (!isStarter) return;
        // the captain made vice: the old vice becomes captain
        if (captainId === modalPlayer.id) setCaptainId(viceId);
        setViceId(modalPlayer.id);
        setIsDirty(true);

        setModalPlayer(null);
      },
      variant: "primary",
    });

    // Injured (or out) players can go in IR, or swap with the IR player
    if (slotId && squad.ir > 0 && canGoInIr(modalPlayer.id)) {
      const p = lineup[slotId];
      if (p) {
        actions.push({
          label: irFull && irPlayer ? `Swap with ${irPlayers.length > 1 ? nameOf(irPlayer) : "IR"}` : "Move to IR",
          onClick: () => {
            setModalPlayer(null);
            if (irFull && irPlayer) swapWithIr(p);
            else moveToIr(p);
          },
          variant: "secondary",
        });
      }
    }

    // If not starter, disable intent by no-op; you can later add UI disable inside PlayerCardModal if desired.
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalPlayer, slotOfPlayer, swapFromSlot, captainId, viceId, irPlayer, irPlayers, irFull, lineup, rosterPool.length, isDirty, irBusy]);

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
    <div style={{ fontWeight: 700 }}>Loading…</div>
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
        <SelectionHeader
          onOpenMenu={() => setMenuOpen(true)}
          teamProj={teamProj}
          roundText={roundLabel(selectionWeek)}
          deadlineText={deadlineText}
          viewMode={viewMode}
          onViewMode={setViewMode}
          hasLastSeason={hasLastSeason}
          lastSeasonYear={lastSeasonYear}
          saveDisabled={!hasLoadedSaved || !isDirty}
          saveLabel={saveToast ? saveToast : "Save"}
          onSave={() => saveSelection()}
        />

        <SwapDnd
          activeId={dragSlot}
          onStart={(id) => {
            setDragSlot(id as SlotId);
            setSwapFromSlot(id as SlotId); // light up where he can go
          }}
          onDrop={(from, to) => {
            setDragSlot(null);
            if (getSwapPlan(from as SlotId, to as SlotId)) doSwap(from as SlotId, to as SlotId);
            else setSwapFromSlot(null);
          }}
          onCancel={() => {
            setDragSlot(null);
            setSwapFromSlot(null);
          }}
          overlay={(id) => renderTile(id as SlotId, true)}
        >
        {/* Starters on field */}
        <Pitch pitchRowCount={PITCH_ROWS} starterIds={STARTER_IDS} fieldPos={FIELD_POS} renderTile={(id) => renderTile(id)} />

        {/* Bench */}
        <BenchPanel
          benchIds={BENCH_IDS}
          irCount={squad.ir}
          renderTile={(id) => renderTile(id)}
          renderIr={renderIr}
          fitIrName={fitIrPlayer ? nameOf(fitIrPlayer) : null}
          irNotice={irNotice}
          irDropMode={irDropMode}
          onCancelDrop={() => { setIrDropMode(false); setIrNotice(null); }}
          irBusy={irBusy}
        />
        </SwapDnd>
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
