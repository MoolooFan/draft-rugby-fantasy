"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { TEAM_OPTIONS } from "@/lib/constants";
import { getActiveUser, getActiveTimezone, getActiveUsername } from "@/lib/session";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { useTransactionsStore } from "@/lib/transactions/store";

import playersData from "@/data/players.json";
import fixturesData from "@/data/fixtures-2026.json";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { usePlayersStore } from "@/lib/players/store";

// -----------------------
// Types
// -----------------------
type Player = {
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


type AnyFixture = {
  id: string;
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

type Step = "REQUESTING" | "OFFERING" | "REVIEW";
type InfoMode = "DRAFT_RANK" | "AVG_PPG" | "TOTAL_PTS" | "FORM";


const JERSEYS: Record<string, { angle?: string; front?: string; single?: string }> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.png", front: "/images/jerseys/BLUJerseyFront.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.png", front: "/images/jerseys/CHIJerseyFront.png" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.png", front: "/images/jerseys/CRUJerseyFront.png" },
  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.png", front: "/images/jerseys/HIGJerseyFront.png" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.png", front: "/images/jerseys/HURJerseyFront.png" },
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },
  RED: { single: "/images/jerseys/REDJersey.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};
const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.png";

function jerseySrcForTeamCode(teamCode: string | null | undefined, prefer: "angle" | "front" = "angle") {
  const code = normalizeTeamCode(teamCode);
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;
  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

function JerseyTile({ teamCode, size = 34 }: { teamCode: string; size?: number }) {
  return (
    <img
      src={jerseySrcForTeamCode(teamCode, "angle")}
      alt=""
      style={{ width: size, height: size, borderRadius: 10, objectFit: "contain", display: "block" }}
      draggable={false}
    />
  );
}

// -----------------------
// Fixtures helpers (same logic you use elsewhere)
// -----------------------
function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}
function getWeekFirstKickoffMs(fixtures: AnyFixture[], week: number) {
  const wk = fixtures.filter((f) => f.week === week);
  if (!wk.length) return 0;
  return Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
}
function getSelectionDeadlineMs(firstKickoffMs: number) {
  return firstKickoffMs - 2 * 60 * 60 * 1000;
}
function getWeekDeadlineMs(fixtures: AnyFixture[], week: number) {
  const first = getWeekFirstKickoffMs(fixtures, week);
  return first ? getSelectionDeadlineMs(first) : 0;
}
function getWeeksSorted(fixtures: AnyFixture[]) {
  return Array.from(new Set(fixtures.map((f) => f.week))).sort((a, b) => a - b);
}
function formatDeadline(dtMs: number, timeZone?: string) {
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

// -----------------------
// Position + roster validity helpers (matches your waiver validity logic)
// -----------------------
const POSITION_ORDER: Record<string, number> = {
  HO: 1,
  PR: 2,
  LK: 3,
  LF: 4,
  HB: 5,
  FH: 6,
  CE: 7,
  OB: 8,
};

function playerCanPlayPos(p: any, pos: string) {
  const a = String(p?.posAbbrev ?? "").toUpperCase();
  const b = String(p?.secondaryPosAbbrev ?? "").toUpperCase();
  return a === pos || b === pos;
}

function buildRequiredSlots() {
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

function canFillRequiredSlots(players: Player[]) {
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

function asNum(x: any): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x))) return Number(x);
  return null;
}
function toNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getRowNumber(row: any, header: string): number {
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

function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getRoundPointsFromRow(row: any): number | null {
  if (!row) return null;

  // Transactions logic: minutes must exist or we treat as DNP
  const minutePts = getRowNumber(row, "Minutes played");
  if (!minutePts) return null;

  const pointColumns = [
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

  let statPts = 0;
  for (const k of pointColumns) statPts += getRowNumber(row, k);

  const total = minutePts + statPts;
  return Number.isFinite(total) ? total : null;
}

function getPlayerRounds(playerId: string, roundRows: any[]) {
  const want = normaliseId(playerId);

  const idKeys = ["playerId", "player_id", "playerID", "id", "player"];

  return (roundRows ?? []).filter((r: any) => {
    if (!r) return false;

    for (const k of idKeys) {
      if (r[k] != null && normaliseId(r[k]) === want) return true;
    }

    const ks = Object.keys(r);
    const maybe = ks.find(
      (kk) =>
        String(kk).toLowerCase().includes("player") &&
        String(kk).toLowerCase().includes("id")
    );
    if (maybe && r[maybe] != null && normaliseId(r[maybe]) === want) return true;

    return false;
  });
}

function getTotalPointsFromRounds(playerId: string, roundRows: any[]): number | null {
  const rounds = getPlayerRounds(playerId, roundRows);
  if (!rounds.length) return null;

  let total = 0;
  let any = false;

  for (const r of rounds) {
    const pts = getRoundPointsFromRow(r);
    if (pts == null) continue;
    total += pts;
    any = true;
  }

  return any ? total : null;
}

function getMatchesPlayedFromRounds(playerId: string, roundRows: any[]): number | null {
  const rounds = getPlayerRounds(playerId, roundRows);
  if (!rounds.length) return null;

  const played = rounds.reduce((acc: number, r: any) => acc + (getRoundPointsFromRow(r) != null ? 1 : 0), 0);
  return played || null;
}

function getAvgPPGFromRounds(playerId: string, roundRows: any[]): number | null {
  const tot = getTotalPointsFromRounds(playerId, roundRows);
  const gp = getMatchesPlayedFromRounds(playerId, roundRows);
  if (tot != null && gp != null && gp > 0) return tot / gp;
  return null;
}

function getFormLast3AvgFromRounds(playerId: string, roundRows: any[]): number | null {
  const rounds = getPlayerRounds(playerId, roundRows);
  if (!rounds.length) return null;

  const played = rounds
    .map((r: any) => ({ r, pts: getRoundPointsFromRow(r) }))
    .filter((x: any) => typeof x.pts === "number");

  if (!played.length) return null;

  played.sort((a: any, b: any) => (toNum(a.r?.round) ?? 0) - (toNum(b.r?.round) ?? 0));

  const last3 = played.slice(-3);
  const sum = last3.reduce((acc: number, x: any) => acc + (x.pts as number), 0);
  return sum / last3.length;
}

function metricValue(p: Player, mode: InfoMode, roundRows: any[]): string {
  if (mode === "DRAFT_RANK") return typeof p.draftRank === "number" ? String(p.draftRank) : "-";

  if (mode === "TOTAL_PTS") {
    const t = getTotalPointsFromRounds(p.id, roundRows);
    return typeof t === "number" ? String(Math.round(t)) : "-";
  }

  if (mode === "AVG_PPG") {
    const v = getAvgPPGFromRounds(p.id, roundRows);
    return typeof v === "number" ? v.toFixed(1) : "-";
  }

  if (mode === "FORM") {
    const f = getFormLast3AvgFromRounds(p.id, roundRows);
    return typeof f === "number" ? f.toFixed(1) : "-";
  }

  return "—";
}







function fullTeamName(teamCode: string) {
  const code = normalizeTeamCode(teamCode);

  // normal lookup
  const direct = TEAM_OPTIONS.find((t) => t.value === code)?.label;
  if (direct) return direct;

  // handle Moana code mismatch (MOA vs MOP)
  if (code === "MOA") return TEAM_OPTIONS.find((t) => t.value === "MOP")?.label ?? "Moana Pasifika";
  if (code === "MOP") return TEAM_OPTIONS.find((t) => t.value === "MOA")?.label ?? "Moana Pasifika";

  return code;
}


function shortName(p: { firstName?: string; lastName?: string } | null | undefined) {
  const first = (p?.firstName ?? "").trim();
  const last = (p?.lastName ?? "").trim();
  const initial = first ? first[0].toUpperCase() : "?";
  return last ? `${initial}. ${last}` : `${initial}.`;
}

// -----------------------
// Page
// -----------------------
export default function ProposeTradePage() {
  const router = useRouter();
  const sp = useSearchParams();

  // Route protection
  useEffect(() => {
    const u = getActiveUser();
    if (!u) router.replace("/");
  }, [router]);

  const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s: any) => s.activeLeagueId ?? s.activeLeague?.id ?? null);

const activeLeague = useMemo(() => {
  if (!leagues?.length) return null;
  if (activeLeagueId) return leagues.find((l: any) => l.id === activeLeagueId) ?? leagues[0];
  return leagues[0];
}, [leagues, activeLeagueId]);

  const userTz = useMemo(() => getActiveTimezone(), []);
const userId = useMemo(() => getActiveUsername(), []);

  const draftTeams = useDraftStore((s) => s.teams);
  const rosters = useDraftStore((s) => s.rosters);
const watchlist = useDraftStore((s) => (s as any).watchlist ?? {});
const toggleWatchlist = useDraftStore((s) => (s as any).toggleWatchlist ?? (() => {}));

  const addTradeProposal = useTransactionsStore((s) => (s as any).addTradeProposal ?? null);

  type ModalContext = "REQUESTING" | "OFFERING";

const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
const [modalContext, setModalContext] = useState<ModalContext>("REQUESTING");

function openPlayerCard(p: Player, ctx: ModalContext) {
  setModalContext(ctx);
  setModalPlayer(hydratePlayer(p));
}


  // Query params
  const returnTo = sp.get("returnTo") || "";
  const partnerTeamIdInitial = sp.get("partnerTeamId") || "";
  const prefillRequestPlayerId = sp.get("prefillRequestPlayerId") || "";

  
  // Identify your teamId in league/draft
const yourLeagueTeamId = useMemo(() => {
  const l: any = activeLeague;
  if (!l) return null;

  if (userId) {
    const t = (l.teams ?? []).find((x: any) => x.userId === userId);
    if (t) return t.id;
  }

  return (l.teams ?? [])?.[0]?.id ?? null;
}, [activeLeague, userId]);


  const yourDraftTeamId = useMemo(() => {
    if (yourLeagueTeamId && draftTeams.some((t: any) => t.id === yourLeagueTeamId)) return yourLeagueTeamId;
    return draftTeams[0]?.id ?? null;
  }, [yourLeagueTeamId, draftTeams]);
    // Partner team selection
  const [partnerTeamId, setPartnerTeamId] = useState<string>(partnerTeamIdInitial);

  useEffect(() => {
    // If partner not provided, try to pick the first "other" team in league.
    if (partnerTeamId) return;
    const teams = (activeLeague as any)?.teams ?? [];
    const other = teams.find((t: any) => t.id && t.id !== yourDraftTeamId);
    if (other?.id) setPartnerTeamId(other.id);
  }, [partnerTeamId, activeLeague, yourDraftTeamId]);

  // Players
  const allPlayers: Player[] = useMemo(() => {
  return (playersData as any[]).map((p) => ({
    ...p,
    teamCode: normalizeTeamCode(p.teamCode),
    secondaryPosAbbrev: p.secondaryPosAbbrev ?? undefined,
    secondaryPosName: p.secondaryPosName ?? undefined,
  })) as Player[];
}, []);

const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
const roundRows = usePlayersStore((s) => s.roundRows);
const getLivePlayerById = usePlayersStore((s) => s.getById);


useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);


