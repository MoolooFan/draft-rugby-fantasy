// components/dashboard/helpers.ts
// The Dashboard's pure helpers, types and styles (moved out of app/dashboard/page.tsx, 20 Nov
// 2026): ids, points rows, form, records, rosters, the standings, best available players, player
// of the week and jerseys. No page state in here.
import type React from "react";
import type { PlayerCardTab } from "@/components/PlayerCardModal";
import { ladderOrder, tieBreakHolder } from "@/lib/league/ladder";
import { getWeeksSorted, isSheetLabelRow, isSheetPlayableRow, latestCompletedWeekFromSheet, toMs, type SheetFixtureRow } from "@/lib/league/weekHelpers";
import { positionsLabel } from "@/lib/players/positions";
import { CAPTAIN_MULTIPLIER, pointsFromRow } from "@/lib/scoring";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { card as themeCard } from "@/lib/ui/theme";

export type PositionInfo = { posAbbrev?: string | null; secondaryPosAbbrev?: string | null } | null;

export type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Fixtures"
  | "Team Details";

export type DashboardState = "noLeague" | "preDraft" | "postDraft";

export type Movement = "same" | "up" | "down";
export type StandingRow = {
  rank: number;
  teamId: string;
  team: string;
  pts: number;
  movement: Movement;
};

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string; // e.g. CHI
  posAbbrev: string; // e.g. FH
  posName: string; // e.g. Flyhalf
  positions?: string; // e.g. "CE/OB/FH"
  form: number;
  points?: number;
};

export type Modal =
  | null
  | {
      type: "playerCard";
      player: Player;
      ownerTeamId?: string | null;
      teamLabel?: string;
      /** e.g. open on the AI Coach tab from Coach News */
      tab?: PlayerCardTab;
    };

export type AnyFixture = {
  week: number;
  kickoffAt: string | number;
  kickoffMs?: number;
};

export function singularPosLabel(pos: string) {
  const p = String(pos ?? "").trim();

  const map: Record<string, string> = {
    Hookers: "Hooker",
    Prop: "Prop",
    Lock: "Lock",
    Halfback: "Halfback",
    Flyhalf: "Flyhalf",
    "Loose Forward": "Loose Forward",
    Centre: "Centre",
    "Outside Backs": "Outside Back",
  };

  return map[p] ?? p;
}

export function getLiveWeekFromNow(fixtures: AnyFixture[], nowMs: number) {
  if (!fixtures.length) return 1;

  // next fixture that hasn't kicked off yet
  const next = fixtures.find((f) => (f.kickoffMs ?? toMs(f.kickoffAt)) >= nowMs);

  if (next) return next.week;

  // season finished: use last week in fixtures
  const weeks = getWeeksSorted(fixtures);
  return weeks[weeks.length - 1] ?? 1;
}

export function formatDeadline(dtMs: number, timeZone?: string) {
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

export function isSheetRegularRow(r: SheetFixtureRow) {
  const k = String(r.kind ?? "").toLowerCase();
  return !k || k === "regular";
}

export function isSheetMatchRow(r: SheetFixtureRow) {
  // non-label row and has at least one team id (includes BYE)
  if (isSheetLabelRow(r)) return false;
  const home = (r.homeTeamId ?? "").trim();
  const away = (r.awayTeamId ?? "").trim();
  return home !== "" || away !== "";
}

export type TeamRecord = { w: number; l: number; d: number };

export function buildRecordsUpToWeek(rows: SheetFixtureRow[], upToWeek: number) {
  const map = new Map<string, TeamRecord>();
  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, { w: 0, l: 0, d: 0 });
    return map.get(id)!;
  };

  const playable = rows
    .filter(isSheetPlayableRow)
    // win / loss records are the regular season only: finals don't change them
    .filter((r) => String(r.kind ?? "regular").toLowerCase() === "regular")
    .filter((r) => String(r.status ?? "").toLowerCase() === "complete")
    .filter((r) => Number(r.weekFantasy) <= upToWeek)
    .filter((r) => r.homeTeamId && r.awayTeamId && r.homeScore != null && r.awayScore != null);

  for (const m of playable) {
    const home = ensure(m.homeTeamId!);
    const away = ensure(m.awayTeamId!);

    const hs = m.homeScore!;
    const as = m.awayScore!;

    if (hs > as) { home.w += 1; away.l += 1; }
    else if (as > hs) { away.w += 1; home.l += 1; }
    else { home.d += 1; away.d += 1; }
  }

  return map;
}

