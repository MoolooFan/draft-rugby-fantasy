// lib/league/weeklyAwards.ts
// Weekly crown and spoon (plan item E6, agreed with Ethan Nov 2026): in each finalised
// regular-season round, the league's highest team score gets the crown and the lowest gets
// the (weekly) spoon. Teams that tie both get it. Finals weeks don't count (teams knocked out
// stop picking lineups, so the lowest score there means nothing). Pure code, no database.

export type TeamWeekScore = { week: number; teamId: string; score: number };

export type WeekAward = { week: number; crown: string[]; spoon: string[]; top: number; bottom: number };

export type AwardTally = Record<string, { crowns: number; spoons: number }>;

export function weeklyAwards(scores: TeamWeekScore[]): { weeks: WeekAward[]; tally: AwardTally } {
  const byWeek = new Map<number, Map<string, number>>();
  for (const s of scores) {
    if (!Number.isFinite(s.score) || !s.teamId) continue;
    const m = byWeek.get(s.week) ?? new Map<string, number>();
    m.set(s.teamId, s.score); // one score per team per week
    byWeek.set(s.week, m);
  }
  const weeks: WeekAward[] = [];
  const tally: AwardTally = {};
  const bump = (id: string, k: "crowns" | "spoons") => {
    tally[id] = tally[id] ?? { crowns: 0, spoons: 0 };
    tally[id][k]++;
  };
  for (const week of [...byWeek.keys()].sort((a, b) => a - b)) {
    const m = byWeek.get(week)!;
    if (m.size < 2) continue;
    const vals = [...m.values()];
    const top = Math.max(...vals);
    const bottom = Math.min(...vals);
    if (top === bottom) continue; // everyone level: no crown or spoon
    const crown = [...m].filter(([, v]) => v === top).map(([id]) => id).sort();
    const spoon = [...m].filter(([, v]) => v === bottom).map(([id]) => id).sort();
    crown.forEach((id) => bump(id, "crowns"));
    spoon.forEach((id) => bump(id, "spoons"));
    weeks.push({ week, crown, spoon, top, bottom });
  }
  return { weeks, tally };
}
