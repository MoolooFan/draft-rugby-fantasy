"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AppMenu } from "@/components/AppMenu";
import { PlayerCardModal } from "@/components/PlayerCardModal";

import { TEAM_OPTIONS, POSITION_OPTIONS } from "@/lib/constants";
import { getActiveUsername, getActiveTimezone } from "@/lib/session";
import { useRequireSession } from "@/lib/session/useRequireSession";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { useTransactionsStore } from "@/lib/transactions/store";
import { usePlayersStore } from "@/lib/players/store";

import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";

import playersData from "@/data/players.json";
import fixturesData from "@/data/fixtures-2026.json";

// -----------------------
// Types (match your player shape)
// -----------------------
type Player = {
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
  const wk = rows.filter(
    (r) => Number(r.weekFantasy) === weekNo && isSheetPlayableRow(r)
  );
  if (!wk.length) return false;
  return wk.every((r) => String(r.status ?? "").toLowerCase() === "complete");
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

  return weeks[weeks.length - 1] ?? 1;
}

type AnyFixture = {
  id: string;
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

type TabKey = "Player Pool" | "Watchlist" | "Pending Claims" | "Transactions";

// =========================
// Jersey assets (match Draft Room: prefer ANGLED if available)
// Files live in: /public/images/jerseys
// =========================
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

const EMPTY_ARR: any[] = [];
const EMPTY_OBJ: any = {};
const NOOP = () => {};

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

function toNum(v: any): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// -----------------------
// Date helpers (same pattern as fixtures/team-selection pages)
// -----------------------
function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

function isFixtureComplete(f: AnyFixture) {
  if ((f.status ?? "").toLowerCase() === "complete") return true;
  if (f.homeScore != null && f.awayScore != null) return true;
  return false;
}

function getSelectionDeadlineMs(firstKickoffMs: number) {
  return firstKickoffMs - 1 * 60 * 60 * 1000; // 1h before first kickoff
}

function getWeekFirstKickoffMs(fixtures: AnyFixture[], week: number) {
  const wk = fixtures.filter((f) => f.week === week);
  if (!wk.length) return 0;
  return Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
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

function useNowTick(ms = 30_000) {
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    // set immediately after mount so server/client match on first HTML
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);

  return now;
}


// -----------------------
// Standings replication (matches League page placeholder logic)
// This is ONLY for waiver order until standings are real.
// -----------------------
function hashInt(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded01(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildStandingsRows(teams: { id: string; name: string }[], playedWeeks: number) {
  const rows = teams.map((t) => {
    const base = hashInt(t.id);

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let pf = 0;
    let pa = 0;

    for (let w = 1; w <= playedWeeks; w++) {
      const r = seeded01(base + w * 101);

      if (r < 0.45) wins++;
      else if (r < 0.55) draws++;
      else losses++;

      const pfw = 20 + Math.floor(seeded01(base + w * 911) * 41);
      const paw = 20 + Math.floor(seeded01(base + w * 733) * 41);
      pf += pfw;
      pa += paw;
    }

    const pd = pf - pa;
    const pts = wins * 4 + draws * 2;

    return {
      teamId: t.id,
      teamName: t.name,
      played: playedWeeks,
      wins,
      draws,
      losses,
      pf,
      pa,
      pd,
      pts,
    };
  });

  rows.sort((a, b) => b.pts - a.pts || b.pd - a.pd || b.pf - a.pf);

  return rows.map((r, idx) => ({
    rank: idx + 1,
    ...r,
  }));
}

function getInitials(name: string | null | undefined) {
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

function initialsForTeamId(teamId: string, activeLeague: any) {
  const t = activeLeague?.teams?.find((x: any) => x.id === teamId);
  const base = t?.userInitials || t?.userId || t?.name || teamId;
  return getInitials(String(base));
}

function normUser(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

type FiltersProps = {
  search: string;
  setSearch: (v: string) => void;

  teamFilter: string;
  setTeamFilter: (v: string) => void;

  posFilter: string;
  setPosFilter: (v: string) => void;

  ownerFilterValue: string;
  setOwnerFilterValue: (v: string) => void;

  ownerFilterOptions: Array<{ label: string; value: string }>;

  infoMode: string;
  setInfoMode: (v: string) => void;
};

const Filters = React.memo(function Filters({
  search,
  setSearch,
  teamFilter,
  setTeamFilter,
  posFilter,
  setPosFilter,
  ownerFilterValue,
  setOwnerFilterValue,
  ownerFilterOptions,
  infoMode,
  setInfoMode,
}: FiltersProps) {
  const stopCapture = (e: any) => {
    e.stopPropagation?.();
  };

  const inputWrap: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "8px 10px",
    boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
  };

  return (
    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
      <div style={inputWrap}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 26px", alignItems: "center", gap: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // ✅ keep keyboard open while typing; only close on Enter
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            }}
            placeholder="Search players"
            inputMode="search"
            enterKeyHint="search"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
            }}
          />
          <div style={{ textAlign: "right", fontSize: 16, opacity: 0.65 }}>🔍</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: teamFilter ? "#0f172a" : "rgba(15,23,42,0.55)",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            <option value="">All Teams</option>
            {TEAM_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
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

        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={posFilter}
            onChange={(e) => setPosFilter(e.target.value)}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: posFilter ? "#0f172a" : "rgba(15,23,42,0.55)",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            <option value="">All Positions</option>
            {POSITION_OPTIONS.filter((p) => String(p.value).toUpperCase() !== "WC").map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
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
      </div>

      {/* Owner + Info mode side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={ownerFilterValue}
            onChange={(e) => setOwnerFilterValue(e.target.value)}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: ownerFilterValue === "available" ? "rgba(15,23,42,0.55)" : "#0f172a",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            {ownerFilterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
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

        <div style={{ ...inputWrap, position: "relative" }} onPointerDownCapture={stopCapture} onClickCapture={stopCapture}>
          <select
            value={infoMode}
            onChange={(e) => setInfoMode(e.target.value)}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            style={{
              width: "100%",
              height: 34,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
              WebkitAppearance: "none",
              appearance: "none",
              paddingRight: 30,
            }}
          >
            <option value="DRAFT_RANK">Draft Rank</option>
            <option value="MATCH_AVG">Match Average</option>
            <option value="TOTAL_PTS">Total Points</option>
            <option value="FORM_3">Form</option>
            <option value="LAST_SCORE">Last Fixture</option>
            <option value="GAMES_PLAYED">Games Played</option>
            <option value="TRIES">Tries Scored</option>
            <option value="TRY_ASSISTS">Try Assists</option>
            <option value="LINEBREAKS">Line Breaks</option>
            <option value="LINEBREAK_ASSISTS">Line Break Assists</option>
            <option value="DEFENDERS_BEATEN">Defenders Beaten</option>
            <option value="METRES_GAINED">Metres Gained</option>
            <option value="OFFLOADS">Offloads</option>
            <option value="TACKLES">Tackles</option>
            <option value="MISSED_TACKLES">Missed Tackles</option>
            <option value="TURNOVERS_FORCED">Turnovers Forced</option>
            <option value="INTERCEPTIONS">Interceptions</option>
            <option value="KICKS_50_22">50:22 Kicks</option>
            <option value="PENALTIES_CONCEDED">Penalties Conceded</option>
            <option value="ERRORS">Errors</option>
            <option value="LINEOUTS_WON">Lineouts Won</option>
            <option value="LINEOUT_STEALS">Lineout Steals</option>
            <option value="LINEOUT_ERRORS">Lineout Errors</option>
            <option value="SCRUMS_WON">Scrums Won</option>
            <option value="CONVERSIONS">Conversions</option>
            <option value="PENALTY_GOALS">Penalty Goals</option>
            <option value="DROP_GOALS">Drop Goals</option>
            <option value="YELLOW_CARDS">Yellow Cards</option>
            <option value="RED_CARDS">Red Cards</option>
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
      </div>
    </div>
  );
});

function extractRosterIdsClient(data: any): string[] {
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

function TransactionsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ENABLE_TRADES = true;
  const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

  const returnTo = useMemo(() => {
    const qs = searchParams?.toString?.() ?? "";
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);


  // Menu + league
  const [menuOpen, setMenuOpen] = useState(false);
const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s: any) => s.activeLeagueId ?? s.activeLeague?.id ?? null);
const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
// ❌ REMOVE tradeWindowOpen here (nowMs/selectionDeadlineMs aren’t defined yet)

// ✅ derive activeLeague WITHOUT calling a store function in the selector
const activeLeague = useMemo(() => {
  if (!leagues?.length) return null;
  if (activeLeagueId) return leagues.find((l: any) => l.id === activeLeagueId) ?? leagues[0];
  return leagues[0];
}, [leagues, activeLeagueId]);


  const userId = useMemo(() => normUser(getActiveUsername()), []);
  const userTz = useMemo(() => getActiveTimezone(), []);

  // Draft store data
  const draftTeams = useDraftStore((s) => s.teams);
  const rosters = useDraftStore((s) => s.rosters);
  const applyRosterMove = useDraftStore((s) => (s as any).applyRosterMove);

const [watchlistSet, setWatchlistSet] = useState<Set<string>>(new Set());
const [watchlistLoaded, setWatchlistLoaded] = useState(false);

const toggleWatchlist = React.useCallback(
  async (playerId: string) => {
    const leagueId = String(activeLeague?.id ?? "");
    if (!leagueId) return;

    // (TEMP) league-wide watchlist
    // Later when you make it per-team, include teamId in these API calls.
    const isStar = watchlistSet.has(playerId);

    // optimistic UI
    setWatchlistSet((prev) => {
      const next = new Set(prev);
      if (isStar) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

    try {
      if (isStar) {
        await fetch(
          `/api/watchlist?leagueId=${encodeURIComponent(leagueId)}&playerId=${encodeURIComponent(playerId)}`,
          { method: "DELETE" }
        );
      } else {
        await fetch(`/api/watchlist`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leagueId, playerId }),
        });
      }
    } catch (e) {
      // rollback on failure
      setWatchlistSet((prev) => {
        const next = new Set(prev);
        if (isStar) next.add(playerId);
        else next.delete(playerId);
        return next;
      });
    }
  },
  [activeLeague?.id, watchlistSet]
);

const watchlist = useMemo(() => {
  // keep your existing "watchlist[playerId]" checks working
  const obj: Record<string, boolean> = {};
  watchlistSet.forEach((id) => (obj[id] = true));
  return obj;
}, [watchlistSet]);

useEffect(() => {
  if (!activeLeague?.id) return;

  const season = 2026;

  fetch(
    `/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(activeLeague.id)}`,
    {
      cache: "no-store",
      credentials: "include",
    }
  )
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id]);

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  let cancelled = false;
  (async () => {
    setWatchlistLoaded(false);
    const res = await fetch(`/api/watchlist?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (cancelled) return;

    if (res.ok && json?.ok) {
      setWatchlistSet(new Set<string>((json.data ?? []).map(String)));
    } else {
      setWatchlistSet(new Set());
    }
    setWatchlistLoaded(true);
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeague?.id]);

  // Transactions store (local fallback data)
const claims = useTransactionsStore((s: any) => s.claims ?? []);
const trades = useTransactionsStore((s: any) => s.trades ?? []);
const dropLocks = useTransactionsStore((s: any) => s.dropLocks ?? []);

// this name varies in your codebase; keep it tolerant:
const freeAgentTransfers = useTransactionsStore(
  (s: any) => s.freeAgentTransfers ?? s.freeAgents ?? s.freeAgencyTransfers ?? []
);

// -----------------------
// Live Players (Google Sheet) hydration
// -----------------------
const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
const roundRows = usePlayersStore((s) => s.roundRows);
const getLivePlayerById = usePlayersStore((s) => s.getById); // keep for modal status only


useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);

// -----------------------
// Resolve "your team id" robustly (THIS FIXES RECEIVED TRADES NOT SHOWING)
// -----------------------
function pickFirstTruthy<T>(...vals: Array<T | null | undefined>): T | null {
  for (const v of vals) if (v != null && String(v).trim() !== "") return v as T;
  return null;
}

function normStr(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

const yourDraftTeamId = useMemo(() => {
  const l: any = activeLeague;
  if (!l) return null;

  // 0) If the league store already knows your team id, use it.
  // (These keys cover common patterns across your codebase.)
  const direct = pickFirstTruthy(
    l.myTeamId,
    l.my_team_id,
    l.activeTeamId,
    l.active_team_id,
    l.teamId,
    l.team_id
  );
  if (direct) return String(direct);

  const leagueTeams = Array.isArray(l.teams) ? l.teams : [];
  const u = normStr(userId);

  // 1) Try to match activeLeague.teams ownership fields
  if (u && leagueTeams.length) {
    const mine = leagueTeams.find((t: any) => {
      const candidates = [
        t.userId,
        t.user_id,
        t.owner_username,
        t.ownerUsername,
        t.username,
        t.email,
        t.owner_email,
        t.ownerEmail,
      ].map(normStr);

      return candidates.includes(u);
    });

    if (mine?.id) return String(mine.id);
  }

  // 2) Fallback: match draftTeams ownership fields (sometimes this is more reliable)
  if (u && Array.isArray(draftTeams) && draftTeams.length) {
    const mineDraft = draftTeams.find((t: any) => {
      const candidates = [
        t.userId,
        t.user_id,
        t.owner_username,
        t.ownerUsername,
        t.username,
        t.email,
      ].map(normStr);

      return candidates.includes(u);
    });

    if (mineDraft?.id) return String(mineDraft.id);
  }

  // 3) If there is ONLY ONE team in the league, allow that as last resort
  if (leagueTeams.length === 1) return String(leagueTeams[0].id);

  return null;
}, [activeLeague, userId, draftTeams]);



  const yourTeamName = useMemo(() => {
    if (!yourDraftTeamId) return "Your Team";
    return draftTeams.find((t: any) => t.id === yourDraftTeamId)?.name ?? "Your Team";
  }, [draftTeams, yourDraftTeamId]);

    // Players (normalize teamCode like Draft Room)
  const allPlayers: Player[] = useMemo(() => {
    return (playersData as Player[]).map((p) => ({
      ...p,
      teamCode: normalizeTeamCode(p.teamCode),
    }));
  }, []);

  // Fixtures + week logic (matches Team Selection)
  const fixtures = useMemo(
    () => (fixturesData as AnyFixture[]).map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) })),
    []
  );
  const normalizedFixtures = useMemo(
    () => fixtures.slice().sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0)),
    [fixtures]
  );

  const nowMs = useNowTick(30_000);
  const weeksSorted = useMemo(() => getWeeksSorted(normalizedFixtures), [normalizedFixtures]);

const liveWeek = useMemo(() => {
  if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
  return currentWeekFromSheet(sheetFixtures);
}, [sheetFixtures, activeLeague?.currentWeek]);

  const liveWeekDeadlineMs = useMemo(
    () => getWeekDeadlineMs(normalizedFixtures as any, liveWeek),
    [normalizedFixtures, liveWeek]
  );

  const selectionWeek = useMemo(() => {
    if (!liveWeekDeadlineMs) return liveWeek;
    if (nowMs < liveWeekDeadlineMs) return liveWeek;
    const idx = weeksSorted.indexOf(liveWeek);
    return weeksSorted[idx + 1] ?? liveWeek + 1;
  }, [nowMs, liveWeekDeadlineMs, liveWeek, weeksSorted]);

  const selectionDeadlineMs = useMemo(
    () => getWeekDeadlineMs(normalizedFixtures as any, selectionWeek),
    [normalizedFixtures, selectionWeek]
  );

  const tradeWindowOpen = useMemo(() => {
  if (!nowMs || !selectionDeadlineMs) return false;
  return nowMs < selectionDeadlineMs;
}, [nowMs, selectionDeadlineMs]);

  const waiverDeadlineMs = useMemo(() => {
    if (!selectionDeadlineMs) return 0;
    return selectionDeadlineMs - 24 * 60 * 60 * 1000; // 24h before selection deadline
  }, [selectionDeadlineMs]);

  const windowMode = useMemo<"WAIVERS" | "FREE_AGENCY">(() => {
  if (!nowMs || !waiverDeadlineMs || !selectionDeadlineMs) return "WAIVERS";
  return nowMs < waiverDeadlineMs ? "WAIVERS" : nowMs < selectionDeadlineMs ? "FREE_AGENCY" : "WAIVERS";
}, [nowMs, waiverDeadlineMs, selectionDeadlineMs]);

function nextWeekFrom(weeksSorted: number[], week: number) {
  const idx = weeksSorted.indexOf(week);
  if (idx >= 0 && idx < weeksSorted.length - 1) return weeksSorted[idx + 1];
  return week + 1;
}

// ✅ Claims week flips immediately once waiver deadline passes
const claimsWeek = useMemo(() => {
  if (!nowMs || !waiverDeadlineMs) return selectionWeek;
  if (nowMs < waiverDeadlineMs) return selectionWeek;
  return nextWeekFrom(weeksSorted, selectionWeek);
}, [nowMs, waiverDeadlineMs, selectionWeek, weeksSorted]);

  // Deadline text banner (shows next relevant deadline)
  const deadlineLabel = windowMode === "WAIVERS" ? "Waiver Deadline" : "Team Selection Deadline";
const deadlineText = useMemo(() => {
  if (!nowMs) return "—";
  const ms = windowMode === "WAIVERS" ? waiverDeadlineMs : selectionDeadlineMs;
  return ms ? formatDeadline(ms, userTz) : "TBC";
}, [nowMs, windowMode, waiverDeadlineMs, selectionDeadlineMs, userTz]);


  // -----------------------
  // Drop-lock cleanup (GUARDED to prevent render loops)
  // -----------------------


const hasExpiredDropLocks = useMemo(() => {
  if (!activeLeague?.id) return false;
  return (dropLocks as any[]).some(
    (l: any) => l.leagueId === activeLeague.id && l.lockedUntilMs <= nowMs
  );
}, [dropLocks, activeLeague?.id, nowMs]);

useEffect(() => {
  if (!activeLeague?.id) return;
  if (!hasExpiredDropLocks) return;

  (async () => {
    await fetch("/api/drop-locks/cleanup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leagueId: activeLeague.id, nowMs }),
    });

    await refreshTransactionsForLeague(activeLeague.id);
  })();
}, [activeLeague?.id, hasExpiredDropLocks, nowMs]);

  // Auto-decline pending trades at the live week selection deadline (one-time write)
useEffect(() => {
  if (!ENABLE_TRADES) return;
  if (typeof window === "undefined") return;
  if (!activeLeague?.id) return;
  if (!liveWeekDeadlineMs) return;
  if (nowMs < liveWeekDeadlineMs) return;

  const key = `tx_autodecline_${activeLeague.id}_wk${liveWeek}`;
  if (window.localStorage.getItem(key)) return;

  (async () => {
    await fetch(`/api/trades/decline-expired`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leagueId: activeLeague.id,
        deadlineMs: liveWeekDeadlineMs,
        reason: "Auto-declined at team selection deadline",
      }),
    });

    await refreshTransactionsForLeague(activeLeague.id);
    window.localStorage.setItem(key, "1");
  })();
}, [ENABLE_TRADES, activeLeague?.id, liveWeekDeadlineMs, nowMs, liveWeek]);

// Auto-process waivers globally (idempotent via DB guard)
useEffect(() => {
  if (!activeLeague?.id) return;
  if (!waiverDeadlineMs) return;
  if (nowMs < waiverDeadlineMs) return;

  (async () => {
    await fetch(`/api/waivers/process`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leagueId: activeLeague.id,
        week: liveWeek,
      }),
    });

    await refreshTransactionsForLeague(activeLeague.id);

    // refresh rosters
    const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(activeLeague.id)}`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.ok) {
      const next: Record<string, any> = {};
      for (const row of json.data ?? []) {
        if (!row?.team_id) continue;
        next[row.team_id] = row.data ?? {};
      }
      setLeagueRosters(next);
      setLeagueRostersLoaded(true);
    }
  })();
}, [activeLeague?.id, waiverDeadlineMs, nowMs, liveWeek]);

const [leagueRosters, setLeagueRosters] = useState<Record<string, any>>({});
const [leagueRostersLoaded, setLeagueRostersLoaded] = useState(false);
const [txLoaded, setTxLoaded] = useState(false);
const [txClaims, setTxClaims] = useState<any[]>([]);
const [txTrades, setTxTrades] = useState<any[]>([]);
const [txDropLocks, setTxDropLocks] = useState<any[]>([]);
const [txFreeAgents, setTxFreeAgents] = useState<any[]>([]);
const [waiverOrderLoaded, setWaiverOrderLoaded] = useState(false);
const [waiverOrderRows, setWaiverOrderRows] = useState<Array<{ teamId: string; rank: number }>>([]);

// ✅ single source of truth for ownership checks
const rostersForOwnership = useMemo(() => {
  // prefer server rosters when loaded, fallback to local draft store
  if (leagueRostersLoaded && leagueRosters && Object.keys(leagueRosters).length) return leagueRosters;
  return rosters ?? {};
}, [leagueRostersLoaded, leagueRosters, rosters]);

  // -----------------------
  // Ownership map (playerId -> ownerTeamId)
  // -----------------------
const ownerByPlayerId = useMemo(() => {
  const map = new Map<string, string>();
  const source = rostersForOwnership;

  for (const [teamId, roster] of Object.entries(source ?? {})) {
    const ids = extractRosterIdsClient(roster);
    for (const pid of ids) map.set(pid, teamId);
  }
  return map;
}, [rostersForOwnership]);

  const isPlayerOwned = (playerId: string) => ownerByPlayerId.has(playerId);

    // Drop lock set (grey out add)
  const lockedUnownedSet = useMemo(() => {
    const set = new Set<string>();

    const source = txLoaded ? txDropLocks : (dropLocks as any[]);

    for (const raw of source ?? []) {
      const leagueId = String(raw?.league_id ?? raw?.leagueId ?? "");
      const playerId = String(raw?.player_id ?? raw?.playerId ?? "");
      const lockedUntilMs = Number(raw?.locked_until_ms ?? raw?.lockedUntilMs ?? 0);

      if (leagueId !== String(activeLeague?.id ?? "")) continue;
      if (!playerId) continue;
      if (!lockedUntilMs || lockedUntilMs <= nowMs) continue;

      if (!isPlayerOwned(playerId)) {
        set.add(playerId);
      }
    }

    return set;
  }, [txLoaded, txDropLocks, dropLocks, activeLeague?.id, nowMs, ownerByPlayerId]);

  // -----------------------
  // Tabs + Modal
  // -----------------------
  const [tab, setTab] = useState<TabKey>("Player Pool");
  const [modalPlayer, setModalPlayer] = useState<
  (Player & { status?: any; weeklyStatus?: any }) | null
>(null);

// -----------------------
// Confirm Accept Trade Modal State
// -----------------------
const [confirmOpen, setConfirmOpen] = useState(false);
const [confirmTrade, setConfirmTrade] = useState<any | null>(null);

function openAcceptConfirm(trade: any) {
  // only allow confirming offers RECEIVED by you
  if (trade?.toTeamId !== yourDraftTeamId) return;

  setConfirmTrade(trade);
  setConfirmOpen(true);
}


useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
if (!leagueId) return;

  let cancelled = false;

  async function load() {
    try {
      setLeagueRostersLoaded(false);

      const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        console.warn("Failed to load league rosters", json?.error ?? res.statusText);
        if (!cancelled) {
          setLeagueRosters({});
          setLeagueRostersLoaded(true);
        }
        return;
      }

      // Expect rows like: [{ team_id, data, updated_at }, ...]
      const next: Record<string, any> = {};
      for (const row of json.data ?? []) {
        if (!row?.team_id) continue;
        next[row.team_id] = row.data ?? {};
      }

      if (!cancelled) {
        setLeagueRosters(next);
        setLeagueRostersLoaded(true);
      }
    } catch (e) {
      console.warn("Failed to load league rosters", e);
      if (!cancelled) {
        setLeagueRosters({});
        setLeagueRostersLoaded(true);
      }
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, [activeLeague?.id]);

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  let cancelled = false;

  (async () => {
    setWaiverOrderLoaded(false);

    try {
      const res = await fetch(
        `/api/waivers/order?leagueId=${encodeURIComponent(leagueId)}&week=${encodeURIComponent(String(selectionWeek))}`,
        { cache: "no-store" }
      );

      const json = await res.json().catch(() => null);
      if (cancelled) return;

      if (res.ok && json?.ok && Array.isArray(json.data)) {
        // json.data is [{ teamId, rank }, ...] sorted by rank ASC
        setWaiverOrderRows(
          (json.data ?? []).map((r: any) => ({
            teamId: String(r.teamId),
            rank: Number(r.rank),
          }))
        );
      } else {
        setWaiverOrderRows([]);
      }
    } catch {
      if (!cancelled) setWaiverOrderRows([]);
    } finally {
      if (!cancelled) setWaiverOrderLoaded(true);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeague?.id, selectionWeek]);

const waiverOrderIndexByTeamId = useMemo(() => {
  const m = new Map<string, number>();
  (waiverOrderRows ?? []).forEach((r) => m.set(String(r.teamId), Number(r.rank) - 1)); // rank 1 => index 0
  return m;
}, [waiverOrderRows]);

function closeConfirm() {
  setConfirmOpen(false);
  setConfirmTrade(null);
}

function confirmAcceptTrade() {
  if (!confirmTrade) return;

  // ✅ Change 2: enforce the window inside the confirm action (not just UI)
  if (!tradeWindowOpen) {
    closeConfirm();
    return;
  }


apiAcceptTrade(confirmTrade.id);
closeConfirm();
}


function ConfirmAcceptTradeModal() {
  if (!confirmOpen || !confirmTrade) return null;

  // helpers already exist in file: shortName(), jersey, etc.
  const offerIds: string[] = confirmTrade.offerPlayerIds ?? [];
  const requestIds: string[] = confirmTrade.requestPlayerIds ?? [];

  const offerPlayers = offerIds
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter(Boolean) as any[];

  const requestPlayers = requestIds
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter(Boolean) as any[];

  return (
    <div
      onClick={closeConfirm}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.72)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 18,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          color: "#0f172a",
        }}
      >
        <div style={{ padding: 12, background: "#0f172a", color: "white" }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>Confirm Trade</div>
          <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.9, marginTop: 2 }}>
            This will swap the selected players immediately.
          </div>
        </div>

        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>You receive</div>
          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
            {offerPlayers.length ? (
              offerPlayers.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <JerseyTile teamCode={p.teamCode} size={22} />
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{shortName(p)}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>—</div>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 900, marginTop: 12 }}>You send</div>
          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
            {requestPlayers.length ? (
              requestPlayers.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <JerseyTile teamCode={p.teamCode} size={22} />
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{shortName(p)}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.7 }}>—</div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            borderTop: "1px solid rgba(15,23,42,0.12)",
            background: "rgba(255,255,255,0.98)",
          }}
        >
          <button
            onClick={closeConfirm}
            style={{
              height: 38,
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
            onClick={confirmAcceptTrade}
            style={{
              height: 38,
              borderRadius: 12,
              border: "none",
              background: "rgba(34,197,94,0.95)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}



  // Prevent double-tap duplicate submissions (per-player short cooldown)
  const [addCooldownByPlayerId, setAddCooldownByPlayerId] = useState<Record<string, number>>({});

  function isAddCoolingDown(playerId: string) {
    const until = addCooldownByPlayerId[playerId] ?? 0;
    return Date.now() < until;
  }

  function guardedAdd(playerId: string, fn: () => void, cooldownMs = 450) {
    if (isAddCoolingDown(playerId)) return;

    setAddCooldownByPlayerId((prev) => ({
      ...prev,
      [playerId]: Date.now() + cooldownMs,
    }));

    try {
      fn();
    } finally {
      window.setTimeout(() => {
        setAddCooldownByPlayerId((prev) => {
          const next = { ...prev };
          if ((next[playerId] ?? 0) <= Date.now()) delete next[playerId];
          return next;
        });
      }, cooldownMs + 20);
    }
  }

  // -----------------------
  // Draft Room-style filters
  // -----------------------
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [posFilter, setPosFilter] = useState<string>("");
  const [ownerFilterValue, setOwnerFilterValue] = useState<string>("available");
useEffect(() => {
  // When entering Watchlist, default to All Players (only if still on the default "available")
  if (tab === "Watchlist" && ownerFilterValue === "available") {
    setOwnerFilterValue("all");
  }
}, [tab, ownerFilterValue]);

  type InfoMode =
  | "DRAFT_RANK"
  | "MATCH_AVG"
  | "TOTAL_PTS"
  | "FORM_3"
  | "LAST_SCORE"
  | "GAMES_PLAYED"
  | "TRIES"
  | "TRY_ASSISTS"
  | "LINEBREAKS"
  | "LINEBREAK_ASSISTS"
  | "DEFENDERS_BEATEN"
  | "METRES_GAINED"
  | "OFFLOADS"
  | "TACKLES"
  | "MISSED_TACKLES"
  | "TURNOVERS_FORCED"
  | "INTERCEPTIONS"
  | "KICKS_50_22"
  | "PENALTIES_CONCEDED"
  | "ERRORS"
  | "LINEOUTS_WON"
  | "LINEOUT_STEALS"
  | "LINEOUT_ERRORS"
  | "SCRUMS_WON"
  | "CONVERSIONS"
  | "PENALTY_GOALS"
  | "DROP_GOALS"
  | "YELLOW_CARDS"
  | "RED_CARDS";

const [infoMode, setInfoMode] = useState<InfoMode>("TOTAL_PTS");


    // =========================
  // Drop-select modal (Claim / Add)
  // =========================
  type TxProposeMode = "WAIVER" | "FREE_AGENCY";

    const [dropModalOpen, setDropModalOpen] = useState(false);
  const [proposeMode, setProposeMode] = useState<TxProposeMode>("WAIVER");
  const [proposedAddPlayer, setProposedAddPlayer] = useState<Player | null>(null);
  const [selectedDropPlayerId, setSelectedDropPlayerId] = useState<string | null>(null);
  const [submittingProposedTransaction, setSubmittingProposedTransaction] = useState(false);

  function fullTeamName(teamCode: string) {
  return teamLabel(teamCode);
}

  function teamLabel(teamCode: string) {
  const code = normalizeTeamCode(teamCode);

  // normal lookup
  const direct = TEAM_OPTIONS.find((t) => t.value === code)?.label;
  if (direct) return direct;

  // handle Moana code mismatch (MOA vs MOP)
  if (code === "MOA") return TEAM_OPTIONS.find((t) => t.value === "MOP")?.label ?? "Moana Pasifika";
  if (code === "MOP") return TEAM_OPTIONS.find((t) => t.value === "MOA")?.label ?? "Moana Pasifika";

  return code;
}

  function playerCanPlayPos(p: any, pos: string) {
    const a = String(p?.posAbbrev ?? "").toUpperCase();
    const b = String(p?.secondaryPosAbbrev ?? "").toUpperCase();
    return a === pos || b === pos;
  }

  // Required squad composition (non-wildcard slots only)
  // NOTE: This is the roster restriction check after a swap.
  const REQUIRED_POS_SLOTS: string[] = useMemo(() => {
    // 1 HO, 2 PR, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE, 3 OB = 15 fixed slots
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
  }, []);

  // Backtracking feasibility check: can these players fill all REQUIRED_POS_SLOTS?
  function canFillRequiredSlots(players: Player[]) {
    // Order required slots by "hardest first" (fewest candidates) for speed.
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

  // Your current roster players (unique by id)
const yourRosterPlayers: Player[] = useMemo(() => {
  if (!yourDraftTeamId) return [];
  const source = rostersForOwnership as any;
  const r: any = source?.[yourDraftTeamId];
  if (!r) return [];

  const ids = extractRosterIdsClient(r);
  const seen = new Set<string>();
  const list: Player[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const p = allPlayers.find((x) => x.id === id);
    if (p) list.push(p);
  }

  return list;
}, [rostersForOwnership, yourDraftTeamId, allPlayers]);

  // Given an addPlayer, compute droppable players that keep roster valid after swap
  const droppableCandidates: Player[] = useMemo(() => {
    if (!proposedAddPlayer) return [];
    const addP = proposedAddPlayer;

    // If roster is empty, there is nothing to drop
if (!yourRosterPlayers.length) return [];

// If roster is NOT full / not at least the fixed slots count, don't enforce restrictions.
// This prevents "no valid drop options" when the roster hasn't matured yet.
const FIXED_SLOT_COUNT = REQUIRED_POS_SLOTS.length; // 15
const rosterTooSmallForValidation = yourRosterPlayers.length < FIXED_SLOT_COUNT;

const candidates: Player[] = [];

for (const dropP of yourRosterPlayers) {
  if (rosterTooSmallForValidation) {
    candidates.push(dropP);
    continue;
  }

  const nextPlayers = yourRosterPlayers
    .filter((x) => x.id !== dropP.id)
    .concat([addP]);

  if (canFillRequiredSlots(nextPlayers)) candidates.push(dropP);
}

    // Sort droppable list for nicer UX (by pos)
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

candidates.sort((a, b) => {
  const pa = POSITION_ORDER[String(a.posAbbrev).toUpperCase()] ?? 99;
  const pb = POSITION_ORDER[String(b.posAbbrev).toUpperCase()] ?? 99;

  // Primary sort: position order
  if (pa !== pb) return pa - pb;

  // Secondary sort: name (stable, predictable)
  const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase();
  const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase();
  return an.localeCompare(bn);
});


    return candidates;
  }, [proposedAddPlayer, yourRosterPlayers]);

  function openDropModal(addPlayer: Player) {
    const mode: TxProposeMode = windowMode === "WAIVERS" ? "WAIVER" : "FREE_AGENCY";

    // ✅ Compute droppable list NOW (using addPlayer) so default selection is correct immediately
    const candidates: Player[] = [];
    for (const dropP of yourRosterPlayers) {
      const nextPlayers = yourRosterPlayers.filter((x) => x.id !== dropP.id).concat([addPlayer]);
      if (canFillRequiredSlots(nextPlayers)) candidates.push(dropP);
    }

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

candidates.sort((a, b) => {
  const pa = POSITION_ORDER[String(a.posAbbrev).toUpperCase()] ?? 99;
  const pb = POSITION_ORDER[String(b.posAbbrev).toUpperCase()] ?? 99;
  if (pa !== pb) return pa - pb;

  const an = `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim().toLowerCase();
  const bn = `${b.firstName ?? ""} ${b.lastName ?? ""}`.trim().toLowerCase();
  return an.localeCompare(bn);
});

setProposeMode(mode);
setProposedAddPlayer(addPlayer);

// ✅ Default selection: NONE (force user to choose)
setSelectedDropPlayerId(null);

setDropModalOpen(true);

  }


    function closeDropModal() {
    setDropModalOpen(false);
    setProposedAddPlayer(null);
    setSelectedDropPlayerId(null);
    setSubmittingProposedTransaction(false);
  }

async function refreshTransactionsForLeague(leagueId: string) {
  try {
    // 1) claims
    const claimsRes = await fetch(`/api/waivers/claims?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const claimsJson = await claimsRes.json().catch(() => null);

    // 2) trades
    const tradesRes = await fetch(`/api/trades/list?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const tradesJson = await tradesRes.json().catch(() => null);

    // 3) drop-locks
    const locksRes = await fetch(`/api/drop-locks?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const locksJson = await locksRes.json().catch(() => null);

    // 4) free agents
    const faRes = await fetch(`/api/free-agency/transfer?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const faJson = await faRes.json().catch(() => null);

    const normClaims =
      claimsRes.ok && claimsJson?.ok
        ? (claimsJson.data ?? []).map((c: any) => ({
            ...c,
            leagueId: c.league_id ?? c.leagueId,
            teamId: c.team_id ?? c.teamId,
            addPlayerId: c.add_player_id ?? c.addPlayerId,
            dropPlayerId: c.drop_player_id ?? c.dropPlayerId,
            createdAtMs: c.created_at_ms ?? c.createdAtMs,
            updatedAtMs: c.updated_at_ms ?? c.updatedAtMs,
            processedAtMs: c.processed_at_ms ?? c.processedAtMs,
            decidedAtMs: c.decided_at_ms ?? c.decidedAtMs,
          }))
        : [];

    const normTrades =
      tradesRes.ok && tradesJson?.ok
        ? (tradesJson.offers ?? tradesJson.data ?? []).map((t: any) => ({
            id: t.id,
            leagueId: t.league_id ?? t.leagueId,
            week: t.week,
            fromTeamId: t.from_team_id ?? t.fromTeamId,
            toTeamId: t.to_team_id ?? t.toTeamId,
            offerPlayerIds: t.offer_player_ids ?? t.offerPlayerIds ?? [],
            requestPlayerIds: t.request_player_ids ?? t.requestPlayerIds ?? [],
            note: t.note ?? "",
            status: t.status ?? "pending",
            createdAtMs: t.createdAtMs ?? (t.created_at ? toMs(t.created_at) : 0),
            updatedAtMs: t.updatedAtMs ?? (t.updated_at ? toMs(t.updated_at) : 0),
            acceptedAtMs: t.acceptedAtMs ?? (t.accepted_at ? toMs(t.accepted_at) : null),
            decidedAtMs: t.decidedAtMs ?? (t.decided_at ? toMs(t.decided_at) : null),
          }))
        : [];

    const normFA =
      faRes.ok && faJson?.ok
        ? (faJson.data ?? []).map((x: any) => ({
            ...x,
            leagueId: x.league_id ?? x.leagueId,
            teamId: x.team_id ?? x.teamId,
            addPlayerId: x.add_player_id ?? x.addPlayerId,
            dropPlayerId: x.drop_player_id ?? x.dropPlayerId,
            createdAtMs: x.created_at_ms ?? x.createdAtMs,
            updatedAtMs: x.updated_at_ms ?? x.updatedAtMs,
          }))
        : [];

    setTxClaims(normClaims);
    setTxTrades(normTrades);
    setTxDropLocks(locksRes.ok && locksJson?.ok ? (locksJson.data ?? []) : []);
    setTxFreeAgents(normFA);
  } catch (err) {
    console.warn("[transactions] refreshTransactionsForLeague failed:", err);

    // failsafe: don't leave the UI stuck
    setTxClaims([]);
    setTxTrades([]);
    setTxDropLocks([]);
    setTxFreeAgents([]);
  } finally {
    // ✅ the “one extra failsafe code”
    setTxLoaded(true);
  }
}

async function apiAcceptTrade(tradeId: string) {
  if (!activeLeague?.id) return;

  await fetch(`/api/trades/accept`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tradeOfferId: tradeId,
  }),
});

  await refreshTransactionsForLeague(activeLeague.id);

  // refresh rosters too (ownership changes)
  const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(activeLeague.id)}`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);

  if (res.ok && json?.ok) {
    const next: Record<string, any> = {};
    for (const row of json.data ?? []) {
      if (row?.team_id) next[row.team_id] = row.data ?? {};
    }
    setLeagueRosters(next);
    setLeagueRostersLoaded(true);
  }
}

async function apiDeclineTrade(tradeId: string) {
  if (!activeLeague?.id) return;

  await fetch(`/api/trades/decline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leagueId: activeLeague.id,
      tradeId,
      reason: "Declined",
      decidedAtMs: Date.now(),
    }),
  });

  await refreshTransactionsForLeague(activeLeague.id);
}

async function apiCancelTrade(tradeId: string) {
  if (!activeLeague?.id) return;

  await fetch(`/api/trades/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leagueId: activeLeague.id,
      tradeId,
      cancelledAtMs: Date.now(),
    }),
  });

  await refreshTransactionsForLeague(activeLeague.id);
}

useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;
  refreshTransactionsForLeague(leagueId);
}, [activeLeague?.id]);

async function submitProposedTransaction() {
  if (submittingProposedTransaction) return;
  if (!activeLeague?.id || !yourDraftTeamId || !proposedAddPlayer) return;
  if (!selectedDropPlayerId) return;

  const leagueId = activeLeague.id;
  setSubmittingProposedTransaction(true);

  try {
    // ----------------
    // WAIVERS => POST claim, refresh tx, go to Pending Claims
    // ----------------
    if (proposeMode === "WAIVER") {
      const payload = {
        leagueId,
        week: claimsWeek,
        teamId: yourDraftTeamId,
        addPlayerId: proposedAddPlayer.id,
        dropPlayerId: selectedDropPlayerId,
      };

      await fetch(`/api/waivers/claims`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      await refreshTransactionsForLeague(leagueId);
      setTab("Pending Claims");
      closeDropModal();
      return;
    }

    // ----------------
    // FREE AGENCY => POST transfer, then refresh tx + rosters
    // ----------------
    const payload = {
      leagueId,
      week: selectionWeek,
      teamId: yourDraftTeamId,
      addPlayerId: proposedAddPlayer.id,
      dropPlayerId: selectedDropPlayerId,
      createdAtMs: Date.now(),
      lockedUntilMs: selectionDeadlineMs,
    };

    await fetch(`/api/free-agency/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Refresh transactions
    await refreshTransactionsForLeague(leagueId);

    // Refresh rosters so ownership updates immediately
    const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.ok) {
      const next: Record<string, any> = {};
      for (const row of json.data ?? []) {
        if (!row?.team_id) continue;
        next[row.team_id] = row.data ?? {};
      }
      setLeagueRosters(next);
      setLeagueRostersLoaded(true);
    }

    closeDropModal();
  } catch (e) {
    console.warn("submitProposedTransaction failed", e);
    setSubmittingProposedTransaction(false);
  }
}

  

    function DropSelectModal() {
    if (!dropModalOpen || !proposedAddPlayer) return null;

    const confirmBg = proposeMode === "WAIVER" ? "#FACC15" : "#22C55E";
    const confirmText = submittingProposedTransaction
      ? "Processing..."
      : proposeMode === "WAIVER"
        ? "Submit Claim"
        : "Confirm";

    const confirmFg = proposeMode === "WAIVER" ? "#0f172a" : "white";

    const canConfirm = !!selectedDropPlayerId && !submittingProposedTransaction;

    return (
            <div
  onClick={() => {
    if (submittingProposedTransaction) return;
    closeDropModal();
  }}
  style={{
    position: "fixed",
    inset: 0,
    zIndex: 80,
    background: "rgba(0,0,0,0.72)", // darker overlay
    display: "grid",
    placeItems: "center",
    padding: 18,
  }}
>

        <div
  onClick={(e) => e.stopPropagation()}
  style={{
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    overflow: "hidden",
    background: "#FFFFFF", // solid
    boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
    maxHeight: "78vh",
    display: "flex",
    flexDirection: "column",
    color: "#0f172a", // force readable text inside
  }}
>

{/* Top: signing */}
<div style={{ borderBottom: "1px solid rgba(15,23,42,0.12)" }}>
  {/* Dark label bar */}
  <div
    style={{
      padding: "10px 12px",
      background: "#0f172a",
      color: "white",
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.95 }}>
      You have requested to sign:
    </div>
  </div>

  {/* Light player row */}
  <div
    style={{
      padding: "12px 12px",
      background: "#FFFFFF",
      color: "#0f172a",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 10,
        alignItems: "center",
      }}
    >
      <JerseyTile teamCode={proposedAddPlayer.teamCode} size={30} />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 900,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {proposedAddPlayer.firstName?.[0]}. {proposedAddPlayer.lastName}
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.9 }}>
          {fullTeamName(proposedAddPlayer.teamCode)} — {proposedAddPlayer.posName}
{proposedAddPlayer.secondaryPosName ? ` / ${proposedAddPlayer.secondaryPosName}` : ""}

        </div>
      </div>
    </div>
  </div>
</div>

<style>{`
  .drop-scroll::-webkit-scrollbar { display: none; }
`}</style>

          {/* Middle: drop list (scrollable) */}
          <div
  style={{
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "#0f172a",
    color: "white",
  }}
>
  <div style={{ fontSize: 12, fontWeight: 900 }}>
    Which player would you like to replace?
  </div>
</div>


<div
  className="drop-scroll"
  style={{
    flex: 1,
    overflowY: "auto",
    scrollbarWidth: "none", // Firefox
    msOverflowStyle: "none", // IE/Edge legacy
  }}
>


            {droppableCandidates.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, fontWeight: 800, opacity: 0.75 }}>
                No valid drop options found (position restrictions).
              </div>
            ) : (
              droppableCandidates.map((p) => {
                const selected = selectedDropPlayerId === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: "10px 12px",
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      display: "grid",
                      gridTemplateColumns: "34px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      background: selected ? "rgba(239,68,68,0.12)" : "transparent",

                    }}
                  >
                    <JerseyTile teamCode={p.teamCode} size={28} />

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.firstName?.[0]}. {p.lastName}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.7 }}>
                        {fullTeamName(p.teamCode)} — {p.posName}
{p.secondaryPosName ? ` / ${p.secondaryPosName}` : ""}

                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedDropPlayerId(p.id)}
                      aria-label="Select to drop"
                      style={{
                        width: selected ? 86 : 32,     // wider when selected
                        
                        height: 32,
                        borderRadius: 10,
                        border: "none",
                        background: selected ? "rgba(239,68,68,0.92)" : "rgba(239,68,68,0.85)",
                        color: "white",
                        fontWeight: 900,
                        fontSize: selected ? 11 : 20, // smaller text for “Dropping”
                        cursor: "pointer",
                        lineHeight: "32px",
                        padding: 0,
    textAlign: "center",
                      }}
                    >
                      {selected ? "Dropping" : "−"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom: actions (always visible) */}
          <div
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              background: "rgba(255,255,255,0.98)",
              borderTop: "1px solid rgba(0,0,0,0.10)",
            }}
          >
                        <button
              disabled={submittingProposedTransaction}
              onClick={() => {
                if (submittingProposedTransaction) return;
                closeDropModal();
              }}
              style={{
                height: 38,
                borderRadius: 12,
                border: "2px solid rgba(239,68,68,0.9)",
                background: "transparent",
                color: "rgba(239,68,68,0.95)",
                fontWeight: 900,
                cursor: submittingProposedTransaction ? "not-allowed" : "pointer",
                opacity: submittingProposedTransaction ? 0.55 : 1,
              }}
            >
              Cancel
            </button>

                        <button
              disabled={!canConfirm}
              onClick={submitProposedTransaction}
              style={{
                height: 38,
                borderRadius: 12,
                border: "none",
                background: canConfirm ? confirmBg : "rgba(0,0,0,0.20)",
                color: canConfirm ? confirmFg : "rgba(255,255,255,0.75)",
                fontWeight: 900,
                cursor: canConfirm ? "pointer" : "not-allowed",
                opacity: submittingProposedTransaction ? 0.9 : 1,
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }

function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerGetsScrumPoints(p: Player): boolean {
  const a = String(p.posAbbrev ?? "").trim().toUpperCase();
  const b = String(p.secondaryPosAbbrev ?? "").trim().toUpperCase();
  return a === "PR" || a === "HO" || b === "PR" || b === "HO";
}

// =========================
// SCORING (raw stat counts -> fantasy points)
// =========================
const SCORING = {
  // minutes
  min_1_to_60: 1,
  min_61_plus: 2,

  // attack
  try: 15,
  tryAssist: 9,
  linebreak: 7,
  linebreakAssist: 5,
  defendersBeaten: 2,
  metresPerPoint: 10, // 1 point per 10 metres
  offload: 2,

  // defence / playmaking
  tackle: 1,
  missedTackle: -1,
  turnoverForced: 4,
  interception: 5,
  kick5022: 10,

  // discipline / errors
  penaltyConceded: -1,
  error: -1,

  // set piece
  lineoutWon: 1,
  lineoutSteal: 5,
  lineoutError: -2,
  scrumWon: 3, // front row only

  // kicking
  conversion: 2,
  conversionMiss: -1,
  penaltyGoal: 3,
  penaltyMiss: -1,
  dropGoal: 3,
  dropGoalMiss: -1,

  // cards
  yellow: -5,
  red: -10,
};

function getRoundPointsFromRow(row: any, p: Player): number | null {
  if (!row) return null;

  const minutes = getRowNumber(row, "Minutes played");
  if (!minutes) return null; // not played

  let total = 0;

  // minutes
  if (minutes > 0 && minutes < 61) total += SCORING.min_1_to_60;
  if (minutes >= 61) total += SCORING.min_61_plus;

  // attack
  total += getRowNumber(row, "Tries") * SCORING.try;
  total += getRowNumber(row, "Try Assists") * SCORING.tryAssist;
  total += getRowNumber(row, "Linebreaks") * SCORING.linebreak;
  total += getRowNumber(row, "Linebreak assists") * SCORING.linebreakAssist;
  total += getRowNumber(row, "Defenders beaten") * SCORING.defendersBeaten;
  total += Math.floor(getRowNumber(row, "Carries (m)") / SCORING.metresPerPoint);
  total += getRowNumber(row, "Offloads") * SCORING.offload;

  // defence / playmaking
  total += getRowNumber(row, "Tackles") * SCORING.tackle;
  total += getRowNumber(row, "Missed tackles") * SCORING.missedTackle;
  total += getRowNumber(row, "Turnover Forced") * SCORING.turnoverForced;
  total += getRowNumber(row, "Interceptions") * SCORING.interception;
  total += getRowNumber(row, "50:22 Kicks") * SCORING.kick5022;

  // discipline / errors
  total += getRowNumber(row, "Penalties Conceded") * SCORING.penaltyConceded;
  total += getRowNumber(row, "Errors") * SCORING.error;

  // set piece
  total += getRowNumber(row, "Lineouts won") * SCORING.lineoutWon;
  total += getRowNumber(row, "Lineout steals") * SCORING.lineoutSteal;
  total += getRowNumber(row, "Lineout errors") * SCORING.lineoutError;

  if (playerGetsScrumPoints(p)) {
    total += getRowNumber(row, "Scrums won outright") * SCORING.scrumWon;
  }

  // kicking
  total += getRowNumber(row, "Conversions") * SCORING.conversion;
  total += getRowNumber(row, "Conversions missed") * SCORING.conversionMiss;
  total += getRowNumber(row, "Penalty scored") * SCORING.penaltyGoal;
  total += getRowNumber(row, "Penalty missed") * SCORING.penaltyMiss;
  total += getRowNumber(row, "Drop goal scored") * SCORING.dropGoal;
  total += getRowNumber(row, "Drop goal missed") * SCORING.dropGoalMiss;

  // cards
  total += getRowNumber(row, "Yellow cards") * SCORING.yellow;
  total += getRowNumber(row, "Red cards") * SCORING.red;

  return Number.isFinite(total) ? total : null;
}


// Find rows belonging to this player.
// We check a wider set of possible ID column names.
function getPlayerRounds(playerId: string) {
  const want = normaliseId(playerId);

  const idKeys = [
    "playerId",
    "player_id",
    "playerID",
    "id",
    "player", // sometimes sheets use this for ID
  ];

  return (roundRows ?? []).filter((r: any) => {
    if (!r) return false;

    // try likely keys
    for (const k of idKeys) {
      if (r[k] != null && normaliseId(r[k]) === want) return true;
    }

    // fallback: any key that “looks like” a player id field
    const ks = Object.keys(r);
    const maybe = ks.find((kk) => String(kk).toLowerCase().includes("player") && String(kk).toLowerCase().includes("id"));
    if (maybe && r[maybe] != null && normaliseId(r[maybe]) === want) return true;

    return false;
  });
}

function getTotalPoints(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
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

function getMatchesPlayed(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  // Count only rounds that actually have a points value
  const played = rounds.reduce((acc: number, r: any) => acc + (getRoundPointsFromRow(r, p) != null ? 1 : 0), 0);
  return played || null;
}

function getAvgPPG(p: Player): number | null {
  const tot = getTotalPoints(p);
  const gp = getMatchesPlayed(p);
  if (tot != null && gp != null && gp > 0) return tot / gp;
  return null;
}

// Return numeric value from a row by header (case-insensitive); missing => 0
function getRowNumber(row: any, header: string): number {
  if (!row) return 0;

  // direct
  if (row[header] != null) {
    const n = toNum(row[header]);
    return n != null ? n : 0;
  }

  // case-insensitive match
  const keys = Object.keys(row);
  const found = keys.find((k) => String(k).trim().toLowerCase() === header.trim().toLowerCase());
  if (found && row[found] != null) {
    const n = toNum(row[found]);
    return n != null ? n : 0;
  }

  return 0;
}


function getMetresGainedTotal(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  let totalMetres = 0;
  let any = false;

  for (const r of rounds) {
    const metres = getRowNumber(r, "Carries (m)");
    if (metres === 0) continue;
    totalMetres += metres;
    any = true;
  }

  return any ? totalMetres : null;
}


// Player "Form" = average total score over last 3 PLAYED rounds (most recent by round number)
function getFormLast3Avg(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  // keep only played rows (where getRoundPointsFromRow returns a number)
  const played = rounds
  .map((r: any) => ({ r, pts: getRoundPointsFromRow(r, p) }))
  .filter((x: any) => typeof x.pts === "number");

  if (!played.length) return null;

  // sort by round ascending (sheet has "round")
  played.sort((a: any, b: any) => (toNum(a.r?.round) ?? 0) - (toNum(b.r?.round) ?? 0));

  const last3 = played.slice(-3);
  const sum = last3.reduce((acc: number, x: any) => acc + (x.pts as number), 0);
  return sum / last3.length;
}

// Most recent score = points from latest PLAYED round
function getLastRoundPoints(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  const played = rounds
  .map((r: any) => ({ r, pts: getRoundPointsFromRow(r, p) }))
  .filter((x: any) => typeof x.pts === "number");

  if (!played.length) return null;

  // sort by round ascending (sheet column "round")
  played.sort((a: any, b: any) => (toNum(a.r?.round) ?? 0) - (toNum(b.r?.round) ?? 0));

  const last = played[played.length - 1];
  return typeof last?.pts === "number" ? last.pts : null;
}

function getStatTotalCount(p: Player, header: string): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  let total = 0;
  let any = false;

  for (const r of rounds) {
    const v = getRowNumber(r, header);
    total += v;
    any = true;
  }

  return any ? total : null;
}


  function metricLabel(mode: InfoMode) {
  switch (mode) {
    case "DRAFT_RANK": return "Draft Rk";
    case "MATCH_AVG": return "Match Avg";
    case "TOTAL_PTS": return "Total Pts";
    case "FORM_3": return "Form";
    case "LAST_SCORE": return "Last";
    case "GAMES_PLAYED": return "Games";

    case "TRIES": return "Tries";
    case "TRY_ASSISTS": return "Try Assists";
    case "LINEBREAKS": return "Line Breaks";
    case "LINEBREAK_ASSISTS": return "Line Break Asts";
    case "DEFENDERS_BEATEN": return "Defenders Beaten";
    case "METRES_GAINED": return "Metres";
    case "OFFLOADS": return "Offloads";
    case "TACKLES": return "Tackles";
    case "MISSED_TACKLES": return "Missed Tackles";
    case "TURNOVERS_FORCED": return "Turnovers";
    case "INTERCEPTIONS": return "Interceptions";
    case "KICKS_50_22": return "50:22s";
    case "PENALTIES_CONCEDED": return "Penalties";
    case "ERRORS": return "Errors";
    case "LINEOUTS_WON": return "Lineouts Won";
    case "LINEOUT_STEALS": return "Lineout Steals";
    case "LINEOUT_ERRORS": return "Lineout Errors";
    case "SCRUMS_WON": return "Scrums Won";
    case "CONVERSIONS": return "Conversions";
    case "PENALTY_GOALS": return "Penalty Goals";
    case "DROP_GOALS": return "Drop Goals";
    case "YELLOW_CARDS": return "Yellow Cards";
    case "RED_CARDS": return "Red Cards";
    default: return "—";
  }
}


  function metricValue(p: Player, mode: InfoMode): string {
  // Basic score-derived stats
  if (mode === "DRAFT_RANK") return typeof p.draftRank === "number" ? String(p.draftRank) : "-";

  if (mode === "MATCH_AVG") {
    const v = getAvgPPG(p);
    return typeof v === "number" ? v.toFixed(1) : "-";
  }

  if (mode === "TOTAL_PTS") {
    const t = getTotalPoints(p);
    return typeof t === "number" ? String(Math.round(t)) : "-";
  }

  if (mode === "FORM_3") {
    const f = getFormLast3Avg(p);
    return typeof f === "number" ? f.toFixed(1) : "-";
  }

  if (mode === "LAST_SCORE") {
  const v = getLastRoundPoints(p);
  return typeof v === "number" ? String(Math.round(v)) : "-";
}

  if (mode === "GAMES_PLAYED") {
    const gp = getMatchesPlayed(p);
    return typeof gp === "number" ? String(gp) : "-";
  }

  // Stat totals shown as COUNTS (convert points -> count)
  const stat = (header: string) => getStatTotalCount(p, header);

  switch (mode) {
    case "TRIES": {
  const v = stat("Tries");
  return v == null ? "-" : String(v);
}
case "TRY_ASSISTS": {
  const v = stat("Try Assists");
  return v == null ? "-" : String(v);
}
case "LINEBREAKS": {
  const v = stat("Linebreaks");
  return v == null ? "-" : String(v);
}
case "LINEBREAK_ASSISTS": {
  const v = stat("Linebreak assists");
  return v == null ? "-" : String(v);
}
case "DEFENDERS_BEATEN": {
  const v = stat("Defenders beaten");
  return v == null ? "-" : String(v);
}

    case "METRES_GAINED": {
  const m = getMetresGainedTotal(p);
  return typeof m === "number" ? String(Math.round(m)) : "-";
}

case "OFFLOADS": {
  const v = stat("Offloads");
  return v == null ? "-" : String(v);
}
case "TACKLES": {
  const v = stat("Tackles");
  return v == null ? "-" : String(v);
}
case "MISSED_TACKLES": {
  const v = stat("Missed tackles");
  return v == null ? "-" : String(v);
}
case "TURNOVERS_FORCED": {
  const v = stat("Turnover Forced");
  return v == null ? "-" : String(v);
}
case "INTERCEPTIONS": {
  const v = stat("Interceptions");
  return v == null ? "-" : String(v);
}
case "KICKS_50_22": {
  const v = stat("50:22 Kicks");
  return v == null ? "-" : String(v);
}
case "PENALTIES_CONCEDED": {
  const v = stat("Penalties Conceded");
  return v == null ? "-" : String(v);
}
case "ERRORS": {
  const v = stat("Errors");
  return v == null ? "-" : String(v);
}

case "LINEOUTS_WON": {
  const v = stat("Lineouts won");
  return v == null ? "-" : String(v);
}
case "LINEOUT_STEALS": {
  const v = stat("Lineout steals");
  return v == null ? "-" : String(v);
}
case "LINEOUT_ERRORS": {
  const v = stat("Lineout errors");
  return v == null ? "-" : String(v);
}
case "SCRUMS_WON": {
  const v = playerGetsScrumPoints(p) ? stat("Scrums won outright") : 0;
  return v == null ? "-" : String(v);
}
case "CONVERSIONS": {
  const v = stat("Conversions");
  return v == null ? "-" : String(v);
}
case "PENALTY_GOALS": {
  const v = stat("Penalty scored");
  return v == null ? "-" : String(v);
}
case "DROP_GOALS": {
  const v = stat("Drop goal scored");
  return v == null ? "-" : String(v);
}
case "YELLOW_CARDS": {
  const v = stat("Yellow cards");
  return v == null ? "-" : String(v);
}
case "RED_CARDS": {
  const v = stat("Red cards");
  return v == null ? "-" : String(v);
}

    default:
      return "-";
  }
}

function ownerTeamLabelForPlayerId(playerId: string): string {
  const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;

  if (!ownerTeamId) return "Available";

  // Prefer activeLeague teams (these are the league team names you want displayed)
  const leagueTeam = activeLeague?.teams?.find((t: any) => t.id === ownerTeamId);
  if (leagueTeam?.name) return leagueTeam.name;

  // Fallback: draftTeams
  const draftTeam = draftTeams?.find((t: any) => t.id === ownerTeamId);
  if (draftTeam?.name) return draftTeam.name;

  return "Owned";
}

function metricSortValue(p: Player, mode: InfoMode): number | null {
  if (mode === "DRAFT_RANK") return typeof p.draftRank === "number" ? p.draftRank : null;

  if (mode === "MATCH_AVG") return getAvgPPG(p);
  if (mode === "TOTAL_PTS") return getTotalPoints(p);
  if (mode === "FORM_3") return getFormLast3Avg(p);
  if (mode === "LAST_SCORE") return getLastRoundPoints(p);
  if (mode === "GAMES_PLAYED") return getMatchesPlayed(p);

  // stat totals as counts (points -> count)
  const stat = (header: string) => getStatTotalCount(p, header);

  switch (mode) {
    case "TRIES": return stat("Tries");
case "TRY_ASSISTS": return stat("Try Assists");
case "LINEBREAKS": return stat("Linebreaks");
case "LINEBREAK_ASSISTS": return stat("Linebreak assists");
case "DEFENDERS_BEATEN": return stat("Defenders beaten");
case "METRES_GAINED": return getMetresGainedTotal(p);
case "OFFLOADS": return stat("Offloads");
case "TACKLES": return stat("Tackles");
case "MISSED_TACKLES": return stat("Missed tackles");
case "TURNOVERS_FORCED": return stat("Turnover Forced");
case "INTERCEPTIONS": return stat("Interceptions");
case "KICKS_50_22": return stat("50:22 Kicks");
case "PENALTIES_CONCEDED": return stat("Penalties Conceded");
case "ERRORS": return stat("Errors");
case "LINEOUTS_WON": return stat("Lineouts won");
case "LINEOUT_STEALS": return stat("Lineout steals");
case "LINEOUT_ERRORS": return stat("Lineout errors");
case "SCRUMS_WON": return playerGetsScrumPoints(p) ? stat("Scrums won outright") : 0;
case "CONVERSIONS": return stat("Conversions");
case "PENALTY_GOALS": return stat("Penalty scored");
case "DROP_GOALS": return stat("Drop goal scored");
case "YELLOW_CARDS": return stat("Yellow cards");
case "RED_CARDS": return stat("Red cards");
    default:
      return null;
  }
}



  // =========================
// DEV MOCKS (hoisted so badge + tab both see them)
// =========================
const DEV_MOCK_TX = false; // <- set false to remove all examples instantly

const leagueIdForMock = activeLeague?.id ?? "";
const yourIdForMock = yourDraftTeamId ?? "";

const { mockTrades, mockClaims, mockFreeAgents } = useMemo(() => {
  if (!DEV_MOCK_TX) return { mockTrades: [], mockClaims: [], mockFreeAgents: [] };

  const teams = activeLeague?.teams ?? [];
  const yourTeam = teams.find((t: any) => t.id === yourIdForMock) ?? teams[0] ?? null;

  const otherTeams = teams.filter((t: any) => t.id !== yourIdForMock);
  const otherA = otherTeams[0] ?? null;
  const otherB = otherTeams[1] ?? otherTeams[0] ?? null;

  const p0 = allPlayers[0] ?? null;
  const p1 = allPlayers[1] ?? null;
  const p2 = allPlayers[2] ?? null;
  const p3 = allPlayers[3] ?? null;
  const p4 = allPlayers[4] ?? null;
  const p5 = allPlayers[5] ?? null;

  const now = Date.now();

  // --- Trades ---
  const tradesOut: any[] = [];

  // 1) Offer RECEIVED (from otherA -> you)
  if (otherA && yourTeam && p0 && p1) {
    tradesOut.push({
      id: "mock_trade_received_1",
      leagueId: leagueIdForMock,
      status: "PENDING",
      fromTeamId: otherA.id,
      toTeamId: yourIdForMock,
      offerPlayerIds: [p0.id],
      requestPlayerIds: [p1.id],
      createdAtMs: now - 1000 * 60 * 12,
      updatedAtMs: now - 1000 * 60 * 12,
    });
  }

  // 2) Offer SENT (from you -> otherB)
  if (otherB && yourTeam && p2 && p3) {
    tradesOut.push({
      id: "mock_trade_sent_1",
      leagueId: leagueIdForMock,
      status: "PENDING",
      fromTeamId: yourIdForMock,
      toTeamId: otherB.id,
      offerPlayerIds: [p2.id],
      requestPlayerIds: [p3.id],
      createdAtMs: now - 1000 * 60 * 35,
      updatedAtMs: now - 1000 * 60 * 35,
    });
  }

  // 3) COMPLETED trade (ACCEPTED)
  if (otherA && otherB && p4 && p5) {
    tradesOut.push({
      id: "mock_trade_accepted_1",
      leagueId: leagueIdForMock,
      status: "ACCEPTED",
      fromTeamId: otherA.id,
      toTeamId: otherB.id,
      offerPlayerIds: [p4.id],
      requestPlayerIds: [p5.id],
      createdAtMs: now - 1000 * 60 * 60 * 20,
      acceptedAtMs: now - 1000 * 60 * 60 * 2,
      updatedAtMs: now - 1000 * 60 * 60 * 2,
    });
  }

  // --- Waiver claims feed (your existing mock claims logic) ---
  // (Paste your exact claimsOut code here unchanged)
  const claimsOut: any[] = [];
  // ... keep the exact code you already had ...

  // --- Free agent transfers feed ---
  const freeOut: any[] = [];
  if (yourTeam && p0 && p2) {
    freeOut.push({
      id: "mock_free_1",
      leagueId: leagueIdForMock,
      week: selectionWeek,
      teamId: yourIdForMock,
      addPlayerId: p0.id,
      dropPlayerId: p2.id,
      status: "PROCESSED",
      createdAtMs: now - 1000 * 60 * 18,
      updatedAtMs: now - 1000 * 60 * 18,
    });
  }

  return { mockTrades: tradesOut, mockClaims: claimsOut, mockFreeAgents: freeOut };
}, [DEV_MOCK_TX, activeLeague?.teams, yourIdForMock, leagueIdForMock, allPlayers, selectionWeek]);

// ✅ arrays the UI should use (badge + tab)
const tradesSource = txLoaded ? txTrades : (trades as any[]);
const claimsSource = txLoaded ? txClaims : (claims as any[]);
const dropLocksSource = txLoaded ? txDropLocks : (dropLocks as any[]);
const freeAgentsSource = txLoaded ? txFreeAgents : (freeAgentTransfers as any[]);

// ✅ arrays the UI should use (badge + tab)
const tradesForUi = DEV_MOCK_TX ? [...mockTrades, ...tradesSource] : tradesSource;
const claimsForUi = DEV_MOCK_TX ? [...mockClaims, ...claimsSource] : claimsSource;
const freeForUi = DEV_MOCK_TX ? [...mockFreeAgents, ...freeAgentsSource] : freeAgentsSource;

  // ✅ Badge count: pending trade offers RECEIVED by you (league mates -> you)
const pendingOffersCount = useMemo(() => {
  const leagueId = activeLeague?.id;
  const yourId = yourDraftTeamId;
  if (!leagueId || !yourId) return 0;

  return (tradesForUi as any[])
    .filter((t) => t.leagueId === leagueId)
    .filter((t) => String(t.status ?? "").toLowerCase() === "pending")
    .filter((t) => t.toTeamId === yourId)
    .length;
}, [tradesForUi, activeLeague?.id, yourDraftTeamId]);

  // Like Draft Room: show AVAILABLE (unowned) players, then apply filters.
  const baseOwnerList = useMemo(() => {
    // available
    if (ownerFilterValue === "available") {
      return allPlayers.filter((p) => !isPlayerOwned(p.id));
    }

    // all
    if (ownerFilterValue === "all") {
      return allPlayers;
    }

    // team:<id>
    if (ownerFilterValue.startsWith("team:")) {
      const teamId = ownerFilterValue.slice("team:".length);
      return allPlayers.filter((p) => ownerByPlayerId.get(p.id) === teamId);
    }

    return allPlayers.filter((p) => !isPlayerOwned(p.id));
  }, [allPlayers, ownerFilterValue, ownerByPlayerId]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return baseOwnerList
      .filter((p) => (q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true))
      .filter((p) => (teamFilter ? p.teamCode === teamFilter : true))
      .filter((p) => {
        if (!posFilter) return true;
        const a = (p.posAbbrev ?? "").toUpperCase();
        const b = (p.secondaryPosAbbrev ?? "").toUpperCase();
        return a === posFilter || b === posFilter;
      })
      .sort((a, b) => {
  const av = metricSortValue(a as any, infoMode);
  const bv = metricSortValue(b as any, infoMode);

  // Draft rank: lowest first (1 at top)
  if (infoMode === "DRAFT_RANK") {
    return (av ?? 9999) - (bv ?? 9999);
  }

  // Everything else: highest first
  return (bv ?? -Infinity) - (av ?? -Infinity);
});

  }, [baseOwnerList, search, teamFilter, posFilter, infoMode]);

  const ownerFilterOptions = useMemo(() => {
    const opts: Array<{ label: string; value: string }> = [];
    opts.push({ label: "Available Players", value: "available" });
    opts.push({ label: "All Players", value: "all" });

    const teams = activeLeague?.teams ?? [];
    for (const t of teams) {
      opts.push({ label: t.name, value: `team:${t.id}` });
    }
    return opts;
  }, [activeLeague?.teams]);

  const playerPoolPlayers = filteredPlayers;

  const watchlistPlayers = useMemo(() => {
    return filteredPlayers.filter((p) => !!(watchlist as any)[p.id]);
  }, [filteredPlayers, watchlist]);

  // Claims for your team + selectionWeek