/** a lineup slot ("prop1", "bench2", or a custom squad's "tightfive1"...: lib/league/squad.ts) */
export type SlotId = string;

export type Lineup = Record<SlotId, any | null>;

export const CAP_MULT = CAPTAIN_MULTIPLIER;

export function effectiveCaptainId(lineup: Lineup | null, captainId: string | null, viceId: string | null) {
  if (!lineup) return null;
  const cap = Object.values(lineup).find((x: any) => x?.id === captainId) ?? null;
  const vice = Object.values(lineup).find((x: any) => x?.id === viceId) ?? null;

  // dashboard doesn’t have minutes logic; we keep it simple:
  // if captain exists in lineup, use captain, else use vice if exists
  if (cap?.id) return cap.id;
  if (vice?.id) return vice.id;
  return captainId;
}

// ✅ Stable fallbacks for Zustand selectors (avoid new refs each render)
export const EMPTY_ARR: any[] = [];
export const NOOP = () => {};

export function normaliseId(x: any) {
  return String(x ?? "")
    .trim()
    .toLowerCase();
}

// Fantasy points for one stat row, using the shared scoring rules (lib/scoring).
// Pass the player so props/hookers get their scrum points.
export function getRoundPointsFromRow(row: any, player?: PositionInfo): number | null {
  if (!row) return null;
  return pointsFromRow(row, player ?? null);
}

export function rowRound(row: any) {
  const v = row?.round ?? row?.Round ?? row?.week ?? row?.Week ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Points mapping for this displayed round
export function rowPlayerId(row: any) {
  return (
    row?.playerId ??
    row?.internalPlayerId ??
    row?.internal_player_id ??
    row?.["Player ID"] ??
    row?.player_id ??
    row?.id ??
    null
  );
}

export function getLatest3FormFromRoundRows(playerId: string, roundRows: any[], player?: PositionInfo): number {
  const want = normaliseId(playerId);

  const rows = (roundRows ?? [])
    .filter((r: any) => normaliseId(rowPlayerId(r)) === want)
    .map((r: any) => ({
      round: rowRound(r),
      points: getRoundPointsFromRow(r, player) ?? 0,
    }))
    .filter((x: any) => Number.isFinite(x.round) && x.round > 0 && Number.isFinite(x.points))
    .sort((a: any, b: any) => b.round - a.round);

  const latest3: Array<{ round: number; points: number }> = [];
  const seenRounds = new Set<number>();

  for (const r of rows) {
    if (seenRounds.has(r.round)) continue;
    seenRounds.add(r.round);
    latest3.push(r);
    if (latest3.length === 3) break;
  }

  if (!latest3.length) return 0;

  const sum = latest3.reduce((acc, r) => acc + r.points, 0);
  return sum / latest3.length;
}


// -----------------------
// Styles
// -----------------------
export const cardStyle: React.CSSProperties = { ...themeCard };

export const primaryButton: React.CSSProperties = {
  height: 36,
  width: "100%",
  borderRadius: 999,
  background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
  color: "white",
  fontSize: 13,
  fontWeight: 600,
  border: "2px solid rgba(255,255,255,0.85)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
  cursor: "pointer",
};

export const secondaryButton: React.CSSProperties = {
  height: 36,
  width: "100%",
  borderRadius: 999,
  background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
  color: "white",
  fontSize: 12,
  fontWeight: 600,
  border: "2px solid rgba(255,255,255,0.85)",
  cursor: "pointer",
};

// Small square icon buttons (match Transactions look/feel)
export const iconBtnBase: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.18)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.22)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

