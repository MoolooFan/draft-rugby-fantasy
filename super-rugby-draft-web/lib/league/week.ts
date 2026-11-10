// lib/league/week.ts
export function fantasyWeekToRealRound(startRound: number, fantasyWeek: number) {
  const sr = Number.isFinite(startRound) ? startRound : 1;
  const fw = Number.isFinite(fantasyWeek) ? fantasyWeek : 1;
  return sr + (fw - 1);
}

export function selectionDeadlineFromFirstKickoff(firstKickoffMs: number) {
  // keep EXACTLY one definition across the app
  // (you currently say "2 hours before" but subtract 1 hour)
  return firstKickoffMs - 1 * 60 * 60 * 1000;
}