function hydratePlayer(p: Player): Player {
  const live: any = getLivePlayerById?.(p.id);

  const totalPoints = getTotalPointsFromRounds(p.id, roundRows ?? []);
  const matchesPlayed = getMatchesPlayedFromRounds(p.id, roundRows ?? []);
  const avgPointsPerMatch = getAvgPPGFromRounds(p.id, roundRows ?? []);

  return {
    ...p,

    // normalize null -> undefined for modal typing
    secondaryPosAbbrev: p.secondaryPosAbbrev ?? undefined,
    secondaryPosName: p.secondaryPosName ?? undefined,

    // live sheet (modal + badges)
    status: live?.status ?? (p as any).status ?? undefined,
    weeklyStatus: live?.weeklyStatus ?? (p as any).weeklyStatus ?? {},

    // computed (the key fix)
    totalPoints,
    matchesPlayed,
    avgPointsPerMatch,

    // optional: keep stats object stable so modal never breaks
    stats: (p as any).stats ?? {},
    playerStats: (p as any).playerStats ?? (p as any).stats ?? {},
  };
}




  // Fixtures + week info (for deadline UI + auto-decline rules)
  const fixtures = useMemo(
    () => (fixturesData as AnyFixture[]).map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) })),
    []
  );
  const normalizedFixtures = useMemo(
    () => fixtures.slice().sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0)),
    [fixtures]
  );
  const weeksSorted = useMemo(() => getWeeksSorted(normalizedFixtures), [normalizedFixtures]);

  // We’ll treat “current selection week” as the minimum week that still has a future deadline.
  const [nowMs, setNowMs] = useState(() => Date.now());

