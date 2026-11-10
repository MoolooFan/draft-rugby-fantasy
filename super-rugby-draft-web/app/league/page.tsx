"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore } from "@/lib/league/store";
import type { PlayoffFormat } from "@/lib/league/types";

import { AppMenu } from "@/components/AppMenu";
import { usePlayersStore } from "@/lib/players/store";
import { ScoringEditor } from "@/components/ScoringEditor";
import { STANDARD_SCORING, type ScoringRules } from "@/lib/scoring";
import { CAPTAIN_MULTIPLIER, pointsFromRow } from "@/lib/scoring";

import { currentSeasonYear, fixturesByFantasyWeek, roundLabel } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import type { Fixture } from "@/lib/fixtures/types";
import { useStableComponent } from "@/lib/hooks/useStableComponent";
import { toMs, pickValue } from "@/lib/league/weekHelpers";
import { toDatetimeLocal, ModalOverlay, inputStyle, selectStyle, parseDatetimeLocal, saveButton } from "./ui";
import { LeagueSettingsModal } from "./LeagueSettingsModal";

type LeagueTab = "Standings" | "Fixtures" | "Results";
type Modal =
  | null
  | { type: "join" }
  | { type: "create" }
  | { type: "settings" };

  type FixtureRow = {
  weekNo: number;

  home: string;
  away: string;

  homeTeamId?: string | null;
  awayTeamId?: string | null;

  homeScore: number | null;
  awayScore: number | null;

  // ✅ ADD THESE (for playoff label rows)
  label?: string | null;
  kind?: "regular" | "playoffs" | "consolation" | string | null;
};

type FixtureWeek = {
  weekNo: number;
  rows: FixtureRow[];
};

type AnyFixture = Fixture & {
  id: string;
  week: number; // real round
  kickoffAt: string | number;
  status?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

const BYE_SENTINEL = "__BYE__";

// ---------- Live scoring helpers (same logic as Matchup page) ----------
type SlotId =
  | "prop1" | "hooker1" | "prop2"
  | "lock1" | "lock2"
  | "looseforward1" | "looseforward2" | "looseforward3"
  | "halfback1" | "flyhalf1"
  | "centre1" | "centre2"
  | "outsideback1" | "outsideback2" | "outsideback3"
  | "bench1" | "bench2" | "bench3" | "bench4" | "bench5";

type PlayerLite = {
  id: string;
  firstName?: string;
  lastName?: string;
  teamCode?: string;
  posAbbrev?: string;
  secondaryPosAbbrev?: string | null;
  posName?: string;
  secondaryPosName?: string | null;
};

const CAP_MULT = CAPTAIN_MULTIPLIER;

function normaliseId(x: any) {
  return String(x ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rowPlayerId(row: any) {
  return pickValue(row, ["playerId", "Player ID", "player_id", "id"]);
}

function rowRound(row: any) {
  const v = pickValue(row, ["round", "Round", "week", "Week"]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Stats are raw counts; the shared scoring rules (lib/scoring) turn them into fantasy points.
function calcFantasyPoints(row: any, player?: any): number {
  return pointsFromRow(row, player ?? null);
}

export default function LeaguePage() {
 useRequireSession();
  // --- prevent "bounce" before zustand persist hydrates ---
  const [leagueHydrated, setLeagueHydrated] = useState(() =>
    // @ts-ignore - persist is added by zustand middleware at runtime
    useLeagueStore.persist?.hasHydrated?.() ?? true
  );

  useEffect(() => {
    // @ts-ignore
    const persistApi = useLeagueStore.persist;
    if (!persistApi?.onFinishHydration) {
      setLeagueHydrated(true);
      return;
    }

    // set immediately in case it hydrated between renders
    setLeagueHydrated(persistApi.hasHydrated());

    const unsub = persistApi.onFinishHydration(() => setLeagueHydrated(true));
    return () => {
      // onFinishHydration returns an unsubscribe in zustand v4
      try { unsub?.(); } catch {}
    };
  }, []);

const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);

    // ---- Live sheet feed (MUST be inside component) ----
  const livePlayersLoaded = usePlayersStore((s) => s.loaded);
  const refreshLivePlayers = usePlayersStore((s) => s.refresh);
  const sheetPlayers = usePlayersStore((s) => s.players);
  const roundRows = usePlayersStore((s) => s.roundRows);

  useEffect(() => {
    if (!livePlayersLoaded) refreshLivePlayers();
  }, [livePlayersLoaded, refreshLivePlayers]);

  // Map draftId/playerId → sheet row lookup (handles mismatched ids)
  const sheetPlayerById = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of sheetPlayers ?? []) {
      const draftLikeId =
        pickValue(p, ["id", "draftId", "draft_id", "Draft ID", "playerKey"]) ?? null;
      const sheetPid =
        pickValue(p, ["playerId", "player_id", "player id", "Player ID", "id"]) ?? null;

      if (draftLikeId != null) m.set(normaliseId(draftLikeId), p);
      if (sheetPid != null) m.set(normaliseId(sheetPid), p);
    }
    return m;
  }, [sheetPlayers]);

  // Build: REAL round -> (playerId -> points)
const pointsByRealRound = useMemo(() => {
  const byRound = new Map<number, Map<string, number>>();
  for (const row of roundRows ?? []) {
    const rr = rowRound(row); // this is REAL round from the sheet
    if (!rr) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = normaliseId(pidRaw);
    const pts = calcFantasyPoints(row, sheetPlayerById.get(pid));

    if (!byRound.has(rr)) byRound.set(rr, new Map());
    byRound.get(rr)!.set(pid, pts);
  }
  return byRound;
}, [roundRows, sheetPlayerById]);

  const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s: any) => s.activeLeagueId ?? null);