export const iconGlyphStyle: React.CSSProperties = {
  lineHeight: "1",
  transform: "translateY(-1px)", // <-- the key: fixes “looks low” on ★ and +
  display: "block",
};


export const JERSEYS: Record<string, { angle?: string; front?: string; single?: string }> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.webp", front: "/images/jerseys/BLUJerseyFront.webp" },
  BRU: { single: "/images/jerseys/BRUJersey.webp" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.webp", front: "/images/jerseys/CHIJerseyFront.webp" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.webp", front: "/images/jerseys/CRUJerseyFront.webp" },
  DRU: { single: "/images/jerseys/DRUJersey.webp" },
  FOR: { single: "/images/jerseys/FORJersey.webp" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.webp", front: "/images/jerseys/HIGJerseyFront.webp" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.webp", front: "/images/jerseys/HURJerseyFront.webp" },
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.webp", front: "/images/jerseys/MOPJerseyFront.webp" },
  RED: { single: "/images/jerseys/REDJersey.webp" },
  WAR: { single: "/images/jerseys/WARJersey.webp" },
};

export const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.webp";

export function jerseySrcForTeamCode(teamCode: string | null | undefined, prefer: "angle" | "front" = "angle") {
  const code = normalizeTeamCode(teamCode);
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

export function fullTeamNameFromCode(teamCode: string | null | undefined) {
  const code = normalizeTeamCode(teamCode);

  const MAP: Record<string, string> = {
    BLU: "Blues",
    BRU: "Brumbies",
    CHI: "Chiefs",
    CRU: "Crusaders",
    DRU: "Drua",
    FOR: "Force",
    HIG: "Highlanders",
    HUR: "Hurricanes",
    MOA: "Moana",
    RED: "Reds",
    WAR: "Waratahs",
  };

  return MAP[code] ?? (teamCode ? String(teamCode) : "TBC");
}

// ---- Rosters ----

export function rosterDataToLineup(data: any): Lineup | null {
  if (!data) return null;
  if (data.prop1 || data.hooker1 || data.bench1) return data as Lineup;
  if (data.lineup && (data.lineup.prop1 || data.lineup.bench1)) return data.lineup as Lineup;
  return null;
}

export function collectPlayerIdsDeep(x: any, out: Set<string>) {
  if (!x) return;

  // id string/number
  if (typeof x === "string" || typeof x === "number") {
    const s = String(x).trim();
    if (s) out.add(s.toLowerCase());
    return;
  }

  // array
  if (Array.isArray(x)) {
    for (const it of x) collectPlayerIdsDeep(it, out);
    return;
  }

  // object
  if (typeof x === "object") {
    // common shapes
    const pid = x.id ?? x.playerId ?? x.player_id;
    if (pid != null) {
      const s = String(pid).trim();
      if (s) out.add(s.toLowerCase());
    }

    for (const v of Object.values(x)) collectPlayerIdsDeep(v, out);
  }
}

/** Every player id on a roster (the slot-lineup shape, or a deep scan of any other). */
export function collectPlayerIdsFromRoster(raw: any): Set<string> {
  const out = new Set<string>();

  // preferred: slot-lineup shape
  const lineup = rosterDataToLineup(raw) ?? rosterDataToLineup(raw?.data) ?? rosterDataToLineup(raw?.lineup) ?? null;

  if (lineup) {
    for (const p of Object.values(lineup) as any[]) {
      if (p?.id) out.add(normaliseId(p.id));
    }
    return out;
  }

  // fallback: deep scan any other structure
  collectPlayerIdsDeep(raw, out);
  return out;
}

export function calcFantasyPoints(row: any, player?: PositionInfo): number {
  return getRoundPointsFromRow(row, player) ?? 0;
}

export function findPlayerMetaById(allPlayersAny: any[], playerId: string) {
  const want = normaliseId(playerId);
  if (!want) return null;

  return (
    (allPlayersAny ?? []).find((p: any) => {
      const pid = p?.id ?? p?.playerId ?? p?.player_id ?? p?.["Player ID"] ?? null;
      return pid != null && normaliseId(pid) === want;
    }) ?? null
  );
}

// ---- Standings (from the league's fixtures and results) ----

type StandingCalc = {
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
};

function buildStandingsFromResults(teams: Array<{ id: string; name: string }>, sheetFixtures: SheetFixtureRow[], uptoWeekInclusive: number): StandingCalc[] {
  const base = new Map<string, StandingCalc>();

  for (const t of teams) {
    base.set(t.id, { teamId: t.id, teamName: t.name, played: 0, wins: 0, draws: 0, losses: 0, pf: 0, pa: 0, pd: 0, pts: 0 });
  }

  const rows = sheetFixtures
    .filter((r) => isSheetMatchRow(r))
    .filter((r) => isSheetRegularRow(r))
    .filter((r) => String(r.status ?? "").toLowerCase() === "complete")
    .filter((r) => Number(r.weekFantasy) <= uptoWeekInclusive);

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

    // bonus ladder points (if the league uses them) and the Shield's ladder rewards, as on the League page
    home.pts += Number(m.homeBonus ?? 0) + Number(m.homeShieldPts ?? 0);
    away.pts += Number(m.awayBonus ?? 0) + Number(m.awayShieldPts ?? 0);

    home.pd = home.pf - home.pa;
    away.pd = away.pf - away.pa;
  }

  return Array.from(base.values());
}

