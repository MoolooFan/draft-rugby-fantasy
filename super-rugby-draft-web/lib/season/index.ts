// lib/season/index.ts
// Season settings: which real Super Rugby rounds make up each fantasy week, and the
// timing rules built on the fixtures (lineup deadline, finalise time, stats-sync windows).
// Pure code (no server/browser dependencies) so pages, API routes and tests can all use it.
import fixtures2026 from "@/data/fixtures-2026.json";
import fixtures2027 from "@/data/fixtures-2027.json";

export type SeasonFixture = {
  id: string;
  /** Real Super Rugby round. */
  week: number;
  kickoffAt: string;
  homeTeam: string;
  awayTeam: string;
  status?: string;
  homeScore?: number | null;
  awayScore?: number | null;
  /** Neither team is at home (e.g. Super Round). */
  neutralVenue?: boolean;
};

export type SeasonConfig = {
  season: number;
  fixtures: SeasonFixture[];
  /** fantasyWeeks[i] = the real rounds that make up fantasy week i + 1. */
  fantasyWeeks: number[][];
};

const HOUR = 60 * 60 * 1000;

/** Lineups lock this long before a week's first kickoff. */
export const DEADLINE_BEFORE_FIRST_KICKOFF_MS = 1 * HOUR;
/**
 * A week is finalised this long after its LAST kickoff:
 * ~2h game + 1h for extra time/delays + 10h for playfantasyrugby's stat corrections + 30 min buffer.
 * Stats are also synced from each game's kickoff until this long after it.
 */
export const FINALISE_AFTER_LAST_KICKOFF_MS = 13.5 * HOUR;

/** Bonus points (site-wide margins; a league can switch them off before its draft). */
export const BONUS_POINTS = {
  /** Winning by at least this many points earns the winning bonus. */
  winMarginAtLeast: 140,
  /** Losing by this many points or fewer earns the losing bonus. */
  loseMarginAtMost: 40,
  /** Ladder points per bonus. */
  ladderPoints: 1,
} as const;

/** Ladder points for a result. */
export const LADDER_POINTS = { win: 4, draw: 2, loss: 0 } as const;

const oneRoundPerWeek = (rounds: number) => Array.from({ length: rounds }, (_, i) => [i + 1]);

export const SEASONS: Record<number, SeasonConfig> = {
  2026: {
    season: 2026,
    fixtures: fixtures2026 as SeasonFixture[],
    fantasyWeeks: oneRoundPerWeek(16),
  },
  2027: {
    season: 2027,
    fixtures: fixtures2027 as SeasonFixture[],
    // 17 real rounds; round 10 (4 games) and round 11 (1 game: the two teams with a
    // round-10 bye) count as ONE fantasy week, so every team plays once per fantasy week.
    fantasyWeeks: [[1], [2], [3], [4], [5], [6], [7], [8], [9], [10, 11], [12], [13], [14], [15], [16], [17]],
  },
};

export function getSeason(season: number): SeasonConfig {
  const s = SEASONS[season];
  if (!s) throw new Error(`No season settings for ${season}`);
  return s;
}