const refreshLeague = useLeagueStore((s) => s.refreshLeague);

useEffect(() => {
  if (!mounted) return;
  if (!leagueHydrated) return;
  if (!activeLeagueId) return;

  const run = () => refreshLeague(activeLeagueId);
  run();

  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", run);

  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", run);
  };
}, [mounted, leagueHydrated, activeLeagueId, refreshLeague]);

const league = useMemo(() => {
  return leagues.find((l) => l.id === activeLeagueId) ?? null;
}, [leagues, activeLeagueId]);

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
  homeBonus?: number; // bonus ladder points (from the database)
  awayBonus?: number;
};

const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);

useEffect(() => {
  if (!league?.id) return;

  const season = currentSeasonYear();
  fetch(`/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(league.id)}`)
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) setSheetFixtures(j.rows ?? []);
      else console.error("fixtures fetch failed", j?.error);
    })
    .catch((e) => console.error(e));
}, [league?.id]);

function isSheetLabelRow(r: SheetFixtureRow) {
  return !!(r.label && String(r.label).trim());
}

function isSheetMatchRow(r: SheetFixtureRow) {
  // Anything that isn't a label row and has at least one team (includes BYEs and TBC placeholders)
  if (isSheetLabelRow(r)) return false;
  const home = (r.homeTeamId ?? "").trim();
  const away = (r.awayTeamId ?? "").trim();
  return home !== "" || away !== "";
}

function isSheetRegularRow(r: SheetFixtureRow) {
  const k = String(r.kind ?? "").toLowerCase();
  return !k || k === "regular";
}

function isPlayoffsKind(kind: string | null) {
  return String(kind ?? "").toLowerCase() === "playoffs";
}

function labelText(r: FixtureRow) {
  return String(r.home ?? "").trim().toLowerCase();
}

function isGrandFinalHeader(r: FixtureRow) {
  return labelText(r) === "grand final";
}

function shouldInjectPlaceholder(r: FixtureRow) {
  if (!isPlayoffsKind(r.kind ?? null)) return false;

  const text = labelText(r);

  // Do NOT inject if sheet already contains a real matchup row
  if (
    text === "consolation final" ||
    text === "consolation playoff"
  ) {
    return false;
  }

  return true;
}

// Week is "complete" only when ALL non-label regular rows are complete
function isFantasyWeekComplete(weekNo: number) {
  const rows = sheetFixtures.filter((r) => Number(r.weekFantasy) === weekNo);

  // playable = any non-label matchup row (regular OR playoffs)
  const playable = rows.filter(isSheetMatchRow);

  if (playable.length === 0) return false;

  return playable.every((r) => String(r.status ?? "").toLowerCase() === "complete");
}

