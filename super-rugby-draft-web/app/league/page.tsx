"use client";

import React, { useEffect, useMemo, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore, loadMyLeagues } from "@/lib/league/store";

import { AppMenu } from "@/components/AppMenu";
import { usePlayersStore } from "@/lib/players/store";
import { CAPTAIN_MULTIPLIER, pointsFromRow } from "@/lib/scoring";

import { currentSeasonYear, fixturesByFantasyWeek } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import type { Fixture } from "@/lib/fixtures/types";
import { useStableComponent } from "@/lib/hooks/useStableComponent";
import { toMs, pickValue } from "@/lib/league/weekHelpers";
import { ladderOrder, tieBreakHolder } from "@/lib/league/ladder";
import { LeagueSettingsModal } from "./LeagueSettingsModal";
import { ShieldTab } from "@/components/ShieldTab";
import { PowerTab } from "@/components/PowerTab";
import { useTeamProfileStore } from "@/lib/league/teamProfileStore";
import type { PowerTable } from "@/lib/league/powerServer";
import { formatOdds } from "@/lib/league/odds";
import { StandingsTab } from "./StandingsTab";
import { FixturesTab } from "./FixturesTab";
import { ResultsTab } from "./ResultsTab";
import { JoinLeagueModal } from "./JoinLeagueModal";
import { CreateLeagueModal } from "./CreateLeagueModal";
import { pillButton, type FixtureRow, type FixtureWeek, type StandingRow } from "./fixtureRows";

type LeagueTab = "Standings" | "Fixtures" | "Results" | "Power" | "Shield";
type Modal =
  | null
  | { type: "join" }
  | { type: "create" }
  | { type: "settings" };

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
  homeShieldPts?: number; // the Shield's ladder rewards (lib/league/shield.ts)
  awayShieldPts?: number;
  shieldHolderAfter?: string | null; // who held the Shield after this game (tie-break reward only)
};

const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);
// weekly crown / spoon (E6): only the most recent finalised round's - they move each week
const [latestAward, setLatestAward] = useState<{ week: number; crown: string[]; spoon: string[] } | null>(null);
// tap a team: its profile pop-up (components/TeamProfileModal.tsx)
const openTeam = useTeamProfileStore((s) => s.openTeam);

useEffect(() => {
  if (!league?.id) return;

  const season = currentSeasonYear();
  fetch(`/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(league.id)}`)
    .then((r) => r.json())
    .then((j) => {
      if (j?.ok) {
        setSheetFixtures(j.rows ?? []);
        setLatestAward(j.awards?.latest ?? null);
      } else console.error("fixtures fetch failed", j?.error);
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

  // E8: restart the league for the new season
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);
  async function restartLeague() {
    if (!league?.id || restarting) return;
    if (!window.confirm(`Start ${league.name} again for ${currentSeasonYear()}?`)) return;
    setRestarting(true);
    setRestartMsg(null);
    try {
      const res = await fetch("/api/leagues/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leagueId: league.id }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) {
        setRestartMsg(j?.error ?? "Couldn't start the new season");
        return;
      }
      setActiveLeague(j.leagueId);
      await loadMyLeagues();
      setRestartMsg(`Done! Share the new join code: ${j.code}`);
    } catch {
      setRestartMsg("Couldn't start the new season");
    } finally {
      setRestarting(false);
    }
  }

  const updateLeagueSettings = useLeagueStore((s) => s.updateLeagueSettings);
  const setDraftOrder = useLeagueStore((s) => s.setDraftOrder);

  const [tab, setTab] = useState<LeagueTab>("Standings");
  // ?tab=Power (the dashboard's "View Power Rankings" link) opens that tab
  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want === "Power" || want === "Fixtures" || want === "Results" || want === "Shield") setTab(want);
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const leagueName = league?.name ?? "League";
  const leagueCode = league?.code ?? "—";

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

function buildStandingsFromResults(uptoWeekInclusive: number): Omit<StandingRow, "rank" | "movement" | "moved">[] {
  const teams = league?.teams ?? [];
  const base = new Map<string, Omit<StandingRow, "rank" | "movement" | "moved">>();

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
  // the Shield's ladder points (defence / taking it), if the league uses them
  home.pts += Number(m.homeShieldPts ?? 0);
  away.pts += Number(m.awayShieldPts ?? 0);

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

  // level on points: the Shield holder first, if the league uses that tie-break (lib/league/ladder.ts)
  const holderUpTo = (upto: number) =>
    tieBreakHolder(
      sheetFixtures
        .filter((r) => Number(r.weekFantasy) <= upto && isSheetRegularRow(r) && !isSheetLabelRow(r) && String(r.status ?? "").toLowerCase() === "complete")
        .map((r) => ({ week: Number(r.weekFantasy), holder: r.shieldHolderAfter ?? null }))
    );
  const sortRows = (arr: any[], upto: number) =>
    arr.slice().sort(ladderOrder<{ teamId: string; pts: number; pf: number; pd: number }>(holderUpTo(upto), (r) => r.teamId, (r) => r.pts, (r) => r.pf, (r) => r.pd));

  const currSorted = sortRows(curr, playedNow);
  const prevSorted = sortRows(prev, playedPrev);

  const prevRankById = new Map(prevSorted.map((r, i) => [r.teamId, i + 1]));

  return currSorted.map((r, i) => {
    const rank = i + 1;
    const prevRank = prevRankById.get(r.teamId);

    let movement: "same" | "up" | "down" = "same";
    if (prevRank != null) {
      if (rank < prevRank) movement = "up";
      else if (rank > prevRank) movement = "down";
    }

    return { rank, ...r, movement, moved: prevRank != null ? prevRank - rank : 0 };
  });
}, [sheetFixtures, league?.teams]);

// Each team's chance of making the playoffs, at the end of the standings (Ethan, 19 Nov 2026): the
// rest of the season simulated (lib/league/powerServer.ts, the same numbers as Power Rankings)
const [odds, setOdds] = useState<{ leagueId: string; table: PowerTable } | null>(null);
const oddsLeagueId = league?.id ?? null;
useEffect(() => {
  if (!oddsLeagueId) return;
  let live = true;
  fetch(`/api/leagues/power?leagueId=${encodeURIComponent(oddsLeagueId)}`, { cache: "no-store", credentials: "include" })
    .then((r) => r.json())
    .then((j) => live && j?.ok && setOdds({ leagueId: oddsLeagueId, table: j.power as PowerTable }))
    .catch(() => {});
  return () => {
    live = false;
  };
}, [oddsLeagueId]);
const oddsTable = odds && odds.leagueId === oddsLeagueId ? odds.table : null;
const showOdds = !!oddsTable && oddsTable.simulated && oddsTable.finalsSize > 0;
const playoffOdds = (teamId: string) => {
  const o = oddsTable?.rows.find((x) => x.teamId === teamId);
  return o ? formatOdds(o.playoffPct, { yes: o.clinched, no: o.eliminated }) : "–";
};

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
  const card35: React.CSSProperties = { ...themeCard, padding: undefined };

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
    fontWeight: 700,
    cursor: "pointer",
  });

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
          color: "inherit",
          fontSize: 36,
          fontWeight: 700,
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

        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>{leagueName}</div>
      </div>
    );
  }
