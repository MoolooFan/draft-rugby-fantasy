// components/matchup/helpers.ts
// The Matchup page's pure helpers and types (moved out of app/matchup/page.tsx, 20 Nov 2026):
// ids, points rows, jerseys, saved lineups, the league's fixtures (records, streaks, weeks) and
// rosters. No page state in here.
import { useNow } from "@/lib/hooks/useNow";
import type { CSSProperties } from "react";
import type { Fixture } from "@/lib/fixtures/types";
import { pickValue } from "@/lib/league/weekHelpers";
import { formatStatCount, isFrontRow, pointsBreakdown, pointsFromRow, statCountsFromRow } from "@/lib/scoring";
import { JERSEYS } from "@/lib/teams/images";

export function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function exactId(x: any) {
  return String(x ?? "").trim().toLowerCase();
}

export function rowPlayerId(row: any) {
  return pickValue(row, ["playerId", "Player ID", "player_id", "id"]);
}

export function rowRound(row: any) {
  const v = pickValue(row, ["round", "Round", "week", "Week"]);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Stats are raw counts; the shared scoring rules (lib/scoring) turn them into fantasy points.
export function calcFantasyPoints(
  row: any,
  player: Pick<Player, "posAbbrev" | "secondaryPosAbbrev"> | null
): number {
  return pointsFromRow(row, player);
}

// Build breakdown rows for PointsBreakdownModal (matches Row: { label, right })
export function buildBreakdownRows(row: any, player: Player | null): Array<{ label: string; right?: string; count?: string }> {
  return pointsBreakdown(statCountsFromRow(row), isFrontRow(player)).map((b) => ({
    label: b.stat.header,
    count: formatStatCount(b.stat.key, b.count),
    right: String(b.points),
  }));
}

/**
 * Your Player currently uses `teamCode` for fixture matching in some places
 * (sometimes a full team name), and in other places you use abbreviations.
 * This makes jersey lookup tricky, so we normalize to a 3-letter code.
 */
export function normalizeTeamCode(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const upper = s.toUpperCase();

  // ✅ Canonicalise Moana early (must be BEFORE JERSEYS check)
if (upper === "MOP" || upper === "MOA" || upper === "MOANA") return "MOA";

  // Already a valid code?
  if (JERSEYS[upper]) return upper;

  // Common name -> code fallbacks (edit these names to match your fixtures JSON)
  const NAME_TO_CODE: Record<string, string> = {
    BLUES: "BLU",
    BLUESRUGBY: "BLU",

    BRUMBIES: "BRU",

    CHIEFS: "CHI",

    CRUSADERS: "CRU",

    DRUA: "DRU",
    FIJIAN_DRUA: "DRU",
    FIJIANDRUA: "DRU",

    FORCE: "FOR",
    WESTERN_FORCE: "FOR",
    WESTERNFORCE: "FOR",

    HIGHLANDERS: "HIG",

    HURRICANES: "HUR",

    MOA: "MOA",
    MOP: "MOA",
    MOANA: "MOA",
    MOANA_PASIFIKA: "MOA",
    MOANAPASIFIKA: "MOA",

    REDS: "RED",
    QUEENSLAND_REDS: "RED",
    QUEENSLANDREDS: "RED",

    WARATAHS: "WAR",
    NSW_WARATAHS: "WAR",
    NSWWARATAHS: "WAR",
  };

  // Normalize spaces/underscores to help matching
  const key = upper.replace(/\s+/g, "_").replace(/[^A-Z_]/g, "");
  if (NAME_TO_CODE[key]) return NAME_TO_CODE[key];

  // Last fallback: first 3 letters (only if it exists in JERSEYS)
  const guess = upper.slice(0, 3);
  return JERSEYS[guess] ? guess : null;
}

export function jerseySrcForTeam(
  code: string | null,
  prefer: "angle" | "front" = "angle"
): string | null {
  if (!code) return null;
  const j = JERSEYS[code];
  if (!j) return null;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? null;
  return j.front ?? j.single ?? j.angle ?? null;
}

export function jerseySrcForPlayer(
  p: { teamCode: string } | null,
  prefer: "angle" | "front" = "angle"
): string | null {
  const code = normalizeTeamCode(p?.teamCode);
  return jerseySrcForTeam(code, prefer);
}

export type TeamRecord = { w: number; l: number; d: number };
export type Streak = { type: "W" | "L"; n: number } | null;

// --- Types (match your Team Selection page) ---
/** a lineup slot ("prop1", "bench2", or a custom squad's "tightfive1"...: lib/league/squad.ts) */
export type SlotId = string;

export type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string | null;
  posName: string;
  secondaryPosName?: string | null;
};