useEffect(() => {
  const id = setInterval(() => setNowMs(Date.now()), 30000);
  return () => clearInterval(id);
}, []);

  const selectionWeek = useMemo(() => {
    for (const w of weeksSorted) {
      const deadline = getWeekDeadlineMs(normalizedFixtures as any, w);
      if (deadline && nowMs < deadline) return w;
    }
    // if all deadlines passed, just use last week
    return weeksSorted[weeksSorted.length - 1] ?? 1;
  }, [weeksSorted, normalizedFixtures, nowMs]);

  const selectionDeadlineMs = useMemo(() => getWeekDeadlineMs(normalizedFixtures as any, selectionWeek), [normalizedFixtures, selectionWeek]);

  // HARD trade deadline = final team selection deadline before playoffs.
  // We’ll look for a league setting; if it doesn’t exist, we assume playoffs start AFTER the final fixture week (so last week is trade-deadline).
  const playoffStartWeek =
    (activeLeague as any)?.playoffStartWeek ??
    (activeLeague as any)?.settings?.playoffStartWeek ??
    null;

  const hardTradeDeadlineWeek = useMemo(() => {
    const lastWeek = weeksSorted[weeksSorted.length - 1] ?? 1;
    if (typeof playoffStartWeek === "number" && playoffStartWeek > 1) return Math.max(1, playoffStartWeek - 1);
    return lastWeek;
  }, [weeksSorted, playoffStartWeek]);

  const hardTradeDeadlineMs = useMemo(() => getWeekDeadlineMs(normalizedFixtures as any, hardTradeDeadlineWeek), [normalizedFixtures, hardTradeDeadlineWeek]);

  const tradeWindowClosed = useMemo(() => {
    if (!hardTradeDeadlineMs) return false;
    return nowMs >= hardTradeDeadlineMs;
  }, [nowMs, hardTradeDeadlineMs]);


  const yourTeamName = useMemo(() => {
  return (activeLeague as any)?.teams?.find((t: any) => t.id === yourLeagueTeamId)?.name ?? "";
}, [activeLeague, yourLeagueTeamId]);