const Header = useStableComponent(Header__render);

  function Tabs__render() {
    const tabs: LeagueTab[] = ["Standings", "Fixtures", "Results", "Power", ...(league?.shield?.enabled || league?.shield?.holderTeamId ? (["Shield"] as LeagueTab[]) : [])];
    return (
      <div style={tabBarStyle}>
        <div style={{ display: "grid", gridTemplateColumns: tabs.map((t) => (t === "Power" ? "1.6fr" : "1fr")).join(" ") }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{ ...tabBtn(t === tab), padding: "0 4px", whiteSpace: "nowrap" }}>
              {t === "Power" ? "Power Rankings" : t}
            </button>
          ))}
        </div>
      </div>
    );
  }
const Tabs = useStableComponent(Tabs__render);

  // Still booting → show loading
if (!mounted || !leagueHydrated) {
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <GradientBg />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px" }}>
        <div style={{ ...themeCard }}>
          <div style={{ fontWeight: 700 }}>Loading…</div>
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
        <div style={{ ...themeCard }}>
          <div style={{ fontWeight: 700 }}>Loading…</div>
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
        <div style={{ marginBottom: 10 }}>
          <Hamburger />
        </div>
        <div style={{ ...themeCard }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>No active league</div>
          <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12, fontWeight: 500 }}>
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

      {modal?.type === "join" && <JoinLeagueModal onClose={() => setModal(null)} />}
      {modal?.type === "create" && <CreateLeagueModal onClose={() => setModal(null)} />}
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

        {tab === "Standings" && (
          <StandingsTab
            league={league}
            leagueName={leagueName}
            leagueCode={leagueCode}
            standings={standings}
            latestAward={latestAward}
            showOdds={showOdds}
            playoffOdds={playoffOdds}
            openTeam={openTeam}
            isCreator={isCreator}
            onOpenModal={(type) => setModal({ type })}
            restartLeague={restartLeague}
            restarting={restarting}
            restartMsg={restartMsg}
          />
        )}
        {tab === "Fixtures" && (
          <FixturesTab league={league} fixtures={fixtures} regularWeeks={regularWeeks} isFantasyWeekComplete={isFantasyWeekComplete} rowPlayed={rowPlayed} />
        )}
        {tab === "Results" && (
          <ResultsTab fixtures={fixtures} isFantasyWeekComplete={isFantasyWeekComplete} rowPlayed={rowPlayed} scoreFromSheet={scoreFromSheet} />
        )}
        {tab === "Power" && league ? <PowerTab leagueId={league.id} teams={(league.teams ?? []) as never} /> : null}
        {tab === "Shield" && league ? <ShieldTab leagueId={league.id} teams={(league.teams ?? []) as never} /> : null}
      </div>

      <AppMenu
  open={menuOpen}
  onClose={() => setMenuOpen(false)}
  leagues={leagues}
  activeLeagueId={activeLeagueId}
  setActiveLeague={setActiveLeague}
  activeItem="League"
/>

      {modal?.type === "join" && <JoinLeagueModal onClose={() => setModal(null)} />}
      {modal?.type === "create" && <CreateLeagueModal onClose={() => setModal(null)} />}
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
