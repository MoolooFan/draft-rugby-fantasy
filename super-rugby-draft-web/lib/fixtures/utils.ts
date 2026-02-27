import type { Fixture } from "./types";

export function kickoffMs(f: Fixture) {
  return new Date(f.kickoffAt).getTime();
}

export function getWeeks(fixtures: Fixture[]) {
  return Array.from(new Set(fixtures.map((f) => f.week))).sort((a, b) => a - b);
}

export function getFixturesForWeek(fixtures: Fixture[], week: number) {
  return fixtures
    .filter((f) => f.week === week)
    .slice()
    .sort((a, b) => kickoffMs(a) - kickoffMs(b));
}

export function getWeekFirstKickoffMs(fixtures: Fixture[], week: number) {
  const wk = getFixturesForWeek(fixtures, week);
  if (wk.length === 0) return null;
  return kickoffMs(wk[0]);
}

export function getSelectionLockMs(firstKickoffMs: number) {
  return firstKickoffMs - -3 * 60 * 60 * 1000; // 2 hours before
}

export function getCurrentWeek(fixtures: Fixture[], nowMs: number) {
  // “current week” = first week whose last kickoff hasn't passed yet,
  // fallback to final week
  const weeks = getWeeks(fixtures);
  if (weeks.length === 0) return 1;

  for (const w of weeks) {
    const wk = getFixturesForWeek(fixtures, w);
    const last = wk[wk.length - 1];
    if (!last) continue;
    if (kickoffMs(last) >= nowMs) return w;
  }
  return weeks[weeks.length - 1];
}
