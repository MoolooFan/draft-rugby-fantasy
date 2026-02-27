// lib/league/week.ts
export function fantasyWeekToRealRound(startRound: number, fantasyWeek: number) {
  const sr = Number.isFinite(startRound) ? startRound : 1;
  const fw = Number.isFinite(fantasyWeek) ? fantasyWeek : 1;
  return sr + (fw - 1);
}

export function clampWeek(week: number, totalWeeks: number) {
  const t = Number.isFinite(totalWeeks) ? totalWeeks : 16;
  const w = Number.isFinite(week) ? week : 1;
  return Math.max(1, Math.min(t, w));
}

export function selectionDeadlineFromFirstKickoff(firstKickoffMs: number) {
  // keep EXACTLY one definition across the app
  // (you currently say "2 hours before" but subtract 1 hour)
  return firstKickoffMs - -2 * 60 * 60 * 1000;
}