export type Lineup = Record<SlotId, Player | null>;

export type LockedSnapshot = {
  week: number;
  teamId: string;
  lockedAtMs: number;
  lineup: Lineup;
  captainId: string | null;
  viceId: string | null;
};

export type AnyFixture = Fixture & {
  id: string;
  week: number;
  kickoffAt: string | number;
  status?: string;
  homeTeam?: string;
  awayTeam?: string;
  homeScore?: number | null;
  awayScore?: number | null;
};

export function isFixtureComplete(f: AnyFixture) {
  const s = (f.status ?? "").toLowerCase();

  // your fixtures-2026.json uses "final"
  if (s === "final" || s === "complete") return true;
  if (s === "live") return false; // a live score isn't a result yet

  // still treat it as complete if both scores exist
  if (f.homeScore != null && f.awayScore != null) return true;

  return false;
}

// Storage keys (must match Team Selection page)
export function matchupSnapshotKey(leagueId: string | null, week: number, teamId: string | null) {
  return `mu_snapshot_${leagueId ?? "no-league"}_wk${week}_${teamId ?? "no-team"}`;
}

// ---- Team Selection localStorage keys (must match Team Selection page) ----
export function teamSelectionLineupKey(leagueId: string | null, teamId: string | null) {
  return `ts_lineup_${leagueId ?? "no-league"}_${teamId ?? "no-team"}`;
}

export function teamSelectionCapsBase(leagueId: string | null, teamId: string | null) {
  return `ts_caps_${leagueId ?? "no-league"}_${teamId ?? "no-team"}`;
}

export function readTeamSelectionLineup(leagueId: string | null, teamId: string | null): Lineup | null {
  if (typeof window === "undefined") return null;
  if (!leagueId || !teamId) return null;

  const raw = window.localStorage.getItem(teamSelectionLineupKey(leagueId, teamId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // basic shape check (prevents accidentally reading roster shapes)
    const ok =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).some((k) => /^[a-z]+\d+$/.test(k)); // slot keys (any league's squad)

    return ok ? (parsed as Lineup) : null;
  } catch {
    return null;
  }
}

export function readTeamSelectionCaps(leagueId: string | null, teamId: string | null) {
  if (typeof window === "undefined") return { captainId: null as string | null, viceId: null as string | null };
  if (!leagueId || !teamId) return { captainId: null, viceId: null };

  const base = teamSelectionCapsBase(leagueId, teamId);
  const captainId = window.localStorage.getItem(`${base}_captain`);
  const viceId = window.localStorage.getItem(`${base}_vice`);
  return { captainId: captainId || null, viceId: viceId || null };
}

export function teamSelectionFallbackSnapshot(
  leagueId: string | null,
  displayWeek: number,
  teamId: string | null,
  mounted: boolean
): LockedSnapshot | null {
  if (!mounted) return null;
  if (typeof window === "undefined") return null;
  if (!leagueId || !teamId) return null;
  if (displayWeek <= 0) return null;

  const lineup = readTeamSelectionLineup(leagueId, teamId);
  if (!lineup) return null;

  const { captainId, viceId } = readTeamSelectionCaps(leagueId, teamId);
  return { week: displayWeek, teamId, lockedAtMs: 0, lineup, captainId, viceId };
}