const partnerTeamName = useMemo(() => {
  return (activeLeague as any)?.teams?.find((t: any) => t.id === partnerTeamId)?.name ?? "";
}, [activeLeague, partnerTeamId]);

const [step, setStep] = useState<Step>("REQUESTING");
const [requestingIds, setRequestingIds] = useState<string[]>([]);
const [offeringIds, setOfferingIds] = useState<string[]>([]);

  const modalActions = useMemo(() => {
  if (!modalPlayer) return [];

  const playerId = modalPlayer.id;
  const isOnWatchlist = !!(watchlist as any)[playerId];

  const addToWatchlistAction = {
    label: isOnWatchlist ? "Remove from Watchlist" : "Add to Watchlist",
    variant: "secondary" as const,
    onClick: () => toggleWatchlist(playerId),
  };

  const tradeAction = {
    label: "Trade",
    variant: "primary" as const,
    onClick: () => {
      // close card first
      setModalPlayer(null);

      // then select player in the correct list
      window.setTimeout(() => {
        if (modalContext === "REQUESTING") {
          setRequestingIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
        } else {
          setOfferingIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
        }
      }, 0);
    },
  };

  return [addToWatchlistAction, tradeAction];
}, [modalPlayer, modalContext, watchlist, toggleWatchlist]);



  // Info mode
  const [infoMode, setInfoMode] = useState<InfoMode>("AVG_PPG");


  // When partner team changes: clear selections + go back to REQUESTING
  useEffect(() => {
    setRequestingIds([]);
    setOfferingIds([]);
    setStep("REQUESTING");
  }, [partnerTeamId]);



  // Get a team roster as a flat unique list
  const rosterPlayersForTeam = useMemo(() => {
    return (teamId: string | null | undefined): Player[] => {
      if (!teamId) return [];
      const r: any = (rosters as any)?.[teamId];
      if (!r) return [];
      const out: Player[] = [];
      const seen = new Set<string>();

      for (const arr of Object.values(r?.slots ?? {})) {
        for (const p of (arr as any[]) ?? []) {
          if (!p?.id || seen.has(p.id)) continue;
          seen.add(p.id);
          out.push(p as Player);
        }
      }
      for (const p of (r?.wildcards ?? []) as any[]) {
        if (!p?.id || seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p as Player);
      }
      return out;
    };
  }, [rosters]);

  const partnerRoster = useMemo(() => rosterPlayersForTeam(partnerTeamId), [rosterPlayersForTeam, partnerTeamId]);
  const yourRoster = useMemo(() => rosterPlayersForTeam(yourDraftTeamId), [rosterPlayersForTeam, yourDraftTeamId]);

  const partnerRosterLive = useMemo(() => {
  return partnerRoster.map((p) => hydratePlayer(p));
}, [partnerRoster, livePlayersLoaded, getLivePlayerById]);
useEffect(() => {
  if (!partnerRosterLive.length) return;
  console.log("TRADE LIVE SAMPLE", partnerRosterLive[0]);
}, [partnerRosterLive]);