function latestCompletedRegularWeek(): number {
  // Only regular (non-label) weeks count for standings movement.
  const weeks = Array.from(
    new Set(
      sheetFixtures
        .filter((r) => !isSheetLabelRow(r) && isSheetRegularRow(r))
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);

  let latest = 0;
  for (const w of weeks) {
    if (isFantasyWeekComplete(w)) latest = w;
  }
  return latest;
}

function rowPlayed(r: FixtureRow, weekNo: number) {
  if (r.label) return false;

  const hit = sheetFixtures.find((x) =>
    Number(x.weekFantasy) === weekNo &&
    (x.homeTeamId ?? null) === (r.homeTeamId ?? null) &&
    (x.awayTeamId ?? null) === (r.awayTeamId ?? null)
  );

  return String(hit?.status ?? "").toLowerCase() === "complete";
}

function scoreFromSheet(weekNo: number, teamId: string | null): number | null {
  if (!teamId) return null;

  const hit = sheetFixtures.find((x) => {
    if (Number(x.weekFantasy) !== weekNo) return false;
    if (String(x.status ?? "").toLowerCase() !== "complete") return false;
    return x.homeTeamId === teamId || x.awayTeamId === teamId;
  });

  if (!hit) return null;
  if (hit.homeTeamId === teamId) return hit.homeScore ?? null;
  return hit.awayScore ?? null;
}

const realFixtures = useMemo(() => fixturesData as AnyFixture[], []);

const normalizedFixtures = useMemo(() => {
  return realFixtures
    .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
    .sort((a, b) => (a as any).kickoffMs - (b as any).kickoffMs);
}, [realFixtures]);

  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const getIsCreator = useLeagueStore((s) => s.isActiveLeagueCreator);
const isCreator = getIsCreator();

useEffect(() => {
  if (!mounted) return;
  if (!leagueHydrated) return;

  // If we have leagues but no activeLeagueId yet, pick the first one
  if (!activeLeagueId && leagues?.length) {
    setActiveLeague(leagues[0].id);
  }
}, [mounted, leagueHydrated, activeLeagueId, leagues, setActiveLeague]);

  const updateLeagueSettings = useLeagueStore((s) => s.updateLeagueSettings);
  const setDraftOrder = useLeagueStore((s) => s.setDraftOrder);
  const joinLeagueByCode = useLeagueStore((s) => s.joinLeagueByCode);
  const createLeague = useLeagueStore((s) => s.createLeague);

  const [tab, setTab] = useState<LeagueTab>("Standings");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const leagueName = league?.name ?? "League";
  const leagueCode = league?.code ?? "—";

type StandingRow = {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  pf: number;
  pa: number;
  pd: number;
  pts: number;
  movement: "same" | "up" | "down";
};

const currentWeek = league?.currentWeek ?? 1;

const playoffWeeks =
  league?.playoffFormat === "final4" ? 2 :
  league?.playoffFormat === "final3" ? 2 :
  league?.playoffFormat === "final2" ? 1 :
  0;

// ✅ Real Super Rugby rounds (full season)
const REAL_REGULAR_ROUNDS = league?.realRegularSeasonRounds ?? 16;

// ✅ Start round must be within 1..REAL_REGULAR_ROUNDS
const START_ROUND_RAW = league?.startRound ?? 1;
const START_ROUND = Math.min(
  REAL_REGULAR_ROUNDS,
  Math.max(1, START_ROUND_RAW)
);

// ✅ Fantasy regular season is FIXED to 14 weeks (or less if startRound is late)
const FANTASY_REGULAR_WEEKS_CAP = 16;
const regularWeeks = Math.max(
  1,
  Math.min(FANTASY_REGULAR_WEEKS_CAP, REAL_REGULAR_ROUNDS - START_ROUND + 1)
);

// ✅ Total season weeks = regular + playoffs
const totalWeeks = regularWeeks + playoffWeeks;

function buildStandingsFromResults(uptoWeekInclusive: number): Omit<StandingRow, "rank" | "movement">[] {
  const teams = league?.teams ?? [];
  const base = new Map<string, Omit<StandingRow, "rank" | "movement">>();

  for (const t of teams) {
    base.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      pd: 0,
      pts: 0,
    });
  }

  // Only completed REGULAR rows up to the requested week.
  const rows = sheetFixtures.filter((r) => {
    const w = Number(r.weekFantasy);
    if (!w || w > uptoWeekInclusive) return false;
    if (isSheetLabelRow(r)) return false;
    if (!isSheetRegularRow(r)) return false;
    if (String(r.status ?? "").toLowerCase() !== "complete") return false;
    return true;
  });

  for (const m of rows) {
  const homeId = m.homeTeamId ?? null;
  const awayId = m.awayTeamId ?? null;

  const hs = m.homeScore;
  const as = m.awayScore;

  // BYE row: include the real team's score in PF only
  if (!homeId || !awayId) {
    const realTeamId = homeId ?? awayId;
    const realScore = homeId ? hs : as;

    if (!realTeamId || realScore == null) continue;

    const team = base.get(realTeamId);
    if (!team) continue;

    team.pf += realScore;
    team.pd = team.pf - team.pa;
    continue;
  }

  if (hs == null || as == null) continue;

  const home = base.get(homeId);
  const away = base.get(awayId);
  if (!home || !away) continue;

  home.played += 1;
  away.played += 1;

  home.pf += hs;
  home.pa += as;
  away.pf += as;
  away.pa += hs;

  if (hs > as) {
    home.wins += 1;
    home.pts += 4;
    away.losses += 1;
  } else if (as > hs) {
    away.wins += 1;
    away.pts += 4;
    home.losses += 1;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.pts += 2;
    away.pts += 2;
  }

  // bonus ladder points (win by a lot / lose by a little), if the league uses them
  home.pts += Number(m.homeBonus ?? 0);
  away.pts += Number(m.awayBonus ?? 0);

  home.pd = home.pf - home.pa;
  away.pd = away.pf - away.pa;
}

  return Array.from(base.values());
}