/** 0 on the server and first pass (so they match), then the time, every `ms` (lib/hooks/useNow.ts). */
export function useNowTick(ms = 1000) {
  return useNow(ms);
}

// ---- The league's fantasy fixtures (/api/fixtures/leagueMatches): records, streaks, weeks ----

export type SheetFixtureRow = {
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

export function isSheetLabelRow(r: SheetFixtureRow) {
  return !!r.label || String(r.kind ?? "").toLowerCase() === "label";
}

export function isCompletedPlayableRow(r: SheetFixtureRow) {
  if (isSheetLabelRow(r)) return false;
  const st = String(r.status ?? "").toLowerCase();
  if (st !== "complete") return false;
  // Needs 2 teams to count as a match
  if (!r.homeTeamId || !r.awayTeamId) return false;
  // Needs scores to determine W/L/D
  if (r.homeScore == null || r.awayScore == null) return false;
  return true;
}

export function outcomeForTeam(match: SheetFixtureRow, teamId: string): "W" | "L" | "D" | null {
  const homeId = match.homeTeamId!;
  const awayId = match.awayTeamId!;
  const hs = match.homeScore!;
  const as = match.awayScore!;

  if (teamId !== homeId && teamId !== awayId) return null;

  if (hs === as) return "D";
  const teamIsHome = teamId === homeId;
  const teamWon = teamIsHome ? hs > as : as > hs;
  return teamWon ? "W" : "L";
}

export function isSheetPlayableRow(r: SheetFixtureRow) {
  // “playable” = an actual matchup row (regular/playoffs/consolation), not the header label rows
  return !isSheetLabelRow(r);
}

function isFantasyWeekCompleteFromSheet(sheetFixtures: SheetFixtureRow[], weekNo: number) {
  const rows = sheetFixtures.filter((r) => Number(r.weekFantasy) === weekNo && isSheetPlayableRow(r));
  if (rows.length === 0) return false;
  return rows.every((r) => String(r.status ?? "").toLowerCase() === "complete");
}

function playableWeeks(sheetFixtures: SheetFixtureRow[]) {
  return Array.from(
    new Set(
      sheetFixtures
        .filter(isSheetPlayableRow)
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);
}

export function latestCompletedWeekFromSheet(sheetFixtures: SheetFixtureRow[]) {
  let latest = 0;
  for (const w of playableWeeks(sheetFixtures)) {
    if (isFantasyWeekCompleteFromSheet(sheetFixtures, w)) latest = w;
  }
  return latest;
}

/** current week = first non-complete playable week */
export function currentWeekFromSheet(sheetFixtures: SheetFixtureRow[]) {
  for (const w of playableWeeks(sheetFixtures)) {
    if (!isFantasyWeekCompleteFromSheet(sheetFixtures, w)) return w;
  }
  // if everything complete, fallback to latest complete
  return latestCompletedWeekFromSheet(sheetFixtures) || 1;
}

/** Completed regular-season matches up to lastCompletedWeek (finals don't change records or streaks). */
function countedMatches(sheetFixtures: SheetFixtureRow[], lastCompletedWeek: number) {
  return sheetFixtures
    .filter(isCompletedPlayableRow)
    .filter((r) => String(r.kind ?? "regular").toLowerCase() === "regular")
    .filter((r) => Number(r.weekFantasy) <= lastCompletedWeek);
}

export function teamRecords(sheetFixtures: SheetFixtureRow[], lastCompletedWeek: number) {
  const map = new Map<string, TeamRecord>();
  const ensure = (id: string) => {
    if (!map.has(id)) map.set(id, { w: 0, l: 0, d: 0 });
    return map.get(id)!;
  };

  for (const m of countedMatches(sheetFixtures, lastCompletedWeek)) {
    const hs = m.homeScore!;
    const as = m.awayScore!;
    const home = ensure(m.homeTeamId!);
    const away = ensure(m.awayTeamId!);

    if (hs > as) { home.w += 1; away.l += 1; }
    else if (as > hs) { away.w += 1; home.l += 1; }
    else { home.d += 1; away.d += 1; }
  }

  return map;
}

export function teamStreaks(sheetFixtures: SheetFixtureRow[], lastCompletedWeek: number) {
  const map = new Map<string, Streak>();

  // each team's results in week order
  const rows = countedMatches(sheetFixtures, lastCompletedWeek)
    .slice()
    .sort((a, b) => Number(a.weekFantasy) - Number(b.weekFantasy));

  const resultsByTeam = new Map<string, Array<"W" | "L" | "D">>();
  const push = (teamId: string, res: "W" | "L" | "D") => {
    if (!resultsByTeam.has(teamId)) resultsByTeam.set(teamId, []);
    resultsByTeam.get(teamId)!.push(res);
  };

  for (const m of rows) {
    const homeRes = outcomeForTeam(m, m.homeTeamId!);
    const awayRes = outcomeForTeam(m, m.awayTeamId!);
    if (homeRes) push(m.homeTeamId!, homeRes);
    if (awayRes) push(m.awayTeamId!, awayRes);
  }

  for (const [teamId, arr] of resultsByTeam.entries()) {
    if (!arr.length) { map.set(teamId, null); continue; }

    // a draw ends a streak: shown as (-)
    const last = arr[arr.length - 1];
    if (last === "D") { map.set(teamId, null); continue; }

    let n = 1;
    for (let i = arr.length - 2; i >= 0; i--) {
      if (arr[i] === last) n++;
      else break;
    }
    map.set(teamId, { type: last, n });
  }

  return map;
}

export function streakColor(s: Streak) {
  if (!s) return "rgba(15,23,42,0.55)";
  return s.type === "W" ? "#16a34a" : "#dc2626"; // green / red
}

export function recordText(r: { w: number; l: number; d: number }) {
  return `${r.w}-${r.l}-${r.d} `;
}

export function streakText(s: Streak) {
  if (!s) return "(-)";
  return `(${s.type}${s.n})`;
}

// ---- Rosters (/api/rosters) ----

/** Is this player on this roster (any of the roster shapes saved over the years)? */
export function rosterContainsPlayer(roster: any, playerId: string) {
  if (!roster || !playerId) return false;

  const target = String(playerId);

  const itemMatches = (x: any) => {
    if (x == null) return false;
    if (typeof x === "string" || typeof x === "number") return String(x) === target;
    if (typeof x === "object") {
      if (x.id != null && String(x.id) === target) return true;
      if (x.playerId != null && String(x.playerId) === target) return true;
    }
    return false;
  };

  // 0) roster itself may rarely be an array
  if (Array.isArray(roster)) {
    return roster.some(itemMatches);
  }

  if (typeof roster === "object") {
    // 1) canonical ownership shape: playerIds
    const playerIds = roster.playerIds ?? roster.data?.playerIds ?? null;
    if (Array.isArray(playerIds) && playerIds.some(itemMatches)) return true;

    // 2) slots arrays
    const slots = roster.slots ?? roster.data?.slots ?? null;
    if (slots && typeof slots === "object") {
      for (const v of Object.values(slots)) {
        if (Array.isArray(v) && v.some(itemMatches)) return true;
      }
    }

    // 3) wildcards array
    const wild = roster.wildcards ?? roster.data?.wildcards ?? null;
    if (Array.isArray(wild) && wild.some(itemMatches)) return true;

    // 4) lineup-style keys directly on roster
    for (const v of Object.values(roster)) {
      if (itemMatches(v)) return true;
    }

    // 5) nested lineup
    const lineup = roster.lineup ?? roster.data?.lineup ?? null;
    if (lineup && typeof lineup === "object") {
      for (const v of Object.values(lineup)) {
        if (itemMatches(v)) return true;
      }
    }
  }

  return false;
}

/** A roster as a lineup (already one, or the older position-slots shape). */
export function rosterDataToLineup(data: any): Lineup | null {
  if (!data) return null;

  // If it already looks like a Lineup (SlotId keys), return it
  if (data.prop1 || data.hooker1 || data.bench1) return data as Lineup;
  if (data.lineup && (data.lineup.prop1 || data.lineup.bench1)) return data.lineup as Lineup;

  const slots = data.slots ?? {};
  const wild = Array.isArray(data.wildcards) ? data.wildcards : [];

  const arr = (k: string) => (Array.isArray(slots?.[k]) ? slots[k] : []);
  const get = (a: any[], i: number) => (Array.isArray(a) ? a[i] ?? null : null);

  const PR = arr("PR");
  const HO = arr("HO");
  const LK = arr("LK");
  const LF = arr("LF");
  const HB = arr("HB");
  const FH = arr("FH");
  const CE = arr("CE");
  const OB = arr("OB");

  return {
    prop1: get(PR, 0),
    hooker1: get(HO, 0),
    prop2: get(PR, 1),

    lock1: get(LK, 0),
    lock2: get(LK, 1),

    looseforward1: get(LF, 0),
    looseforward2: get(LF, 1),
    looseforward3: get(LF, 2),

    halfback1: get(HB, 0),
    flyhalf1: get(FH, 0),

    centre1: get(CE, 0),
    centre2: get(CE, 1),

    outsideback1: get(OB, 0),
    outsideback2: get(OB, 1),
    outsideback3: get(OB, 2),

    bench1: wild[0] ?? null,
    bench2: wild[1] ?? null,
    bench3: wild[2] ?? null,
    bench4: wild[3] ?? null,
    bench5: wild[4] ?? null,
  };
}

// ---- Fixture tag for a player row: "v CRU (A)", or BYE (code-based, fixes MOA/MOP) ----
export function fixtureTagFor(
  p: Player | null,
  fixtures: Array<AnyFixture & { kickoffMs: number }>,
  realRound: number
) {
  if (!p) return "—";

  const playerCode = normalizeTeamCode(p.teamCode);
  if (!playerCode) return "BYE";

  const f = fixtures.find((x) => {
    if (x.week !== realRound) return false;

    const homeCode = normalizeTeamCode(x.homeTeam ?? "");
    const awayCode = normalizeTeamCode(x.awayTeam ?? "");

    return homeCode === playerCode || awayCode === playerCode;
  });

  if (!f) return "BYE";

  const homeCode = normalizeTeamCode(f.homeTeam ?? "");
  const awayCode = normalizeTeamCode(f.awayTeam ?? "");

  const isHome = homeCode === playerCode;
  const oppCode = isHome ? awayCode : homeCode;

  if (!oppCode) return "BYE";
  // "v" before the opponent (Ethan, 28 Nov 2026)
  return `v ${oppCode} (${isHome ? "H" : "A"})`;
}

// ---- Shared styles ----
export const listBox: CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};

/**
 * A player's key stats in one round, for the Matchup page on a computer (Ethan, 27 Nov 2026):
 * minutes, then whatever he did of tries, try assists, line breaks, metres, tackles, turnovers,
 * lineouts and goal kicking, e.g. "62 min · 1 T · 12 Tkl · 45 m". Empty if he didn't play.
 */
export function statLineText(c: Partial<Record<string, number | undefined>>): string {
  const n = (k: string) => Number(c[k]) || 0;
  if (!n("minutesPlayed")) return "";
  const parts = [`${n("minutesPlayed")} min`];
  const add = (k: string, label: string) => {
    if (n(k)) parts.push(`${n(k)} ${label}`);
  };
  add("tries", "T");
  add("tryAssists", "TA");
  add("lineBreaks", "LB");
  add("conversions", "Con");
  add("penaltyGoals", "Pen");
  add("tackles", "Tkl");
  add("metresGained", "m");
  add("defendersBeaten", "DB");
  add("turnoversForced", "TO");
  add("lineoutsWon", "LO");
  add("yellowCards", "YC");
  add("redCards", "RC");
  return parts.join(" · ");
}