const yourClaims = useMemo(() => {
  if (!activeLeague?.id || !yourDraftTeamId) return [];

  const list = txLoaded ? txClaims : (claims as any[]);
return list
  .filter((c) => c.leagueId === activeLeague.id && c.week === claimsWeek && c.teamId === yourDraftTeamId)
  .filter((c) => {
    const s = String(c.status ?? "PENDING").toUpperCase();
    return s === "PENDING";
  })
    .slice()
    .sort((a, b) => {
      const ap = typeof a.priority === "number" ? a.priority : 9999;
      const bp = typeof b.priority === "number" ? b.priority : 9999;
      if (ap !== bp) return ap - bp;
      return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    });
}, [claims, txClaims, txLoaded, activeLeague?.id, claimsWeek, yourDraftTeamId]);




  // -----------------------
  // UI styles (match your vibe + Draft Room list styling)
  // -----------------------
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const tabBarStyle: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    height: 30,
    border: "none",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  });

  const listBox: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    color: "#0f172a",
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

  function Tabs() {
  const tabs: TabKey[] = ["Player Pool", "Watchlist", "Pending Claims", "Transactions"];

  const badgeStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    padding: "0 5px",
    borderRadius: 999,
    background: "#EF4444",
    color: "white",
    fontSize: 10,
    fontWeight: 900,
    display: "grid",
    placeItems: "center",
    lineHeight: "16px",
    boxShadow: "0 6px 14px rgba(0,0,0,0.20)",
  };

  return (
    <div style={tabBarStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {tabs.map((t) => {
          const isActive = t === tab;
          const showBadge = t === "Transactions" && pendingOffersCount > 0;

          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                ...tabBtn(isActive),
                position: "relative", // ✅ required so badge anchors to the button
              }}
            >
              {t}

              {showBadge ? (
                <span style={badgeStyle}>
                  {pendingOffersCount > 99 ? "99+" : pendingOffersCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}


  function DeadlineBanner() {
    return (
      <div
        style={{
          marginTop: 10,
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
            fontWeight: 900,
            fontSize: 11,
          }}
        >
          Week {selectionWeek} • {deadlineLabel}
        </div>
        <div
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
    );
  }



  function StarButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        // prevent spacebar from scrolling the page
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
        }
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
      style={{
        width: 28,
        height: 28,
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.10)",
        background: active ? "rgba(250,204,21,0.25)" : "rgba(0,0,0,0.05)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: "#0f172a",
        fontSize: 16,
        fontWeight: 900,
      }}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function TxActionButton({
  enabled,
  onClick,
  label,
  bg,
  fg = "white",
}: {
  enabled: boolean;
  onClick: () => void;
  label: string; // "+" or "ES"
  bg: string;
  fg?: string;
}) {
  const isPlus = label === "+";

  return (
    <button
      disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!enabled) return;
        onClick();
      }}
      style={{
        height: 28,
        width: 28,
        borderRadius: 10,
        border: "none",
        background: bg,
        color: fg,
        fontWeight: 900,
        // ✅ Bigger +, smaller initials
        fontSize: isPlus || label === "↔" ? 20 : 11,
        lineHeight: label === "↔" ? 0.25 : 1,
        letterSpacing: isPlus || label === "↔" ? 0 : 0.3,

        cursor: enabled ? "pointer" : "not-allowed",
        opacity: enabled ? 1 : 0.85,
        display: "grid",
        placeItems: "center",
        userSelect: "none",
      }}
      aria-label={isPlus ? "Add / Claim" : `Owned by ${label}`}
      title={isPlus ? "Add / Claim" : label}
    >
      {label}
    </button>
  );
}