/** The ladder (top 10) with each team's movement since the round before. */
export function buildStandings(teams: Array<{ id: string; name: string }>, sheetFixtures: SheetFixtureRow[]): StandingRow[] {
  // standings should advance only based on completed REGULAR weeks
  const playedNow = sheetFixtures.length ? latestCompletedWeekFromSheet(sheetFixtures.filter(isSheetRegularRow)) : 0;
  const playedPrev = Math.max(0, playedNow - 1);

  const curr = buildStandingsFromResults(teams, sheetFixtures, playedNow);
  const prev = buildStandingsFromResults(teams, sheetFixtures, playedPrev);

  // level on points: the Shield holder first, if the league uses that tie-break (lib/league/ladder.ts)
  const holderUpTo = (upto: number) =>
    tieBreakHolder(
      sheetFixtures
        .filter((r) => Number(r.weekFantasy) <= upto && isSheetRegularRow(r) && isSheetMatchRow(r) && String(r.status ?? "").toLowerCase() === "complete")
        .map((r) => ({ week: Number(r.weekFantasy), holder: r.shieldHolderAfter ?? null }))
    );
  const sortRows = (arr: StandingCalc[], upto: number) =>
    arr.slice().sort(ladderOrder<StandingCalc>(holderUpTo(upto), (r) => r.teamId, (r) => r.pts, (r) => r.pf, (r) => r.pd));

  const currSorted = sortRows(curr, playedNow);
  const prevSorted = sortRows(prev, playedPrev);

  const prevRankById = new Map(prevSorted.map((r, i) => [r.teamId, i + 1]));

  return currSorted
    .map((r, i) => {
      const rank = i + 1;
      const prevRank = prevRankById.get(r.teamId);

      let movement: Movement = "same";
      if (prevRank != null) {
        if (rank < prevRank) movement = "up";
        else if (rank > prevRank) movement = "down";
      }

      return { rank, teamId: r.teamId, team: r.teamName, pts: r.pts, movement };
    })
    .slice(0, 10); // safety cap for dashboard
}

// ---- Player lists ----