const yourRosterLive = useMemo(() => {
  return yourRoster.map((p) => hydratePlayer(p));
}, [yourRoster, livePlayersLoaded, getLivePlayerById]);

// Prefill requested player (only if on current partner roster)
useEffect(() => {
  if (!prefillRequestPlayerId) return;
  if (!partnerRoster.some((p) => p.id === prefillRequestPlayerId)) return;

  setRequestingIds((prev) => {
    if (prev.includes(prefillRequestPlayerId)) return prev;
    return [...prev, prefillRequestPlayerId];
  });
}, [prefillRequestPlayerId, partnerRoster]);

  // Group-by-position helper (keeps your exact order)
  function groupByPosition(players: Player[]) {
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
  function toggleId(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  // Validity check (both rosters must remain viable after swap)
  const validity = useMemo(() => {
    const reqPlayers = requestingIds
  .map((id) => partnerRosterLive.find((p) => p.id === id) ?? partnerRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))

  .filter(Boolean) as Player[];

const offPlayers = offeringIds
  .map((id) => yourRosterLive.find((p) => p.id === id) ?? yourRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))


  .filter(Boolean) as Player[];

    if (reqPlayers.length === 0) return { ok: false, msg: "Select at least 1 requested player." };
    if (offPlayers.length !== reqPlayers.length) return { ok: false, msg: "Offering must match requested player count." };

    // Build after-swap rosters
    const yourAfter = yourRoster.filter((p) => !offeringIds.includes(p.id)).concat(reqPlayers);
    const theirAfter = partnerRoster.filter((p) => !requestingIds.includes(p.id)).concat(offPlayers);

    const okYour = canFillRequiredSlots(yourAfter);
    const okTheir = canFillRequiredSlots(theirAfter);

    if (!okYour || !okTheir) return { ok: false, msg: "Invalid trade (one or both squads would be unviable)." };
    return { ok: true, msg: "Valid Trade" };
  }, [requestingIds, offeringIds, allPlayers, yourRoster, partnerRoster]);

  // Close / return logic
  function goBackToReturnTo() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.back();
  }

  // UI styles (match your Transactions vibe)
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const listBox: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    color: "#0f172a",
  };

  const inputWrap: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "8px 10px",
    boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
  };

  function StepButtons() {
  // REQUESTING: Next (right aligned)
  if (step === "REQUESTING") {
    const canNext = requestingIds.length > 0;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div />
        <button
          disabled={!canNext}
          onClick={() => setStep("OFFERING")}
          style={{
            height: 38,
            borderRadius: 12,
            border: "none",
            background: canNext ? "#2563EB" : "rgba(0,0,0,0.20)",
            color: "white",
            fontWeight: 900,
            cursor: canNext ? "pointer" : "not-allowed",
          }}
        >
          Next
        </button>
      </div>
    );
  }

  // OFFERING: Back + Review
  if (step === "OFFERING") {
    const canReview = offeringIds.length === requestingIds.length && requestingIds.length > 0;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button
          onClick={() => setStep("REQUESTING")}
          style={{
            height: 38,
            borderRadius: 12,
            border: "3px solid rgba(37,99,235,0.90)",
            background: "white",
            color: "#2563EB",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Back
        </button>

        <button
          disabled={!canReview}
          onClick={() => setStep("REVIEW")}
          style={{
            height: 38,
            borderRadius: 12,
            border: "none",
            background: canReview ? "#2563EB" : "rgba(0,0,0,0.20)",
            color: "white",
            fontWeight: 900,
            cursor: canReview ? "pointer" : "not-allowed",
          }}
        >
          Review
        </button>
      </div>
    );
  }

// REVIEW: Back + Propose
if (step === "REVIEW") {
  const canPropose = validity.ok && !tradeWindowClosed;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <button
        onClick={() => setStep("OFFERING")}
        style={{
          height: 38,
          borderRadius: 12,
          border: "3px solid rgba(37,99,235,0.90)",
          background: "white",
          color: "#2563EB",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        Back
      </button>

      <button
        disabled={!canPropose}
        onClick={() => {
          if (tradeWindowClosed) return;
          if (!validity.ok) return;
          if (!activeLeague?.id || !yourDraftTeamId || !partnerTeamId) return;
          if (typeof addTradeProposal !== "function") {
            alert("Trade store not wired yet: missing useTransactionsStore.addTradeProposal");
            return;
          }

          const before = useTransactionsStore.getState().trades.length;

addTradeProposal({
  leagueId: activeLeague.id,
  week: selectionWeek,
  fromTeamId: yourDraftTeamId,
  toTeamId: partnerTeamId,
  offerPlayerIds: offeringIds,
  requestPlayerIds: requestingIds,
  createdAtMs: Date.now(),
  note: "",
});

const after = useTransactionsStore.getState().trades.length;

if (after === before) {
  alert("Trade could not be proposed. A player may be locked, rosters changed, or it’s a duplicate trade.");
  return;
}

goBackToReturnTo();

        }}
        style={{
          height: 38,
          borderRadius: 12,
          border: "none",
          background: canPropose ? "#22C55E" : "rgba(0,0,0,0.20)",
          color: "white",
          fontWeight: 900,
          cursor: canPropose ? "pointer" : "not-allowed",
        }}
      >
        Propose
      </button>
    </div>
  );
}


  return null;

}

  function TopBar() {
    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Propose Trade</div>
          <div style={{ flex: 1 }} />
          <button
            onClick={goBackToReturnTo}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "none",
              background: "rgba(255,255,255,0.18)",
              color: "white",
              fontSize: 18,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {/* Team selector / display */}
{step === "REQUESTING" ? (
  // STEP 1: Pick partner team
  <div style={{ ...inputWrap, position: "relative" }}>
    <select
      value={partnerTeamId}
      onChange={(e) => setPartnerTeamId(e.target.value)}
      style={{
        width: "100%",
        height: 34,
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: 13,
        fontWeight: 800,
        color: partnerTeamId ? "#0f172a" : "rgba(15,23,42,0.55)",
        WebkitAppearance: "none",
        appearance: "none",
        paddingRight: 30,
      }}
    >
      {(activeLeague as any)?.teams
        ?.filter((t: any) => t.id !== yourDraftTeamId)
        .map((t: any) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
    </select>

    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        right: 10,
        top: "50%",
        transform: "translateY(-50%)",
        color: "rgba(15,23,42,0.45)",
        fontSize: 16,
        pointerEvents: "none",
      }}
    >
      ▾
    </span>
  </div>
) : (
  // STEP 2 + 3: Locked display (no dropdown)
  <div
    style={{
      ...inputWrap,
      fontSize: 13,
      fontWeight: 900,
      color: "#0f172a",
      height: 34,
      display: "flex",
      alignItems: "center",
    }}
  >
    {step === "OFFERING" ? yourTeamName : partnerTeamName}
  </div>
)}




          {/* View selector */}
          <div style={{ ...inputWrap, position: "relative" }}>
            <select
              value={infoMode}
              onChange={(e) => setInfoMode(e.target.value as InfoMode)}
              style={{
                width: "100%",
                height: 34,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 800,
                color: "#0f172a",
                WebkitAppearance: "none",
                appearance: "none",
                paddingRight: 30,
              }}
            >
              <option value="DRAFT_RANK">Draft Rank</option>
<option value="AVG_PPG">Match Average</option>
<option value="TOTAL_PTS">Total Points</option>
<option value="FORM">Form</option>

            </select>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(15,23,42,0.45)",
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              ▾
            </span>
          </div>
{/* Step buttons (moved from footer) */}
<StepButtons />

          
        </div>
      </div>
    );
  }

  function SectionHeader({ title, color }: { title: string; color: string }) {
    return (
      <div
        style={{
          padding: "8px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 900,
          color,
        }}
      >
        {title}
      </div>
    );
  }