function goToTradeProposal(partnerTeamId: string, requestPlayerId: string) {
  const url =
    `/trade/propose` +
    `?partnerTeamId=${encodeURIComponent(partnerTeamId)}` +
    `&prefillRequestPlayerId=${encodeURIComponent(requestPlayerId)}` +
    `&returnTo=${encodeURIComponent(returnTo)}`;

  router.push(url);
}
function hydratePlayer(p: Player): Player & { status?: any; weeklyStatus?: any } {
  const live = getLivePlayerById?.(p.id);

  return {
    ...p,

    // normalize null -> undefined for modal typing
    secondaryPosAbbrev: (p.secondaryPosAbbrev ?? undefined) as any,
    secondaryPosName: (p.secondaryPosName ?? undefined) as any,

    // prefer live sheet values if present
    status: live?.status ?? (p as any).status ?? undefined,
    weeklyStatus: live?.weeklyStatus ?? (p as any).weeklyStatus ?? {},
  };
}


function PlayerRow({ p }: { p: Player }) {
  // Ownership
  const ownerTeamId = ownerByPlayerId.get(p.id) ?? null;
  const isOwned = !!ownerTeamId;
  const isOwnedByYou = isOwned && ownerTeamId === yourDraftTeamId;

 const isTradeable = ENABLE_TRADES && isOwned && !isOwnedByYou && tradeWindowOpen;

  const locked = lockedUnownedSet.has(p.id);
  const coolingDown = isAddCoolingDown(p.id);
  const enabled = !isOwned && !locked && !coolingDown;

  const isStar = !!(watchlist as any)[p.id];


let btnLabel = "+";
let btnBg = windowMode === "WAIVERS" ? "#FACC15" : "#22C55E";
let btnFg: string = "white";

// Unowned disabled states (locked / cooldown)
if (!isOwned && !enabled) {
  btnBg = "rgba(15,23,42,0.25)";
  btnFg = "white";
}

// Owned by you
if (isOwnedByYou) {
  btnLabel = "ME";
  btnBg = "rgba(148,163,184,0.75)";
  btnFg = "white";
}

// Owned by someone else (DESIGN: always show trade icon)
if (isOwned && !isOwnedByYou) {
  btnLabel = "↔";
  btnBg = "#2563EB";
  btnFg = "white";
}

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 132px",
        gap: 10,
        alignItems: "center",
        padding: "10px 10px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div
        onClick={() => setModalPlayer(hydratePlayer(p))}

        style={{
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <JerseyTile teamCode={p.teamCode} size={32} />

          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.firstName?.[0]}. {p.lastName}
            </div>

            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {teamLabel(p.teamCode)}

              {" — "}
              {p.posName}
              {p.secondaryPosName ? ` / ${p.secondaryPosName}` : ""}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 900, width: 34, textAlign: "right" }}>
          {metricValue(p, infoMode)}
        </div>

        <StarButton active={isStar} onClick={() => toggleWatchlist(p.id)} />