const standings = useMemo<StandingRow[]>(() => {
  // ✅ Sheet-driven “current standings week”
  const playedNow = latestCompletedRegularWeek();      // e.g. 1, 2, 3...
  const playedPrev = Math.max(0, playedNow - 1);

  const curr = buildStandingsFromResults(playedNow);
  const prev = buildStandingsFromResults(playedPrev);

    const sortRows = (arr: any[]) =>
    arr.slice().sort((a, b) => b.pts - a.pts || b.pf - a.pf || b.pd - a.pd);

  const currSorted = sortRows(curr);
  const prevSorted = sortRows(prev);

  const prevRankById = new Map(prevSorted.map((r, i) => [r.teamId, i + 1]));

  return currSorted.map((r, i) => {
    const rank = i + 1;
    const prevRank = prevRankById.get(r.teamId);

    let movement: "same" | "up" | "down" = "same";
    if (prevRank != null) {
      if (rank < prevRank) movement = "up";
      else if (rank > prevRank) movement = "down";
    }

    return { rank, ...r, movement };
  });
}, [sheetFixtures, league?.teams]);

  // ------- fixtures/results (generated placeholder) -------

    const teamNameById = (id: string | null | undefined, opts?: { tbcIfMissing?: boolean }) => {
  if (!id) return opts?.tbcIfMissing ? "TBC" : "BYE";
  return league?.teams.find((t) => t.id === id)?.name ?? "TBC";
};

const fixtures = useMemo<FixtureWeek[]>(() => {
  if (!league?.teams?.length) return [];

  const teamNameById = (id: string | null | undefined, opts?: { tbcIfMissing?: boolean }) => {
    if (!id) return opts?.tbcIfMissing ? "TBC" : "BYE";
    return league.teams.find((t) => t.id === id)?.name ?? "TBC";
  };

  const byWeek = new Map<number, FixtureRow[]>();

  // Keep CSV order. (So your sheet order controls display order)
  for (const r of sheetFixtures) {
    const weekNo = Number(r.weekFantasy);
    if (!weekNo) continue;

    const label = r.label ?? null;
const kind = r.kind ? String(r.kind).toLowerCase() : null;
    const isLabel = !!label || String(kind ?? "").toLowerCase() === "label";
    const isNonRegular = !!kind && String(kind).toLowerCase() !== "regular";

    const homeTeamId = r.homeTeamId ?? null;
    const awayTeamId = r.awayTeamId ?? null;

    const row: FixtureRow = {
      weekNo,
      label,
      kind,
      homeTeamId,
      awayTeamId,

      home: isLabel ? (label ?? "") : teamNameById(homeTeamId, { tbcIfMissing: isNonRegular }),
      away: isLabel ? "" : teamNameById(awayTeamId, { tbcIfMissing: isNonRegular }),

      // Scores now come from the sheet
      homeScore: r.homeScore ?? null,
      awayScore: r.awayScore ?? null,
    };

    if (!byWeek.has(weekNo)) byWeek.set(weekNo, []);
    byWeek.get(weekNo)!.push(row);
  }

  const weeks = Array.from(byWeek.keys()).sort((a, b) => a - b);
  return weeks.map((w) => ({ weekNo: w, rows: byWeek.get(w)! }));
}, [league?.teams, sheetFixtures]);

  // ------- styles (match your vibe) -------
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const finalsLabelStyle: React.CSSProperties = {
  padding: "2px 10px",
  borderTop: "1px solid rgba(0,0,0,0.08)",
  fontSize: 11,          // smaller
  fontWeight: 700,
  textAlign: "center",
  background: "rgba(15,23,42,0.14)", // darker than normal label strip
  color: "#0f172a",
};