function PlayerRow({
  p,
  selected,
  onToggle,
  onOpen,
  infoMode,
}: {
  p: Player;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  infoMode: InfoMode;
}) {
useEffect(() => {
  if (!p?.id) return;
  // only log once per player
  // @ts-ignore
  if ((window as any).__loggedTradeStats?.[p.id]) return;
  // @ts-ignore
  (window as any).__loggedTradeStats = { ...((window as any).__loggedTradeStats ?? {}), [p.id]: true };

  console.log("TRADE ROW", p.id, {
    hasStats: !!(p as any).stats,
    stats: (p as any).stats,
    weeklyStatus: (p as any).weeklyStatus,
    raw: p,
  });
}, [p]);


  return (
    <div
      onClick={onOpen}
      style={{
        padding: "8px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        display: "grid",
        gridTemplateColumns: "1fr 82px 82px",
        gap: 10,
        alignItems: "center",
        background: selected ? "rgba(37,99,235,0.10)" : "transparent",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <JerseyTile teamCode={p.teamCode} size={26} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shortName(p)}
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              opacity: 0.7,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {fullTeamName(p.teamCode)} — {p.posName}
            {p.secondaryPosName ? ` / ${p.secondaryPosName}` : ""}
          </div>
        </div>
      </div>

      {/* Metric + live week points */}
      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900 }}>
  {metricValue(p, infoMode, roundRows ?? [])}

</div>


      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          height: 26,
          padding: "0 10px",
          borderRadius: 999,
          border: "2px solid #2563EB",
          background: selected ? "#2563EB" : "transparent",
          color: selected ? "white" : "#2563EB",
          fontWeight: 900,
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Trade
      </button>
    </div>
  );
}