<TxActionButton
  enabled={isTradeable ? true : enabled}
  label={btnLabel}
  bg={btnBg}
  fg={btnFg}
  onClick={() => {
    // Trade (owned by someone else)
    if (isTradeable) {
      if (!ownerTeamId) return;
      goToTradeProposal(ownerTeamId, p.id);
      return;
    }

    // Owned by you (ME) -> do nothing
    if (isOwnedByYou) return;

    // Locked unowned player -> do nothing
    if (locked) return;

    // Add/Claim (unowned)
    guardedAdd(p.id, () => {
      if (!activeLeague?.id || !yourDraftTeamId) return;
      openDropModal(p);
    });
  }}
/>

      </div>
    </div>
  );
}
function shortName(p: { firstName?: string; lastName?: string } | null | undefined) {
  const first = (p?.firstName ?? "").trim();
  const last = (p?.lastName ?? "").trim();
  const initial = first ? first[0].toUpperCase() : "?";
  return last ? `${initial}. ${last}` : `${initial}.`;
}


  function WaiverClaimsTab() {
    const [draggingId, setDraggingId] = useState<string | null>(null);
const [overId, setOverId] = useState<string | null>(null);

    if (!activeLeague?.id || !yourDraftTeamId) {
      return <div style={{ ...listBox, padding: 12, fontSize: 12, fontWeight: 900, opacity: 0.8 }}>No league/team selected.</div>;
    }
    

  // --- Reorder support (priority) ---
  const persistPriorities = (orderedClaimIds: string[]) => {
    // Update store priorities if possible (Zustand pattern)
    const tx: any = useTransactionsStore.getState?.();
    const setClaimPriority =
      tx?.setClaimPriority ||
      tx?.updateClaimPriority ||
      tx?.reorderClaims ||
      null;

    // Preferred: a store method exists
    if (typeof setClaimPriority === "function") {
      // Try the most likely signatures safely
      try {
        // Signature A: setClaimPriority(claimId, priority)
        orderedClaimIds.forEach((id, idx) => setClaimPriority(id, idx + 1));
        return;
      } catch {}
      try {
        // Signature B: reorderClaims({ leagueId, week, teamId, orderedIds })
        setClaimPriority({
          leagueId: activeLeague.id,
          week: claimsWeek,
          teamId: yourDraftTeamId,
          orderedIds: orderedClaimIds,
        });
        return;
      } catch {}
    }

    // Fallback: directly mutate claims array (works if your store is vanilla Zustand with setState)
    if (typeof (useTransactionsStore as any).setState === "function") {
      (useTransactionsStore as any).setState((s: any) => {
        const next = (s.claims ?? []).map((c: any) => {
          if (c.leagueId !== activeLeague.id) return c;
          if (c.week !== claimsWeek) return c;
          if (c.teamId !== yourDraftTeamId) return c;
          const idx = orderedClaimIds.indexOf(c.id);
          if (idx === -1) return c;
          return { ...c, priority: idx + 1 };
        });
        return { claims: next };
      });
    }
  };
const onDragStart = (e: React.DragEvent, claimId: string) => {
  e.dataTransfer.setData("text/plain", claimId); // important for Firefox
  e.dataTransfer.effectAllowed = "move";
  setDraggingId(claimId);
};


const onDragEnd = () => {
  setDraggingId(null);
  setOverId(null);
};

const onDropOn = async (e: React.DragEvent, targetClaimId: string) => {
  e.preventDefault();

  const fromId = e.dataTransfer.getData("text/plain") || draggingId;
  if (!fromId) return;
  if (fromId === targetClaimId) return;

  const ids = yourClaims.map((c: any) => c.id);
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(targetClaimId);
  if (from === -1 || to === -1) return;

  const next = ids.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  // instant local UI update
  persistPriorities(next);

  // ✅ persist to Supabase
  await fetch(`/api/waivers/claims/reorder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      leagueId: activeLeague.id,
      week: claimsWeek,
      orderedIds: next,
    }),
  });

  // ✅ reload from server so UI matches truth
  await refreshTransactionsForLeague(activeLeague.id);

  setDraggingId(null);
  setOverId(null);
};




    return (
      <>
        <div style={{ ...listBox }}>
          <div style={{ padding: "10px 10px", fontSize: 14, fontWeight: 900 }}>
            Your Week {claimsWeek} Claims

            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 800, opacity: 0.65 }}>
  Drag the handle to change claim order, wait a few seconds for the reorder to occur
</div>

          </div>
<div
  style={{
    padding: "6px 14px",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    fontSize: 10,
    fontWeight: 900,
    opacity: 0.7,
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    gap: 10,
    alignItems: "center",
  }}
>
  <div>Priority</div>
  <div />
  <div />
</div>

          {yourClaims.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 800, opacity: 0.7 }}>No pending claims</div>
          ) : (
            yourClaims.map((c: any, idx: number) => {
              const addP = allPlayers.find((x) => x.id === c.addPlayerId) ?? null;
const dropP = allPlayers.find((x) => x.id === c.dropPlayerId) ?? null;

              return (
<div
  key={c.id}
  onDragOver={(e) => e.preventDefault()}
  onDragEnter={() => setOverId(c.id)}
  onDragLeave={() => setOverId((prev) => (prev === c.id ? null : prev))}

  onDrop={(e) => onDropOn(e, c.id)}
  style={{
    padding: "8px 10px",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    gap: 10,
    alignItems: "center",
    background: overId === c.id && draggingId && draggingId !== c.id ? "rgba(15,23,42,0.06)" : "transparent",
  }}
>


<div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  }}
>
  <div
    draggable
    onDragStart={(e) => onDragStart(e, c.id)}
    onDragEnd={onDragEnd}
    title="Drag to reorder"
    aria-label="Drag to reorder"
    style={{
      width: 34,              // bigger
      height: 30,             // bigger
      borderRadius: 10,
      border: "1px solid rgba(0,0,0,0.12)",
      background: draggingId === c.id ? "rgba(15,23,42,0.12)" : "rgba(15,23,42,0.08)",
      display: "grid",
      placeItems: "center",
      cursor: "grab",
      userSelect: "none",
      fontWeight: 900,
      fontSize: 20,           // bigger symbol
      lineHeight: "20px",
      opacity: 0.95,
    }}
  >
    ⋮⋮
  </div>

  <div style={{ fontWeight: 900, fontSize: 13, width: 18, textAlign: "center" }}>
    {idx + 1}
  </div>
</div>





                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
  {addP ? <JerseyTile teamCode={addP.teamCode} size={22} /> : null}

  <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
    {addP ? shortName(addP) : c.addPlayerId}
  </div>
</div>


                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, opacity: 0.65 }}>OUT: {dropP ? shortName(dropP) : c.dropPlayerId ?? "—"}
</div>
                  </div>

                  <button
                    onClick={async () => {
  if (!activeLeague?.id) return;

  await fetch(`/api/waivers/claims?id=${encodeURIComponent(c.id)}`, {
    method: "DELETE",
  });

  await refreshTransactionsForLeague(activeLeague.id);
}}
                    style={{
                      height: 28,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: "none",
                      background: "rgba(239,68,68,0.92)",
                      color: "white",
                      fontWeight: 900,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              );
            })
          )}
        </div>

        
      </>
    );
  }

  function TransactionsTab() {
    const leagueId = activeLeague?.id ?? "";
    const yourId = yourDraftTeamId;
    if (!leagueId || !yourId) {
  return (
    <div style={{ ...listBox, padding: 12, fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
      No league/team selected.
    </div>
  );
}

const yourWaiverRank = waiverOrderIndexByTeamId.get(String(yourId));
const yourWaiverRankText = typeof yourWaiverRank === "number" ? `#${yourWaiverRank + 1}` : "—";
// ---------- helpers (MOVE UP HERE) ----------
const teamById = (activeLeague?.teams ?? []).reduce((acc: any, t: any) => {
  acc[t.id] = t;
  return acc;
}, {});

const teamName = (teamId: string) => teamById?.[teamId]?.name ?? teamId;

const playerById = (id: string) => allPlayers.find((p) => p.id === id) ?? null;

// ✅ user initials (prefer DB columns from public.teams)
const userInitials = (teamId: string) => {
  const t: any = teamById?.[teamId] ?? null;
  if (!t) return getInitials(teamId);

  // 1) BEST: Supabase teams.initials
  if (t.initials) return String(t.initials).trim().toUpperCase();

  // 2) Next best: owner's actual name stored in teams.owner_name
  if (t.ownerName) return getInitials(String(t.ownerName));

  // 3) Then: username stored in teams.owner_username or teams.user_id
  if (t.ownerUsername) return getInitials(String(t.ownerUsername));
  if (t.userId) return getInitials(String(t.userId));

  // 4) Fallback: team display name
  return getInitials(String(t.name ?? teamId));
};

    // --------------------
// Confirm modal (Trades)
// --------------------





function LeagueTradeRow({ t }: { t: any }) {
  const from = teamName(t.fromTeamId);
  const to = teamName(t.toTeamId);

  const offerIds: string[] = t.offerPlayerIds ?? [];
  const requestIds: string[] = t.requestPlayerIds ?? [];

  // offer players go FROM -> TO, request players go TO -> FROM
  const receivedByFrom = requestIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p));

  const receivedByTo = offerIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p));

  const outer: React.CSSProperties = {
    padding: "10px 10px",
    borderTop: "1px solid rgba(0,0,0,0.08)",
  };

  const card: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(15,23,42,0.03)",
    padding: 10,
  };

  const colTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const item: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 800,
    opacity: 0.75,
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div style={outer}>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={colTitle}>{from} received</div>
            {receivedByFrom.length ? (
              receivedByFrom.slice(0, 6).map((n: string, i: number) => (
                <div key={i} style={item}>
                  {n}
                </div>
              ))
            ) : (
              <div style={item}>—</div>
            )}
          </div>

          <div style={{ minWidth: 0, borderLeft: "1px solid rgba(0,0,0,0.10)", paddingLeft: 10 }}>
            <div style={colTitle}>{to} received</div>
            {receivedByTo.length ? (
              receivedByTo.slice(0, 6).map((n: string, i: number) => (
                <div key={i} style={item}>
                  {n}
                </div>
              ))
            ) : (
              <div style={item}>—</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

    // Last “team selection deadline” that has PASSED (used for league trades cutoff)
    const lastSelectionDeadlineMs = useMemo(() => {
      if (!liveWeekDeadlineMs) return 0;

      // If we're still BEFORE the current live week deadline, the last passed deadline is previous week.
      if (nowMs < liveWeekDeadlineMs) {
        const idx = weeksSorted.indexOf(liveWeek);
        const prevWeek = weeksSorted[Math.max(0, idx - 1)] ?? null;
        return prevWeek ? getWeekDeadlineMs(normalizedFixtures as any, prevWeek) : 0;
      }

      // Otherwise, current live week deadline has passed and is the last one.
      return liveWeekDeadlineMs;
    }, [nowMs, liveWeekDeadlineMs, liveWeek, weeksSorted, normalizedFixtures]);

    // Most recent waiver deadline that has PASSED (used for waiver-claims feed)
    const lastWaiverDeadlineMs = useMemo(() => {
      // waiverDeadlineMs is for the current selectionWeek.
      if (!waiverDeadlineMs) return 0;

      // If we haven't reached this week's waiver deadline yet, show previous week’s.
      if (nowMs < waiverDeadlineMs) {
        const idx = weeksSorted.indexOf(selectionWeek);
        const prevWeek = weeksSorted[Math.max(0, idx - 1)] ?? null;
        if (!prevWeek) return 0;

        const prevSelectionDeadline = getWeekDeadlineMs(normalizedFixtures as any, prevWeek);
        return prevSelectionDeadline ? prevSelectionDeadline - 24 * 60 * 60 * 1000 : 0;
      }

      // Otherwise, current waiver deadline has passed
      return waiverDeadlineMs;
    }, [nowMs, waiverDeadlineMs, selectionWeek, weeksSorted, normalizedFixtures]);

    // Latest free agency period that has PASSED = (waiver deadline -> selection deadline) window
    // We show transfers created after the last waiver deadline.
    const freeAgencyCutoffMs = lastWaiverDeadlineMs;

    // ---------- Pending Trades split ----------
   const pendingTradesAll = (tradesForUi as any[])
  .filter((t) => t.leagueId === leagueId)
  .filter((t) => String(t.status ?? "").toLowerCase() === "pending");


    const offersReceived = pendingTradesAll
      .filter((t) => t.toTeamId === yourId)
      .slice()
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    const offersProposed = pendingTradesAll
      .filter((t) => t.fromTeamId === yourId)
      .slice()
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    // ---------- League Trades (accepted since last team selection deadline) ----------
    const leagueTradesSinceDeadline = (tradesForUi as any[])
  .filter((t) => t.leagueId === leagueId)
  .filter((t) => String(t.status ?? "").toLowerCase() === "accepted")
      .filter((t) => (t.acceptedAtMs ?? t.decidedAtMs ?? t.updatedAtMs ?? t.createdAtMs ?? 0) >= (lastSelectionDeadlineMs || 0))
      .slice()
      .sort(
        (a, b) =>
          (b.acceptedAtMs ?? b.decidedAtMs ?? b.updatedAtMs ?? b.createdAtMs ?? 0) -
          (a.acceptedAtMs ?? a.decidedAtMs ?? a.updatedAtMs ?? a.createdAtMs ?? 0)
      );

// ---------- Waiver claims feed (most recent waiver deadline) ----------
// Display order should mirror the waiver PROCESS DISPLAY order:
// in each pass, go team-by-team in waiver order,
// and for each team show claims until that team hits a PROCESSED claim.
// Then move to the next team, and repeat passes until all claims are shown.
const waiverClaimsFeed = useMemo(() => {
  const eligibleClaims = (claimsForUi as any[])
    .filter((c) => c.leagueId === leagueId)
    .filter((c) => {
      const s = String(c.status ?? "").toUpperCase();
      return s === "PROCESSED" || s === "FAILED";
    })
    .filter((c) => {
      const ms = c.processedAtMs ?? c.decidedAtMs ?? c.updatedAtMs ?? 0;
      if (!ms) return false;
      return ms >= (lastWaiverDeadlineMs || 0);
    });

  // group claims by team
  const claimsByTeam = new Map<string, any[]>();

  for (const c of eligibleClaims) {
    const teamId = String(c.teamId ?? "");
    if (!teamId) continue;
    if (!claimsByTeam.has(teamId)) claimsByTeam.set(teamId, []);
    claimsByTeam.get(teamId)!.push(c);
  }

  // sort each team's claims by priority, then created time
  for (const [teamId, arr] of claimsByTeam.entries()) {
    arr.sort((a, b) => {
      const ap = typeof a.priority === "number" ? a.priority : 9999;
      const bp = typeof b.priority === "number" ? b.priority : 9999;
      if (ap !== bp) return ap - bp;
      return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    });
  }

  // team order from waiver order table
  let orderedTeamIds = waiverOrderRows
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => String(r.teamId));

  // fallback if waiver order rows are missing
  if (!orderedTeamIds.length) {
    orderedTeamIds = Array.from(claimsByTeam.keys()).sort((a, b) => {
      const ai = waiverOrderIndexByTeamId.get(String(a)) ?? 9999;
      const bi = waiverOrderIndexByTeamId.get(String(b)) ?? 9999;
      if (ai !== bi) return ai - bi;
      return String(a).localeCompare(String(b));
    });
  }

  // include any teams that somehow have claims but are not in waiver order rows
  for (const teamId of claimsByTeam.keys()) {
    if (!orderedTeamIds.includes(teamId)) orderedTeamIds.push(teamId);
  }

  // make mutable queues per team
  const queues = new Map<string, any[]>();
  for (const teamId of orderedTeamIds) {
    queues.set(teamId, [...(claimsByTeam.get(teamId) ?? [])]);
  }

  const result: any[] = [];
  let madeProgress = true;

  while (madeProgress) {
    madeProgress = false;

    for (const teamId of orderedTeamIds) {
      const queue = queues.get(teamId) ?? [];
      if (!queue.length) continue;

      madeProgress = true;

      // show this team's claims until first PROCESSED claim in this pass
      while (queue.length) {
        const claim = queue.shift()!;
        result.push(claim);

        const status = String(claim.status ?? "").toUpperCase();
        if (status === "PROCESSED") {
          break;
        }
      }
    }
  }

  return result;
}, [
  claimsForUi,
  leagueId,
  lastWaiverDeadlineMs,
  waiverOrderRows,
  waiverOrderIndexByTeamId,
]);

    // ---------- Free agent transfers feed (latest free agency period) ----------
    const freeAgentFeed = (freeForUi as any[])
      .filter((x) => x.leagueId === leagueId)
      .filter((x) => (x.createdAtMs ?? x.updatedAtMs ?? 0) >= (freeAgencyCutoffMs || 0))
      .slice()
      .sort((a, b) => (b.createdAtMs ?? b.updatedAtMs ?? 0) - (a.createdAtMs ?? a.updatedAtMs ?? 0));

    // ---------- UI pieces ----------
    const miniHeader: React.CSSProperties = {
      padding: "6px 10px",
      fontSize: 10,
      fontWeight: 900,
      opacity: 0.7,
      borderTop: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(15,23,42,0.03)",
    };

    const rowWrap: React.CSSProperties = {
      padding: "10px 10px",
      borderTop: "1px solid rgba(0,0,0,0.08)",
      display: "grid",
      gridTemplateColumns: "44px 1fr 110px",
      gap: 10,
      alignItems: "center",
    };

    const pill: React.CSSProperties = {
      height: 28,
      padding: "0 10px",
      borderRadius: 999,
      border: "none",
      fontWeight: 900,
      fontSize: 12,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };

    function TradeSummary({ t, mode }: { t: any; mode: "RECEIVED" | "PROPOSED" | "LEAGUE" }) {
  const from = teamName(t.fromTeamId);
  const to = teamName(t.toTeamId);

  const offerIds: string[] = t.offerPlayerIds ?? [];
  const requestIds: string[] = t.requestPlayerIds ?? [];

  const offerNames = offerIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p))
    .slice(0, 3);

  const requestNames = requestIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p))
    .slice(0, 3);

  const topLine =
    mode === "RECEIVED"
      ? `From ${from}`
      : mode === "PROPOSED"
      ? `To ${to}`
      : `${from} ↔ ${to}`;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {topLine}
      </div>

      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, opacity: 0.7 }}>
        Offer: {offerNames.length ? offerNames.join(", ") : "—"}
        {offerIds.length > 3 ? "…" : ""}
      </div>

      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, opacity: 0.7 }}>
        Request: {requestNames.length ? requestNames.join(", ") : "—"}
        {requestIds.length > 3 ? "…" : ""}
      </div>
    </div>
  );
}


    function InitialBadge({ text }: { text: string }) {
      return (
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "#2563EB",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            fontSize: 11,
          }}
        >
          {text}
        </div>
      );
    }

        function StatusPill({ status }: { status: string }) {
      const s = String(status ?? "").toUpperCase();

      const isProcessed = s === "PROCESSED" || s === "SUCCESS" || s === "APPROVED";
      const isFailed = s === "FAILED";
      const isDeclined = s === "DECLINED" || s === "REJECTED";

      const text =
        isProcessed ? "Processed" :
        isFailed ? "Failed" :
        isDeclined ? "Declined" :
        s ? s[0] + s.slice(1).toLowerCase() : "—";

      const color =
        isProcessed ? "rgba(34,197,94,0.95)" :
        isFailed ? "rgba(239,68,68,0.95)" :
        isDeclined ? "rgba(239,68,68,0.95)" :
        "rgba(15,23,42,0.70)";

      const bg =
        isProcessed ? "rgba(34,197,94,0.10)" :
        isFailed ? "rgba(239,68,68,0.10)" :
        isDeclined ? "rgba(239,68,68,0.10)" :
        "rgba(15,23,42,0.06)";

      return (
        <div
          style={{
            justifySelf: "end",
            width: 88,
            height: 30,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 900,
            color,
            background: bg,
            border: "1px solid rgba(0,0,0,0.06)",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            boxSizing: "border-box",
          }}
        >
          {text}
        </div>
      );
    }

    // ---------- Render ----------
    return (
      <>
{/* Pending Trades FIRST */}
<div style={listBox}>
  <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 900 }}>
    Pending Trades
  </div>

  {/* RECEIVED */}
  <div style={miniHeader}>Trade Offers Received</div>

  {offersReceived.length === 0 ? (
    <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
      None.
    </div>
  ) : (
    offersReceived.map((t: any) => (
      <div key={t.id} style={rowWrap}>
        <InitialBadge text={userInitials(t.fromTeamId)} />

        <TradeSummary t={t} mode="RECEIVED" />

        <div style={{ display: "grid", gap: 8, justifyContent: "end" }}>
          <>
  {tradeWindowOpen ? (
    <>
      <button
        style={{
          ...pill,
          background: "rgba(34,197,94,0.12)",
          color: "rgba(34,197,94,0.95)",
          border: "1px solid rgba(34,197,94,0.35)",
        }}
        onClick={() => openAcceptConfirm(t)}
      >
        Accept
      </button>

      <button
        style={{
          ...pill,
          background: "rgba(239,68,68,0.10)",
          color: "rgba(239,68,68,0.95)",
          border: "1px solid rgba(239,68,68,0.30)",
        }}
        onClick={() => {
  apiDeclineTrade(t.id);
}}
      >
        Decline
      </button>
    </>
  ) : (
    <StatusPill status="Expired" />
  )}
</>

        </div>
      </div>
    ))
  )}

  {/* PROPOSED */}
  <div style={miniHeader}>Trade Offers Proposed</div>

  {offersProposed.length === 0 ? (
    <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
      None.
    </div>
  ) : (
    offersProposed.map((t: any) => (
      <div key={t.id} style={rowWrap}>
        <InitialBadge text={userInitials(t.toTeamId)} />

        <TradeSummary t={t} mode="PROPOSED" />

        <div style={{ display: "grid", justifyContent: "end" }}>
          {tradeWindowOpen ? (
  <button
    style={{
      ...pill,
      background: "rgba(239,68,68,0.10)",
      color: "rgba(239,68,68,0.95)",
      border: "1px solid rgba(239,68,68,0.30)",
    }}
    onClick={() => {
  apiCancelTrade(t.id);
}}

  >
    Cancel
  </button>
) : (
  <StatusPill status="Expired" />
)}

        </div>
      </div>
    ))
  )}