const grandFinalLabelStyle: React.CSSProperties = {
  ...finalsLabelStyle,
  background: "rgba(245, 158, 11, 0.28)", // amber/gold tint
  borderTop: "1px solid rgba(245, 158, 11, 0.45)",
  borderBottom: "1px solid rgba(245, 158, 11, 0.45)",
};

const finalsPlaceholderRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: 10,
  padding: "7px 10px",
  borderTop: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
  fontWeight: 600,
  alignItems: "center",
  opacity: 0.85,
  background: "rgba(15,23,42,0.03)",
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

  function Hamburger__render() {
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
          fontSize: 36,
          fontWeight: 900,
          lineHeight: "36px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }
const Hamburger = useStableComponent(Hamburger__render);

  function Header__render() {
    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
        </div>

        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>{leagueName}</div>
      </div>
    );
  }
const Header = useStableComponent(Header__render);

  function Tabs__render() {
    const tabs: LeagueTab[] = ["Standings", "Fixtures", "Results"];
    return (
      <div style={tabBarStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={tabBtn(t === tab)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }
const Tabs = useStableComponent(Tabs__render);

  function MovementCircle__render({ movement }: { movement: "same" | "up" | "down" }) {
  const isUp = movement === "up";
  const isDown = movement === "down";
  const isSame = movement === "same";
  const bg = isUp ? "#22C55E" : isDown ? "#EF4444" : "rgba(0,0,0,0.12)";
  const symbol = isUp ? "▲" : isDown ? "▼" : "=";

  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        color: "white",
        fontWeight: 900,
        fontSize: isSame ? 12 : 10,
        lineHeight: "12px",
      }}
    >
      <span
        style={{
          display: "block",
          transform: isDown ? "translateY(1px)" : "translateY(0)",
        }}
      >
        {symbol}
      </span>
    </span>
  );
}
const MovementCircle = useStableComponent(MovementCircle__render);

  function StandingsTab__render() {
    // horizontally scrollable table
    return (
      <>
        <div style={listBox}>
          <div style={{ padding: "10px 10px", overflowX: "auto" }}>
            <div style={{ minWidth: 560 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 40px 40px 40px 40px 50px 50px 50px 10px",

                  gap: 8,
                  fontSize: 10,
                  fontWeight: 700,
                  opacity: 0.7,
                  paddingBottom: 8,
                }}
              >
                <div>Rk</div>
                <div>Team</div>
                <div>P</div>
                <div>W</div>
                <div>D</div>
                <div>L</div>
                <div>PF</div>
                <div>PA</div>
                <div>PD</div>
                <div style={{ textAlign: "right" }}>Pts</div>
              </div>

              {standings.map((r) => (
                <div
                  key={r.rank}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr 40px 40px 40px 40px 50px 50px 50px 10px",

                    gap: 8,
                    alignItems: "center",
                    padding: "10px 0",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 14, textAlign: "right", fontWeight: 900 }}>{r.rank}</span>
                    <MovementCircle movement={r.movement} />
                  </div>
                  <div style={{ fontWeight: 500 }}>{r.teamName}</div>
                  <div>{r.played}</div>
                  <div>{r.wins}</div>
                  <div>{r.draws}</div>
                  <div>{r.losses}</div>
                  <div>{r.pf}</div>
                  <div>{r.pa}</div>
                  <div>{r.pd}</div>
                  <div style={{ textAlign: "right", fontWeight: 900 }}>{r.pts}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
          League Code: {leagueCode}
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <button
            onClick={() => setModal({ type: "join" })}
            style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
          >
            Join League
          </button>

          <button
            onClick={() => setModal({ type: "create" })}
            style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
          >
            Create New League
          </button>

          <button
            onClick={() => setModal({ type: "settings" })}
            style={outlinePillButton()}
          >
            League Settings
          </button>
        </div>
      </>
    );
  }
const StandingsTab = useStableComponent(StandingsTab__render);

  function FixturesTab__render() {
    const future = fixtures.filter((w) => !isFantasyWeekComplete(w.weekNo));
    return (
      <div style={listBox}>
        {future.map((w: FixtureWeek, idx) => {
  const isPlayoffGroup = w.weekNo > regularWeeks;

  return (

          <div key={w.weekNo} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>
            <div
  style={{
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    background: "rgba(15,23,42,0.08)",   // darker strip
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    letterSpacing: 0.4,
  }}
>
  {roundLabel(w.weekNo)}
</div>

            {w.rows.map((r, i) => {
const isLabelRow = !!r.label;

if (isLabelRow) {
  const isFinalsHeader = isPlayoffsKind(r.kind ?? null);

  return (
    <React.Fragment key={`${w.weekNo}-${i}`}>
      {/* Finals/label header */}
      <div
  style={
    isFinalsHeader
      ? (isGrandFinalHeader(r) ? grandFinalLabelStyle : finalsLabelStyle)
      : {
          padding: "9px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 900,
          textAlign: "center",
          opacity: 0.9,
        }
  }
>
  {r.home}
</div>

      {/* If it's a finals header, show a placeholder matchup under it */}
      {shouldInjectPlaceholder(r) && (
        <div style={finalsPlaceholderRowStyle}>
          <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
          <div style={{ opacity: 0.8, fontWeight: 800 }}>v</div>
          <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
  const isHomeBye = r.home === "BYE";
  const isAwayBye = r.away === "BYE";
  const isBye = isHomeBye || isAwayBye;
  const realTeamName = isHomeBye ? r.away : r.home;
const realTeamId = isHomeBye ? (r.awayTeamId ?? null) : (r.homeTeamId ?? null);
  
if (isBye) {
  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        // background: "rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {realTeamName}
      </div>

      <div
        style={{

          padding: "2px 10px",
          borderRadius: 999,
          background: "rgba(15,23,42,0.08)",
          fontWeight: 700,
          fontSize: 10,
        }}
      >
        BYE
      </div>
    </div>
  );
}

  const realTeam = isHomeBye ? r.away : r.home;
  const played = rowPlayed(r, w.weekNo);

  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: 10,
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        alignItems: "center",
        opacity: isBye ? 0.9 : 1,
      }}
    >
      <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isHomeBye ? realTeam : r.home}
      </div>

      <div style={{ opacity: 0.8, fontWeight: 700 }}>
        {isBye ? "BYE" : "v"}
      </div>

      <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isAwayBye ? realTeam : r.away}
      </div>
    </div>
  );
})}

          </div>
        );
      })}
      </div>
    );
  }