/** The 10 best players nobody owns, by form (average of their last 3 rounds). */
export function bestAvailable(allPlayers: any[], rosteredIds: Set<string>, statRows: any[]): Player[] {
  const src = Array.isArray(allPlayers) ? allPlayers : [];

  const mapped: Player[] = src
    .map((p: any) => {
      const id = String(p.id ?? p.playerId ?? "").trim();
      if (!id) return null;

      const firstName = String(p.firstName ?? p.first_name ?? "").trim();
      const lastName = String(p.lastName ?? p.last_name ?? "").trim();

      const teamCode = String(p.teamCode ?? p.team ?? p.team_code ?? "").trim() || "TBC";
      const posAbbrev = String(p.posAbbrev ?? p.pos ?? p.position ?? "").trim() || "—";
      const posNamePrimary = String(p.posName ?? p.positionName ?? "").trim() || posAbbrev;

      // try common secondary fields
      const pos2 = String(p.pos2 ?? p.secondaryPos ?? p.secondary_position ?? p.secondaryPosition ?? "").trim();

      const posName = pos2 ? `${posNamePrimary} / ${pos2}` : posNamePrimary;

      const form = getLatest3FormFromRoundRows(id, statRows, p);

      return {
        id,
        firstName: firstName || "?",
        lastName: lastName || "?",
        teamCode,
        posAbbrev,
        posName,
        positions: positionsLabel(p),
        form: Number.isFinite(form) ? form : 0,
      } as Player;
    })
    .filter(Boolean) as Player[];

  // "Available" = not currently rostered by ANY team in the league
  const available = mapped.filter((p) => !rosteredIds.has(String(p.id).toLowerCase()));

  // Sort by form desc, then name as tie-break
  available.sort((a, b) => {
    if (b.form !== a.form) return b.form - a.form;
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return available.slice(0, 10);
}

/** The round's top scorer (all of them if tied). */
export function playersOfTheWeek(allPlayers: any[], weekPointsByPlayerId: Map<string, number>, displayWeek: number): Player[] {
  if (!displayWeek) return [];
  if (!weekPointsByPlayerId || weekPointsByPlayerId.size === 0) return [];

  // find max points this round
  let maxPts = -Infinity;
  for (const pts of weekPointsByPlayerId.values()) {
    if (typeof pts === "number" && pts > maxPts) maxPts = pts;
  }
  if (!Number.isFinite(maxPts) || maxPts <= 0) return [];

  // all playerIds with maxPts
  const topIds: string[] = [];
  for (const [pid, pts] of weekPointsByPlayerId.entries()) {
    if (pts === maxPts) topIds.push(pid);
  }
  if (!topIds.length) return [];

  const src = Array.isArray(allPlayers) ? allPlayers : [];

  const mapped: Player[] = topIds
    .map((pidLower) => {
      const meta = findPlayerMetaById(src, pidLower);
      // if we can't find metadata, still show something sane
      const firstName = String(meta?.firstName ?? meta?.first_name ?? "?").trim() || "?";
      const lastName = String(meta?.lastName ?? meta?.last_name ?? "?").trim() || "?";
      const teamCode = String(meta?.teamCode ?? meta?.team ?? meta?.team_code ?? "TBC").trim() || "TBC";
      const posAbbrev = String(meta?.posAbbrev ?? meta?.pos ?? meta?.position ?? "—").trim() || "—";
      const posName = String(meta?.posName ?? meta?.positionName ?? posAbbrev).trim() || posAbbrev;

      return {
        id: String(meta?.id ?? meta?.playerId ?? meta?.player_id ?? pidLower),
        firstName,
        lastName,
        teamCode,
        posAbbrev,
        posName,
        positions: meta ? positionsLabel(meta) : posAbbrev,
        form: 0,
        points: maxPts,
      } as Player;
    })
    .filter(Boolean);

  // stable ordering for ties
  mapped.sort((a, b) => {
    const an = `${a.lastName} ${a.firstName}`.toLowerCase();
    const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
    return an.localeCompare(bn);
  });

  return mapped;
}