</div>


        {/* League Trades since last team selection deadline */}
        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 900 }}>League Trades</div>
          

          {leagueTradesSinceDeadline.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 800, opacity: 0.7 }}>None yet.</div>
          ) : (
            leagueTradesSinceDeadline.map((t: any) => (
  <LeagueTradeRow key={t.id} t={t} />
))
          )}
        </div>

        {/* Waiver Claims from most recent waiver deadline */}
        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 900 }}>Waiver Claims</div>
          <div style={{ padding: "0 10px 10px", fontSize: 10, fontWeight: 900, opacity: 0.7 }}>
  Your waiver priority: {waiverOrderLoaded ? yourWaiverRankText : "Loading…"}
</div>

          {waiverClaimsFeed.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 800, opacity: 0.7 }}>None.</div>
          ) : (
            waiverClaimsFeed.map((c: any, idx: number) => {
              const addP = playerById(c.addPlayerId);
              const dropP = playerById(c.dropPlayerId);

              return (
                <div
                  key={c.id ?? `${c.teamId}_${idx}`}
                  style={{
                    padding: "10px 10px",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    display: "grid",
                    gridTemplateColumns: "26px 44px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75, textAlign: "center" }}>{idx + 1}</div>

                  <InitialBadge text={userInitials(c.teamId)} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      IN: {addP ? shortName(addP) : c.addPlayerId}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, opacity: 0.65 }}>
                      OUT: {dropP ? shortName(dropP) : c.dropPlayerId ?? "—"}
                    </div>
                  </div>

                  <StatusPill status={c.status ?? c.result ?? "Processed"} />
                </div>
              );
            })
          )}
        </div>

        {/* Free Agent Transfers from latest free agency period */}
        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 900 }}>Free Agent Transfers</div>
          

          {freeAgentFeed.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 800, opacity: 0.7 }}>None.</div>
          ) : (
            freeAgentFeed.map((x: any, idx: number) => {
              const addP = playerById(x.addPlayerId);
              const dropP = playerById(x.dropPlayerId);

              return (
                <div
                  key={x.id ?? `${x.teamId}_${idx}`}
                  style={{
                    padding: "10px 10px",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    display: "grid",
                    gridTemplateColumns: "26px 44px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75, textAlign: "center" }}>{idx + 1}</div>

                  <InitialBadge text={userInitials(x.teamId)} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      IN: {addP ? shortName(addP) : x.addPlayerId}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 800, opacity: 0.65 }}>
                      OUT: {dropP ? shortName(dropP) : x.dropPlayerId ?? "—"}
                    </div>
                  </div>

                  <StatusPill status={x.status ?? "Processed"} />
                </div>
              );
            })
          )}
        </div>

      </>
    );
  }


  // Player modal actions: keep blank placeholder buttons at bottom (for now)
  // Player modal actions