const FixturesTab = useStableComponent(FixturesTab__render);

  function ResultsTab__render() {
    const past = fixtures
  .filter((w) => isFantasyWeekComplete(w.weekNo))
  .slice()
  .reverse();

    return (
      <div style={listBox}>
        {past.map((w, idx) => (
          <div key={w.weekNo} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)" }}>

  {/* Week heading */}
  <div
  style={{
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    textAlign: "center",
    background: "rgba(15,23,42,0.08)",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    letterSpacing: 0.4,
  }}
>
  {roundLabel(w.weekNo)}
</div>

  {/* existing match rows below */}
{w.rows.map((r, i) => {
  const isLabelRow = !!r.label;

if (isLabelRow) {
  const isFinalsHeader = isPlayoffsKind(r.kind ?? null);

  return (
    <React.Fragment key={`${w.weekNo}-${i}`}>
      <div
  style={
    isFinalsHeader
      ? (isGrandFinalHeader(r) ? grandFinalLabelStyle : finalsLabelStyle)
      : {
          padding: "9px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 900,
          textAlign: "center",
          opacity: 0.9,
        }
  }
>
  {r.home}
</div>

      {shouldInjectPlaceholder(r) && (
        <div style={finalsPlaceholderRowStyle}>
          <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
          <div style={{ opacity: 0.8, fontWeight: 800 }}>v</div>
          <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            TBC
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

  const isHomeBye = r.home === "BYE";
  const isAwayBye = r.away === "BYE";
  const isBye = isHomeBye || isAwayBye;

  const played = rowPlayed(r, w.weekNo);

  const realTeamName = isHomeBye ? r.away : r.home;
  const realTeamId = isHomeBye ? (r.awayTeamId ?? null) : (r.homeTeamId ?? null);

  const byePoints =
    isBye && realTeamId ? scoreFromSheet(w.weekNo, realTeamId) : null;

      // ✅ BYE row (same format as Fixtures tab, but includes score)
  if (isBye) {
    return (
      <div
        key={`${w.weekNo}-${i}`}
        style={{
          padding: "8px 10px",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          fontSize: 12,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(15,23,42,0.04)",
        }}
      >
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {realTeamName}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* score chip */}
          <div
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.10)",
              fontWeight: 900,
              fontSize: 10,
            }}
            title="Your score this week"
          >
            {byePoints ?? "—"}
          </div>

          {/* BYE chip */}
          <div
            style={{
              padding: "2px 10px",
              borderRadius: 999,
              background: "rgba(15,23,42,0.08)",
              fontWeight: 700,
              fontSize: 10,
            }}
          >
            BYE
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div
      key={`${w.weekNo}-${i}`}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        gap: 10,
        padding: "7px 10px",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        fontSize: 12,
        fontWeight: 500,
        alignItems: "center",
      }}
    >
      {/* Left side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isHomeBye ? realTeamName : r.home}
        </div>

        <div style={{ fontWeight: 900, textAlign: "right", minWidth: 22 }}>
          {isBye ? (isHomeBye ? byePoints : "—") : (r.homeScore ?? "—")}
        </div>
      </div>

      {/* Middle */}
<div style={{ opacity: 0.8, fontWeight: 700 }}>
  {isBye ? "BYE" : "v"}
</div>

      {/* Right side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div style={{ fontWeight: 900, textAlign: "left", minWidth: 22 }}>
          {isBye ? (isAwayBye ? byePoints : "—") : (r.awayScore ?? "—")}
        </div>

        <div style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isAwayBye ? realTeamName : r.away}
        </div>
      </div>
      
    </div>
  );
})}

          </div>
        ))}
      </div>
    );
  }
const ResultsTab = useStableComponent(ResultsTab__render);

function JoinLeagueModal__render() {
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalOverlay onClose={() => setModal(null)}>
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(to bottom, #0f172a, #2563eb)",
          padding: 14,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          position: "relative",
        }}
      >
        <button
          onClick={() => setModal(null)}
          aria-label="Close"
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            background: "transparent",
            border: "none",
            color: "white",
            fontSize: 20,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ×
        </button>

        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>Join League</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={inputStyle()}
            placeholder="League Code"
          />

          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={inputStyle()}
            placeholder="Team Name"
          />

          {error && (
            <div style={{ marginTop: 4, color: "#FCA5A5", fontSize: 12, fontWeight: 800 }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              
                onClick={async () => {
  const res = await joinLeagueByCode({ code, teamName });
  if (!res.ok) setError(res.error);
  else setModal(null);

              }}
              style={{ ...saveButton(), height: 36, padding: "0 18px" }}
            >
              Join
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
const JoinLeagueModal = useStableComponent(JoinLeagueModal__render);

  function CreateLeagueModal__render() {
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");

  const [draftLocal, setDraftLocal] = useState(() => {
  // default: today + 1 hour
  const now = Date.now();
  return toDatetimeLocal(now + 60 * 60 * 1000);
});

  const [playoffs, setPlayoffs] = useState<PlayoffFormat>("final4");
  const [scoringSystem, setScoringSystem] = useState<"standard" | "alternate" | "custom">("standard");
  const [bonusPoints, setBonusPoints] = useState(true);
  const [customRules, setCustomRules] = useState<ScoringRules>(STANDARD_SCORING);
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalOverlay onClose={() => setModal(null)}>
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(to bottom, #0f172a, #2563eb)",
          padding: 14,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          position: "relative",
        }}
      >
        <button
          onClick={() => setModal(null)}
          aria-label="Close"
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            background: "transparent",
            border: "none",
            color: "white",
            fontSize: 20,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ×
        </button>

        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>Create League</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle()}
            placeholder="League Name"
          />

          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={inputStyle()}
            placeholder="Your Team Name"
          />

          <select
            value={playoffs}
            onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)}
            style={selectStyle()}
          >
            <option value="none">None</option>
            <option value="final2">2 Teams (Final only)</option>
            <option value="final3">3 Teams (Qualifying Final)</option>
            <option value="final4">4 Teams (Semi + Final)</option>
            <option value="final6">6 Teams (Top 2 get a bye)</option>
          </select>

          <select
            value={scoringSystem}
            onChange={(e) => setScoringSystem(e.target.value as "standard" | "alternate" | "custom")}
            style={selectStyle()}
          >
            <option value="standard">Scoring: Standard</option>
            <option value="alternate">Scoring: Alternate</option>
            <option value="custom">Scoring: Custom</option>
          </select>

          {scoringSystem === "custom" ? (
            <div style={{ background: "rgba(255,255,255,0.92)", color: "#0f172a", borderRadius: 12, padding: 10 }}>
              <ScoringEditor value={customRules} onChange={setCustomRules} />
            </div>
          ) : null}

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800 }}>
            <input type="checkbox" checked={bonusPoints} onChange={(e) => setBonusPoints(e.target.checked)} />
            Bonus points (win by 140+ / lose by 40 or less)
          </label>

          <input
  type="datetime-local"
  value={draftLocal}
  onChange={(e) => setDraftLocal(e.target.value)}
  style={inputStyle()}
/>

          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, lineHeight: "14px" }}>
            League Commissioner can change/set draft order in league settings prior to the draft
          </div>

          {error && <div style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 800 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              onClick={async () => {
  const draftAt = parseDatetimeLocal(draftLocal);

  const res = await createLeague({
    name,
    teamName,
    playoffFormat: playoffs,
    draftDateTimeText: draftLocal,
    draftAt,
    scoringSystem,
    bonusPoints,
    ...(scoringSystem === "custom" ? { scoringCustom: customRules } : {}),
  });

  if (!res.ok) setError(res.error);
  else setModal(null);
}}
              style={{ ...saveButton(), height: 36, padding: "0 18px" }}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
const CreateLeagueModal = useStableComponent(CreateLeagueModal__render);

  function pillButton(bg: string): React.CSSProperties {
    return {
      height: 40,
      width: "100%",
      borderRadius: 999,
      background: bg,
      color: "white",
      fontSize: 13,
      fontWeight: 800,
      border: "2px solid rgba(255,255,255,0.85)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
      cursor: "pointer",
    };
  }

  function outlinePillButton(): React.CSSProperties {
    return {
      height: 36,
      width: "100%",
      borderRadius: 999,
      background: "rgba(255,255,255,0.12)",
      color: "white",
      fontSize: 12,
      fontWeight: 800,
      border: "2px solid rgba(255,255,255,0.85)",
      cursor: "pointer",
    };
  }

  // Still booting → show loading
if (!mounted || !leagueHydrated) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Loading…</div>
        </div>
      </div>
    </main>
  );
}

// We have leagues but activeLeagueId hasn't resolved yet → wait one tick
if (!league && (leagues?.length ?? 0) > 0) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Loading…</div>
        </div>
      </div>
    </main>
  );
}

// NOW it's truly no leagues
if (!league) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ borderRadius: 18, background: "rgba(255,255,255,0.35)", padding: 14 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>No active league</div>
          <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12, fontWeight: 700 }}>
            Join a league with a code, or create a new league.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <button
              onClick={() => setModal({ type: "join" })}
              style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
            >
              Join League
            </button>

            <button
              onClick={() => setModal({ type: "create" })}
              style={pillButton("linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))")}
            >
              Create New League
            </button>
          </div>
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues}
        activeLeagueId={activeLeagueId}
        setActiveLeague={setActiveLeague}
        activeItem="League"
      />

      {modal?.type === "join" && <JoinLeagueModal />}
      {modal?.type === "create" && <CreateLeagueModal />}
    </main>
  );
}

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <Header />
        <Tabs />

        {tab === "Standings" && <StandingsTab />}
        {tab === "Fixtures" && <FixturesTab />}
        {tab === "Results" && <ResultsTab />}
      </div>

      <AppMenu
  open={menuOpen}
  onClose={() => setMenuOpen(false)}
  leagues={leagues}
  activeLeagueId={activeLeagueId}
  setActiveLeague={setActiveLeague}
  activeItem="League"
/>

      {modal?.type === "join" && <JoinLeagueModal />}
      {modal?.type === "create" && <CreateLeagueModal />}
      {modal?.type === "settings" && league && (
        <LeagueSettingsModal
          league={league}
          isCreator={isCreator}
          onClose={() => setModal(null)}
          updateLeagueSettings={updateLeagueSettings}
          setDraftOrder={setDraftOrder}
        />
      )}
    </main>
  );
}

function GradientBg() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        background:
          "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
      }}
    />
  );
}