function GroupedList({
  title,
  titleColor,
  players,
  selectedIds,
  onToggleId,
  context,
  infoMode,
  hidePositionHeaders = false,
}: {
  title: string;
  titleColor: string;
  players: Player[];
  selectedIds: string[];
  onToggleId: (id: string) => void;
  context: ModalContext;
  infoMode: InfoMode;
  hidePositionHeaders?: boolean;
}) {




    const groups = groupByPosition(players);
    return (
      <div style={listBox}>
        <SectionHeader title={title} color={titleColor} />
        {groups.map((g) => (
          <div key={g.pos}>
            {!hidePositionHeaders && (
  <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 900, opacity: 0.55 }}>
    {g.pos === "HO" ? "Hookers" :
     g.pos === "PR" ? "Props" :
     g.pos === "LK" ? "Locks" :
     g.pos === "LF" ? "Loose Forwards" :
     g.pos === "HB" ? "Halfbacks" :
     g.pos === "FH" ? "Flyhalves" :
     g.pos === "CE" ? "Centres" :
     "Outside Backs"}
  </div>
)}

            {g.players.map((p) => (
<PlayerRow
  key={p.id}
  p={p}
  selected={selectedIds.includes(p.id)}
  onToggle={() => onToggleId(p.id)}
  onOpen={() => openPlayerCard(p, context)}
  infoMode={infoMode}
/>




            ))}
          </div>
        ))}
      </div>
    );
  }

  // Footer buttons for each step