const modalActions = useMemo(() => {
  if (!modalPlayer) return [];

  const playerId = modalPlayer.id;

  const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;
  const isOwned = !!ownerTeamId;
  const isOwnedByYou = isOwned && ownerTeamId === yourDraftTeamId;

  // Locked means: unowned BUT temporarily locked
  const isLocked = lockedUnownedSet.has(playerId);

  const isOnWatchlist = !!(watchlist as any)[playerId];

  // If owned by you: no buttons
  if (isOwnedByYou) return [];

  // Watchlist button (always shown unless owned-by-you)
  const watchlistAction = {
  label: isOnWatchlist ? "Remove from Watchlist" : "Add to Watchlist",
  variant: "secondary" as const,
  onClick: () => toggleWatchlist(playerId),
};

  // Unowned: Claim/Sign/Locked
  if (!isOwned) {
    // FREE_AGENCY locked -> Locked button does nothing
    if (windowMode === "FREE_AGENCY" && isLocked) {
      return [
        watchlistAction,
        {
          label: "Locked",
          variant: "secondary" as const,
          onClick: () => {}, // no-op
        },
      ];
    }

    // Otherwise allow opening the add/drop modal
    const label = windowMode === "WAIVERS" ? "Submit Claim" : "Sign Player";

    return [
      watchlistAction,
      {
        label,
        variant: "primary" as const,
onClick: () => {
  const addP = modalPlayer; // capture before closing
  if (!addP) return;

  // close player card first
  setModalPlayer(null);

  // open add/drop modal next tick
  window.setTimeout(() => {
    openDropModal(addP);
  }, 0);
},

      },
    ];
  }

  // Owned by another leaguemate: Propose trade (we'll wire to a real page soon)
  return [
    watchlistAction,
    {
  label: "Propose Trade",
  variant: "primary" as const,
  onClick: () => {
    const playerId = modalPlayer.id;
    const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;

    if (!activeLeague?.id || !yourDraftTeamId || !ownerTeamId) return;

    // Close the player card before navigating
    setModalPlayer(null);

const url =
  `/trade/propose` +
  `?partnerTeamId=${encodeURIComponent(ownerTeamId)}` +
  `&prefillRequestPlayerId=${encodeURIComponent(playerId)}` +
  `&returnTo=${encodeURIComponent(returnTo)}`;


    // Navigate on next tick so the modal unmount doesn't fight routing
    window.setTimeout(() => router.push(url), 0);
  },
},

  ];
}, [
  modalPlayer,
  ownerByPlayerId,
  yourDraftTeamId,
  lockedUnownedSet,
  watchlist,
  toggleWatchlist,
  windowMode,
    openDropModal,
  router,
  returnTo,
  activeLeague?.id,
  selectionWeek,
]);



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

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Hamburger />
            <div style={{ flex: 1 }} />
          </div>

          <DeadlineBanner />

          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 900 }}>Transactions</div>
          
        </div>

        <Tabs />

        {tab === "Player Pool" && (
          <>
            <Filters
  search={search}
  setSearch={setSearch}
  teamFilter={teamFilter}
  setTeamFilter={setTeamFilter}
  posFilter={posFilter}
  setPosFilter={setPosFilter}
  ownerFilterValue={ownerFilterValue}
  setOwnerFilterValue={setOwnerFilterValue}
  ownerFilterOptions={ownerFilterOptions}
  infoMode={infoMode}
  setInfoMode={(v) => setInfoMode(v as any)}
/>

            <div style={listBox}>
              <div style={{ padding: "8px 121px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px" }}>
                  <div />
                  <div style={{ textAlign: "right" }}>{metricLabel(infoMode)}</div>
                </div>
              </div>

              {playerPoolPlayers.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>No available players found.</div>
              ) : (
                playerPoolPlayers.map((p) => <PlayerRow key={p.id} p={p} />)
              )}
            </div>
          </>
        )}

        {tab === "Watchlist" && (
          <>
            <Filters
  search={search}
  setSearch={setSearch}
  teamFilter={teamFilter}
  setTeamFilter={setTeamFilter}
  posFilter={posFilter}
  setPosFilter={setPosFilter}
  ownerFilterValue={ownerFilterValue}
  setOwnerFilterValue={setOwnerFilterValue}
  ownerFilterOptions={ownerFilterOptions}
  infoMode={infoMode}
  setInfoMode={(v) => setInfoMode(v as any)}
/>

            <div style={listBox}>
              <div style={{ padding: "8px 121px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px" }}>
                  <div />
                  <div style={{ textAlign: "right" }}>{metricLabel(infoMode)}</div>
                </div>
              </div>

              {watchlistPlayers.length === 0 ? (
                <div style={{ padding: 14, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>No players in your watchlist yet.</div>
              ) : (
                watchlistPlayers.map((p) => <PlayerRow key={p.id} p={p} />)
              )}
            </div>
          </>
        )}

        {tab === "Pending Claims" && <WaiverClaimsTab />}
        {tab === "Transactions" && <TransactionsTab />}
      </div>

      {/* Menu */}
      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeague?.id ?? null}
        setActiveLeague={setActiveLeague}
        activeItem="Transactions"
      />

      {/* Player modal */}
{modalPlayer ? (
  (() => {
    const live = getLivePlayerById?.(modalPlayer.id);

    return (
      <PlayerCardModal
        onClose={() => setModalPlayer(null)}
        player={{
          ...modalPlayer,
          secondaryPosAbbrev: modalPlayer.secondaryPosAbbrev ?? undefined,
          secondaryPosName: modalPlayer.secondaryPosName ?? undefined,
          status: live?.status ?? modalPlayer.status ?? undefined,
          weeklyStatus: live?.weeklyStatus ?? modalPlayer.weeklyStatus ?? {},
        }}
        teamLabel={ownerTeamLabelForPlayerId(modalPlayer.id)}
        initialTab="Stats"
        actions={modalActions}
      />
    );
  })()
) : null}


            <DropSelectModal />
<ConfirmAcceptTradeModal />

    </main>
  );
}
export default function Page() {
  useRequireSession();

  return (
    <Suspense fallback={<div style={{ minHeight: "100svh", width: "100%" }} />}>
      <TransactionsPageInner />
    </Suspense>
  );
}