// lib/league/weekHelpers.ts
// Week and deadline helpers the pages share (they used to have their own copies).
// "Sheet" rows are the league's fixture rows from /api/fixtures/leagueMatches (the name is left
// over from when they came from a Google Sheet).

export function toMs(x: any): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

type FixtureLike = { week: number; kickoffMs?: number; kickoffAt?: string | number };

/** First kickoff (ms) of a week, or 0 if the week has no games. */
export function getWeekFirstKickoffMs(fixtures: FixtureLike[], week: number) {
  const wk = fixtures.filter((f) => f.week === week);
  if (!wk.length) return 0;
  return Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
}

/** Lineups lock 1 hour before the week's first kickoff. */
export function getSelectionDeadlineMs(firstKickoffMs: number) {
  return firstKickoffMs - 1 * 60 * 60 * 1000;
}

/** A week's lineup deadline (ms), or 0 if the week has no games. */
export function getWeekDeadlineMs(fixtures: FixtureLike[], week: number) {
  const first = getWeekFirstKickoffMs(fixtures, week);
  return first ? getSelectionDeadlineMs(first) : 0;
}

export function getWeeksSorted(fixtures: Array<{ week: number }>) {
  return Array.from(new Set(fixtures.map((f) => f.week))).sort((a, b) => a - b);
}

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

export function isSheetPlayableRow(r: SheetFixtureRow) {
  return !isSheetLabelRow(r);
}

export function isFantasyWeekCompleteFromSheet(rows: SheetFixtureRow[], weekNo: number) {
  const wk = rows.filter((r) => Number(r.weekFantasy) === weekNo && isSheetPlayableRow(r));
  if (!wk.length) return false;
  return wk.every((r) => String(r.status ?? "").toLowerCase() === "complete");
}

function sheetWeeks(rows: SheetFixtureRow[]) {
  return Array.from(
    new Set(
      rows
        .filter(isSheetPlayableRow)
        .map((r) => Number(r.weekFantasy))
        .filter((w) => Number.isFinite(w) && w > 0)
    )
  ).sort((a, b) => a - b);
}

/** The last week whose games are all finished (0 if none). */
export function latestCompletedWeekFromSheet(rows: SheetFixtureRow[]) {
  let latest = 0;
  for (const w of sheetWeeks(rows)) if (isFantasyWeekCompleteFromSheet(rows, w)) latest = w;
  return latest;
}

/** The first week that isn't finished yet (the last week once the season is over; 1 if none). */
export function currentWeekFromSheet(rows: SheetFixtureRow[]) {
  const weeks = sheetWeeks(rows);
  for (const w of weeks) if (!isFantasyWeekCompleteFromSheet(rows, w)) return w;
  return weeks[weeks.length - 1] ?? 1;
}

/** First non-empty value among these keys (matched ignoring case, spaces and punctuation). */
export function pickValue(row: any, candidates: string[]) {
  if (!row || typeof row !== "object") return null;
  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
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