export function kickoffMs(f: Pick<SeasonFixture, "kickoffAt">): number {
  const ms = new Date(f.kickoffAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function totalFantasyWeeks(s: SeasonConfig): number {
  return s.fantasyWeeks.length;
}

/** Real rounds in a fantasy week ([] if the week doesn't exist). */
export function realRoundsForWeek(s: SeasonConfig, fantasyWeek: number): number[] {
  return s.fantasyWeeks[fantasyWeek - 1] ?? [];
}

/** Fantasy week a real round belongs to, or null. */
export function fantasyWeekForRealRound(s: SeasonConfig, realRound: number): number | null {
  const i = s.fantasyWeeks.findIndex((rounds) => rounds.includes(realRound));
  return i < 0 ? null : i + 1;
}

/** All fixtures in a fantasy week, earliest first. */
export function fixturesForWeek(s: SeasonConfig, fantasyWeek: number): SeasonFixture[] {
  const rounds = new Set(realRoundsForWeek(s, fantasyWeek));
  return s.fixtures.filter((f) => rounds.has(Number(f.week))).sort((a, b) => kickoffMs(a) - kickoffMs(b));
}

/** First and last kickoff of a fantasy week, or null if it has no fixtures. */
export function weekKickoffRange(s: SeasonConfig, fantasyWeek: number): { firstMs: number; lastMs: number } | null {
  const times = fixturesForWeek(s, fantasyWeek).map(kickoffMs).filter((ms) => ms > 0);
  if (!times.length) return null;
  return { firstMs: Math.min(...times), lastMs: Math.max(...times) };
}

/** When lineups lock for a fantasy week. */
export function weekDeadlineMs(s: SeasonConfig, fantasyWeek: number): number | null {
  const r = weekKickoffRange(s, fantasyWeek);
  return r ? r.firstMs - DEADLINE_BEFORE_FIRST_KICKOFF_MS : null;
}

/** When a fantasy week is finalised (auto-subs, then scores locked). */
export function weekFinaliseAtMs(s: SeasonConfig, fantasyWeek: number): number | null {
  const r = weekKickoffRange(s, fantasyWeek);
  return r ? r.lastMs + FINALISE_AFTER_LAST_KICKOFF_MS : null;
}

/**
 * What users see a fantasy week called. Weeks are named after their real round(s) so they
 * line up with Super Rugby, e.g. "Round 9", "Round 10/11", "Round 12".
 */
export function weekLabel(s: SeasonConfig, fantasyWeek: number): string {
  const rounds = realRoundsForWeek(s, fantasyWeek);
  if (!rounds.length) return `Week ${fantasyWeek}`;
  return `Round ${rounds.join("/")}`;
}

/**
 * The weeks a league plays when its draft is at draftMs: from the first week whose lineup
 * deadline is after the draft, to the end of the season. (Leagues can start mid-season.)
 */
export function leagueWeeksAfterDraft(s: SeasonConfig, draftMs: number): number[] {
  const out: number[] = [];
  for (let w = 1; w <= totalFantasyWeeks(s); w++) {
    const dl = weekDeadlineMs(s, w);
    if (dl != null && dl > draftMs) out.push(w);
  }
  return out;
}

/**
 * The season the site is running (one season at a time). Defaults to 2027; set
 * NEXT_PUBLIC_CURRENT_SEASON in the env to override (the local test copy uses 2026 data).
 */
export function currentSeasonYear(): number {
  const fromEnv = Number(process.env.NEXT_PUBLIC_CURRENT_SEASON);
  return Number.isFinite(fromEnv) && fromEnv > 0 && SEASONS[fromEnv] ? fromEnv : 2027;
}

/** What users see a week called in the current season, e.g. "Round 10/11". */
export function roundLabel(fantasyWeek: number, seasonYear: number = currentSeasonYear()): string {
  return weekLabel(getSeason(seasonYear), fantasyWeek);
}

export type PageFixture = SeasonFixture & { realRound: number };

/**
 * The season's fixtures for the pages, numbered by FANTASY week: `week` is the fantasy week
 * (2027: rounds 10 and 11 are both week 10, round 12 is week 11, ...) and `realRound` is the
 * Super Rugby round. Pages work in fantasy weeks; show names with roundLabel().
 */
export function fixturesByFantasyWeek(seasonYear: number = currentSeasonYear()): PageFixture[] {
  const s = getSeason(seasonYear);
  return s.fixtures
    .map((f) => ({ ...f, realRound: Number(f.week), week: fantasyWeekForRealRound(s, Number(f.week)) ?? 0 }))
    .filter((f) => f.week > 0);
}

/** A game counts as live from kickoff until this long after (2h game + 1h for extra time/delays). */
export const GAME_LIVE_MS = 3 * HOUR;

function roundsWithGameBetween(s: SeasonConfig, nowMs: number, fromMs: number, toMs: number): number[] {
  const rounds = new Set<number>();
  for (const f of s.fixtures) {
    const k = kickoffMs(f);
    if (k > 0 && nowMs >= k + fromMs && nowMs <= k + toMs) rounds.add(Number(f.week));
  }
  return [...rounds];
}

/** Real rounds with a game on right now (stats synced every few minutes). */
export function liveRealRounds(s: SeasonConfig, nowMs: number): number[] {
  return roundsWithGameBetween(s, nowMs, 0, GAME_LIVE_MS);
}

/** Real rounds with a finished game whose stats may still be corrected (synced hourly). */
export function realRoundsAwaitingFinalStats(s: SeasonConfig, nowMs: number): number[] {
  return roundsWithGameBetween(s, nowMs, GAME_LIVE_MS, FINALISE_AFTER_LAST_KICKOFF_MS);
}

/**
 * Real rounds whose team lists / injury lists may be out: from 3 days before the round's first
 * kickoff (the articles come out Wednesday 4pm NZT) until that kickoff.
 */
export function realRoundsAwaitingTeamLists(s: SeasonConfig, nowMs: number): number[] {
  const firstByRound = new Map<number, number>();
  for (const f of s.fixtures) {
    const k = kickoffMs(f);
    const r = Number(f.week);
    if (k > 0 && (!firstByRound.has(r) || k < firstByRound.get(r)!)) firstByRound.set(r, k);
  }
  return [...firstByRound].filter(([, k]) => nowMs < k && nowMs >= k - 3 * 24 * HOUR).map(([r]) => r);
}

/** True while any game is between its kickoff and 13.5h after it (the only time stats need syncing). */
export function isStatsSyncWindow(s: SeasonConfig, nowMs: number): boolean {
  return s.fixtures.some((f) => {
    const k = kickoffMs(f);
    return k > 0 && nowMs >= k && nowMs <= k + FINALISE_AFTER_LAST_KICKOFF_MS;
  });
}