function Footer() {
  // Only show footer buttons on REVIEW
  if (step !== "REVIEW") return null;

  const canPropose = validity.ok && !tradeWindowClosed;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <button
        onClick={goBackToReturnTo}
        style={{
          height: 42,
          borderRadius: 12,
          border: "2px solid rgba(239,68,68,0.9)",
          background: "transparent",
          color: "rgba(239,68,68,0.95)",
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        Cancel
      </button>

      <button
        disabled={!canPropose}
        onClick={() => {
          if (tradeWindowClosed) return;
          if (!validity.ok) return;
          if (!activeLeague?.id || !yourDraftTeamId || !partnerTeamId) return;

          if (typeof addTradeProposal !== "function") {
            alert("Trade store not wired yet: missing useTransactionsStore.addTradeProposal");
            return;
          }

addTradeProposal({
  leagueId: activeLeague.id,
  week: selectionWeek,
  fromTeamId: yourDraftTeamId,     // ✅ match the rest of the file
  toTeamId: partnerTeamId,
  offerPlayerIds: offeringIds,
  requestPlayerIds: requestingIds,
  createdAtMs: Date.now(),
  note: "",
});



          goBackToReturnTo();
        }}
        style={{
          height: 42,
          borderRadius: 12,
          border: "none",
          background: canPropose ? "#22C55E" : "rgba(0,0,0,0.20)",
          color: "white",
          fontWeight: 900,
          cursor: canPropose ? "pointer" : "not-allowed",
        }}
      >
        Propose
      </button>
    </div>
  );
}



  // Render the correct list
  const requestingCount = requestingIds.length;
  const offeringCount = offeringIds.length;

const reviewRequestPlayers = requestingIds
  .map((id) => partnerRosterLive.find((p) => p.id === id) ?? partnerRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))
  .filter(Boolean)
  .map((p) => hydratePlayer(p as Player));

const reviewOfferPlayers = offeringIds
  .map((id) => yourRosterLive.find((p) => p.id === id) ?? yourRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))
  .filter(Boolean)
  .map((p) => hydratePlayer(p as Player));


  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Background */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <TopBar />

{step !== "REVIEW" && (
  <div style={{ marginTop: 10, fontSize: 12, fontWeight: 900 }}>
    {step === "REQUESTING" ? (
      <span>
        <span style={{ color: "white" }}>Players Selected:</span> {requestingCount}
      </span>
    ) : (
      <span>
        <span style={{ color: "white" }}>Players Selected:</span> {offeringCount} / {requestingCount}
      </span>
    )}
  </div>
)}




        {step === "REQUESTING" && (
<GroupedList
  title="Requesting:"
  titleColor="#EF4444"
  players={partnerRosterLive}
  selectedIds={requestingIds}
  onToggleId={(id) => setRequestingIds((prev) => toggleId(prev, id))}
  context="REQUESTING"

  infoMode={infoMode}
/>


        )}

        {step === "OFFERING" && (
<GroupedList
  title="Offering:"
  titleColor="#22C55E"
  players={yourRosterLive}
  selectedIds={offeringIds}
  onToggleId={(id) => setOfferingIds((prev) => toggleId(prev, id))}
  context="OFFERING"

  infoMode={infoMode}
/>


        )}

        {step === "REVIEW" && (
          <>
<GroupedList
  title="Offering:"
  titleColor="#22C55E"
  players={reviewOfferPlayers}
  selectedIds={offeringIds}
  onToggleId={(id) => setOfferingIds((prev) => toggleId(prev, id))}
  context="OFFERING"
  hidePositionHeaders

  infoMode={infoMode}
/>


<GroupedList
  title="Requesting:"
  titleColor="#EF4444"
  players={reviewRequestPlayers}
  selectedIds={requestingIds}
  onToggleId={(id) => setRequestingIds((prev) => toggleId(prev, id))}
  context="REQUESTING"
  hidePositionHeaders

  infoMode={infoMode}
/>



<div style={{ ...inputWrap, marginTop: 10 }}>
  {/* Valid / Invalid message */}
  <div style={{ fontSize: 12, fontWeight: 900 }}>
    {tradeWindowClosed ? (
      <span style={{ color: "rgba(239,68,68,0.95)" }}>
        Trade window closed (regular season deadline passed)
      </span>
    ) : validity.ok ? (
      <span style={{ color: "rgba(34,197,94,0.95)" }}>{validity.msg}</span>
    ) : (
      <span style={{ color: "rgba(0, 0, 0, 0.95)" }}>{validity.msg}</span>
    )}
  </div>

  {/* Cancel / Propose buttons */}
  <div style={{ marginTop: 10 }}>
    <Footer />
  </div>
</div>


          </>
        )}

        
      </div>
{modalPlayer ? (
  <PlayerCardModal
    onClose={() => setModalPlayer(null)}
    player={hydratePlayer(modalPlayer)} // ✅ always pass fully hydrated player
    teamLabel={yourTeamName}
    initialTab="Stats"
    actions={modalActions}
  />
) : null}



    </main>
  );
}
