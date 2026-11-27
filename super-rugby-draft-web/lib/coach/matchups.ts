// lib/coach/matchups.ts
// How many fantasy points each real team gives up to each position (Ethan, 27 Nov 2026): one
// team might leak points to outside backs, another to loose forwards. Used by the AI coach in
// place of attack / defence ranks. Pure code; tested in scripts/tests/coach.test.ts.
//
// A player's position in a game comes from his jersey number on that week's team list when we
// have it ("Starting - #7" = loose forward; numbers come in with the team lists each round), and
// otherwise from his listed position. Bench jerseys (16+) use his listed position.

export type PosGroup = "PR" | "HO" | "LK" | "LF" | "HB" | "FH" | "CE" | "OB";

export const POS_GROUP_NAME: Record<PosGroup, string> = {
  PR: "props",
  HO: "hookers",
  LK: "locks",
  LF: "loose forwards",
  HB: "halfbacks",
  FH: "first fives",
  CE: "centres",
  OB: "outside backs",
};

/**
 * How much a team's points given up to a position mean (Ethan, 27 Nov 2026). From 2026, odd
 * rounds vs even rounds (scripts/backtest-projections.ts --matchups): outside backs 0.61,
 * centres 0.45, props 0.36 repeat; hookers 0.21 a little; locks, loose forwards, halfbacks and
 * first fives about 0 (mostly chance). To re-check with 2027's data and jersey numbers.
 */
export const MATCHUP_RELIABILITY: Record<PosGroup, "a real pattern" | "a weak pattern" | "mostly chance"> = {
  OB: "a real pattern",
  CE: "a real pattern",
  PR: "a real pattern",
  HO: "a weak pattern",
  LK: "mostly chance",
  LF: "mostly chance",
  HB: "mostly chance",
  FH: "mostly chance",
};

/** Starting players per position (how many full games' minutes the league average is worth early on). */
const STARTERS: Record<PosGroup, number> = { PR: 2, HO: 1, LK: 2, LF: 3, HB: 1, FH: 1, CE: 2, OB: 3 };

const JERSEY: Record<number, PosGroup> = { 1: "PR", 2: "HO", 3: "PR", 4: "LK", 5: "LK", 6: "LF", 7: "LF", 8: "LF", 9: "HB", 10: "FH", 11: "OB", 12: "CE", 13: "CE", 14: "OB", 15: "OB" };

/** The jersey number in a status like "Starting - #12" (null if none). */
export function jerseyNumber(status: string | null | undefined): number | null {
  const m = String(status ?? "").match(/#\s*(\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

/** His position group in a game: the starting jersey if known, else his listed position. */
export function posGroup(listedPos: string | null | undefined, status?: string | null): PosGroup | null {
  const n = jerseyNumber(status);
  if (n != null && JERSEY[n]) return JERSEY[n];
  const p = String(listedPos ?? "").toUpperCase();
  return p in POS_GROUP_NAME ? (p as PosGroup) : null;
}

/** One player's game: his position that day, the team he played against, his points and minutes. */
export type Appearance = { opp: string; game: number; group: PosGroup; points: number; minutes: number };

/** per80 = fantasy points per 80 minutes in that position against the team; rank 1 = gives up the most. */
export type AllowedRow = { per80: number; rank: number; teams: number; leagueAverage: number };

/**
 * For every team (as the opponent): the fantasy points it gives up to each position, per 80
 * minutes played there (so a bench hooker's 20 minutes count as a quarter of a game), over its
 * last `lastGames` games, mixed with the league average as if it had also played `priorGames`
 * average games (so a few odd results don't decide it). rank 1 = gives up the most.
 * `game` orders the games (older first); one team's game = all its opponents' appearances with
 * that number.
 */
export function pointsAllowed(apps: Appearance[], opts: { lastGames?: number; priorGames?: number } = {}): Map<string, Map<PosGroup, AllowedRow>> {
  const lastGames = opts.lastGames ?? 12;
  const priorGames = opts.priorGames ?? 3;
  type Sum = { pts: number; mins: number };
  // team -> game -> group -> points and minutes
  const byTeam = new Map<string, Map<number, Map<PosGroup, Sum>>>();
  for (const a of apps) {
    if (!a.opp || !Number.isFinite(a.points) || !(a.minutes > 0)) continue;
    const games = byTeam.get(a.opp) ?? new Map<number, Map<PosGroup, Sum>>();
    const g = games.get(a.game) ?? new Map<PosGroup, Sum>();
    const x = g.get(a.group) ?? { pts: 0, mins: 0 };
    x.pts += a.points;
    x.mins += a.minutes;
    g.set(a.group, x);
    games.set(a.game, g);
    byTeam.set(a.opp, games);
  }
  const groups = Object.keys(POS_GROUP_NAME) as PosGroup[];
  // each team's recent games added up
  const raw = new Map<string, Map<PosGroup, Sum>>();
  for (const [t, games] of byTeam) {
    const recent = [...games.entries()].sort((a, b) => a[0] - b[0]).slice(-lastGames);
    const sums = new Map<PosGroup, Sum>(groups.map((g) => [g, { pts: 0, mins: 0 }]));
    for (const [, g] of recent) {
      for (const [grp, x] of g) {
        sums.get(grp)!.pts += x.pts;
        sums.get(grp)!.mins += x.mins;
      }
    }
    raw.set(t, sums);
  }
  const out = new Map<string, Map<PosGroup, AllowedRow>>();
  for (const grp of groups) {
    let pts = 0, mins = 0;
    for (const r of raw.values()) {
      pts += r.get(grp)!.pts;
      mins += r.get(grp)!.mins;
    }
    const avg = mins ? (pts / mins) * 80 : 0;
    const priorMins = priorGames * STARTERS[grp] * 80;
    const vals = [...raw.entries()].map(([t, r]) => {
      const x = r.get(grp)!;
      return [t, x.mins + priorMins ? ((x.pts + (avg / 80) * priorMins) / (x.mins + priorMins)) * 80 : avg] as const;
    });
    const sorted = [...vals].sort((a, b) => b[1] - a[1]);
    sorted.forEach(([t, v], i) => {
      if (!out.has(t)) out.set(t, new Map());
      out.get(t)!.set(grp, { per80: Math.round(v * 10) / 10, rank: i + 1, teams: sorted.length, leagueAverage: Math.round(avg * 10) / 10 });
    });
  }
  return out;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** e.g. "loose forwards score 34 pts per 80 minutes against them (league average 31.1; the most of 11 teams)". */
export function allowedText(row: AllowedRow | null | undefined, group: PosGroup): string | null {
  if (!row) return null;
  const most = row.rank <= Math.ceil(row.teams / 2);
  const fewest = row.teams - row.rank + 1;
  const place = most ? `the ${row.rank === 1 ? "most" : `${ordinal(row.rank)} most`}` : `the ${fewest === 1 ? "fewest" : `${ordinal(fewest)} fewest`}`;
  return `${POS_GROUP_NAME[group]} score ${row.per80} pts per 80 minutes against them (league average ${row.leagueAverage}; ${place} of ${row.teams} teams)`;
}
