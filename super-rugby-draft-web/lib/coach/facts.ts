// lib/coach/facts.ts
// The fact sheet the AI coach writes from (Ethan, 17 Nov 2026). Pure code: the server
// (lib/coach/data.ts) gathers the data, this turns it into a compact, readable summary with the
// numbers already worked out (so the coach doesn't have to do sums), covering what Ethan asked
// it to weigh up: how repeatable each stat is, consistency and boom / bust, age and role, how
// many fantasy points each opponent gives up to his position (lib/coach/matchups.ts) over the
// next game, the rest of the season and the fantasy finals weeks, injury and rest risk, status
// changes for him and his teammates, and Ethan's own notes.
// Tested in scripts/tests/coach.test.ts.
import { isFrontRow, playerPoints, roundPoints, type ScoringRules, type StatCounts, type StatKey } from "@/lib/scoring";
import { STAT_LABELS } from "@/lib/players/statsHub";
import { MATCHUP_RELIABILITY, POS_GROUP_NAME, type PosGroup } from "@/lib/coach/matchups";

export type CoachKind = "outlook" | "post_game" | "team_list" | "status" | "news";

export type CoachGame = {
  round: number;
  /** "Round 5" */
  label: string;
  opp: string | null;
  home: boolean | null;
  counts: StatCounts;
  /** named starting / bench that week */
  listed?: "starting" | "bench" | null;
};

/** A game: who against, and how many fantasy points that team gives up to his position (lib/coach/matchups.ts). */
export type FixtureInfo = { label: string; opp: string; home: boolean | null; oppAllows: string | null };

export type CoachFactsInput = {
  kind: CoachKind;
  season: number;
  nowMs: number;
  rules: ScoringRules;
  player: {
    name: string;
    team: string;
    positions: string;
    posAbbrev: string;
    secondaryPosAbbrev?: string | null;
    thirdPosAbbrev?: string | null;
    draftRank: number | null;
    expectedRole: string | null;
    kickOrder: number | null;
    status: string | null;
    birthDate: string | null;
    international: string | null;
    restNotes: string | null;
    injuryNotes: string | null;
  };
  games: CoachGame[];
  lastSeasonGames: CoachGame[];
  next: (FixtureInfo & { projection: { pts: number; low: number; high: number; role: string; kicker: boolean } | null }) | null;
  remaining: FixtureInfo[];
  finalsWeeks: FixtureInfo[];
  teammates: Array<{ name: string; positions: string; status: string }>;
  /**
   * false before the season's weekly outlooks start (Ethan, 27 Nov 2026): Round 1's look ahead
   * waits for the Round 1 team lists (Wednesday 4:30 pm NZ), like every week's team-list notes
   */
  nextWeekOpen?: boolean;
  /** his position for the matchup numbers (this week's jersey if known, else his listed position) */
  matchupGroup?: PosGroup | null;
  thisGame?: (CoachGame & { teamScore: number | null; oppScore: number | null; projected: number | null }) | null;
  statusChange?: { from: string | null; to: string | null } | null;
  notes: string[];
  /** articles Ethan shared that mention him or his team (lib/coach/articles.ts): the relevant paragraphs */
  articles?: Array<{ title: string; source: string; date: string; excerpt: string }>;
  previous: Array<{ kind: string; label: string; headline: string }>;
};

/** Stats worth reporting per game (others are shown only if he does them often). */
const KEY_STATS: StatKey[] = [
  "tries", "tryAssists", "lineBreaks", "defendersBeaten", "metresGained", "offloads", "tackles", "tacklesMissed",
  "turnoversForced", "lineoutsWon", "lineoutSteals", "scrumsWon", "conversions", "penaltyGoals", "penaltiesConceded", "errors",
  "yellowCards", "redCards",
];

const r1 = (n: number) => Math.round(n * 10) / 10;

type Repeat = "very repeatable" | "fairly repeatable" | "streaky" | "mostly luck";

/**
 * How well a stat's game-to-game VOLUME repeats (a 15-tackle flanker usually makes 15 again; a
 * hat-trick rarely repeats). Not the projections' TRUST_MINUTES, which measure something else:
 * how far a player's rate stays above / below his position's average.
 */
const REPEAT: Partial<Record<StatKey, Repeat>> = {
  minutesPlayed: "very repeatable", tackles: "very repeatable", metresGained: "very repeatable", lineoutsWon: "very repeatable",
  scrumsWon: "very repeatable", conversions: "very repeatable", penaltyGoals: "very repeatable",
  defendersBeaten: "fairly repeatable", offloads: "fairly repeatable", turnoversForced: "fairly repeatable", tacklesMissed: "fairly repeatable",
  lineoutSteals: "fairly repeatable", lineBreakAssists: "fairly repeatable", conversionsMissed: "fairly repeatable", penaltyGoalsMissed: "fairly repeatable",
  tries: "streaky", lineBreaks: "streaky", lineoutErrors: "streaky", penaltiesConceded: "streaky", errors: "streaky",
  tryAssists: "mostly luck", interceptions: "mostly luck", fiftyTwentyTwos: "mostly luck", yellowCards: "mostly luck", redCards: "mostly luck",
  dropGoals: "mostly luck", dropGoalsMissed: "mostly luck",
};

export function repeatability(stat: StatKey): Repeat {
  return REPEAT[stat] ?? "streaky";
}

/** His own game-to-game spread for a stat (null with fewer than 4 games or a rare stat). */
export function hisSpread(values: number[]): "steady" | "varies" | "big swings" | null {
  if (values.length < 4) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean < 0.5) return null;
  const cv = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) / mean;
  return cv < 0.35 ? "steady" : cv < 0.75 ? "varies" : "big swings";
}

/** Fantasy points profile: average, spread, best / worst, how often he booms or busts. */
export function pointsProfile(points: number[]) {
  const n = points.length;
  if (!n) return null;
  const mean = points.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(points.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const cv = mean > 0 ? sd / mean : 0;
  return {
    games: n,
    average: r1(mean),
    spread: r1(sd),
    best: r1(Math.max(...points)),
    worst: r1(Math.min(...points)),
    /** share of games at 1.5x his average or more */
    boomRate: Math.round((points.filter((p) => p >= mean * 1.5).length / n) * 100),
    /** share of games at half his average or less */
    bustRate: Math.round((points.filter((p) => p <= mean * 0.5).length / n) * 100),
    consistency: n < 3 ? "too few games to tell" : cv < 0.35 ? "consistent" : cv < 0.6 ? "up and down" : "boom or bust",
  };
}

/** Age in whole years on a date (null if unknown). */
export function ageOn(birthDate: string | null, nowMs: number): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  if (now.getUTCMonth() < b.getUTCMonth() || (now.getUTCMonth() === b.getUTCMonth() && now.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

const played = (g: CoachGame) => (Number(g.counts.minutesPlayed) || 0) > 0;

/** Per-game averages of the key stats he actually does (with how repeatable each is). */
export function keyStatAverages(games: CoachGame[]) {
  const pg = games.filter(played);
  if (!pg.length) return {};
  const out: Record<string, { perGame: number; repeatable: string; his?: string }> = {};
  for (const k of KEY_STATS) {
    const vals = pg.map((g) => Number(g.counts[k]) || 0);
    const avg = vals.reduce((a, b) => a + b, 0) / pg.length;
    if (avg < (k === "metresGained" ? 1 : 0.1)) continue;
    const his = hisSpread(vals);
    out[STAT_LABELS[k].long] = { perGame: r1(avg), repeatable: repeatability(k), ...(his ? { his } : {}) };
  }
  return out;
}

/** One game as a short line, e.g. "Round 5 v Chiefs (H): 62 min, 14.5 pts - 1 Tries, 8 Tackles, 45 Metres". */
export function gameLine(g: CoachGame, frontRow: boolean, rules: ScoringRules): string {
  const pts = playerPoints(g.counts, frontRow, rules);
  const mins = Number(g.counts.minutesPlayed) || 0;
  const where = g.opp ? ` v ${g.opp}${g.home == null ? "" : g.home ? " (H)" : " (A)"}` : "";
  if (!mins) return `${g.label}${where}: did not play${g.listed ? ` (named ${g.listed === "bench" ? "on the bench" : "to start"})` : ""}`;
  const bits = KEY_STATS.filter((k) => Number(g.counts[k]) > 0).map((k) => `${g.counts[k]} ${STAT_LABELS[k].long}`);
  return `${g.label}${where}${g.listed === "bench" ? " off the bench" : ""}: ${mins} min, ${roundPoints(pts)} pts${bits.length ? ` - ${bits.join(", ")}` : ""}`;
}

const fixtureText = (f: FixtureInfo) => `${f.label}: ${f.home == null ? "v" : f.home ? "home v" : "away at"} ${f.opp}${f.oppAllows ? ` (matchup: ${f.oppAllows})` : ""}`;

/** The fact sheet sent to the coach (plain JSON, numbers worked out). */
export function buildFacts(input: CoachFactsInput): Record<string, unknown> {
  const { player: p, rules } = input;
  const front = isFrontRow({ posAbbrev: p.posAbbrev, secondaryPosAbbrev: p.secondaryPosAbbrev, thirdPosAbbrev: p.thirdPosAbbrev }, rules);
  const pts = (gs: CoachGame[]) => gs.filter(played).map((g) => playerPoints(g.counts, front, rules));
  const sheet: Record<string, unknown> = {
    player: {
      name: p.name,
      team: p.team,
      positions: p.positions,
      age: ageOn(p.birthDate, input.nowMs),
      draftRank: p.draftRank,
      expectedRole: p.expectedRole,
      goalKicker: p.kickOrder ? (p.kickOrder === 1 ? "first-choice kicker" : "second-choice kicker") : null,
      statusNow: p.status || "none (available)",
      international: p.international,
      restPolicy: p.restNotes,
      injuryHistory: p.injuryNotes,
    },
    [`stats${input.season}`]: {
      note: input.games.some(played) ? `this season (${input.season}) so far` : `this season (${input.season}): no games yet`,
      fantasyPoints: pointsProfile(pts(input.games)),
      keyStatsPerGame: keyStatAverages(input.games),
      minutesPerGame: input.games.filter(played).length
        ? r1(input.games.filter(played).reduce((a, g) => a + (Number(g.counts.minutesPlayed) || 0), 0) / input.games.filter(played).length)
        : null,
      gamesStartedOrBench: input.games.filter(played).map((g) => g.listed ?? "unknown").join(", ") || null,
      lastFiveGames: input.games.slice(-5).map((g) => gameLine(g, front, rules)),
    },
    [`stats${input.season - 1}`]: input.lastSeasonGames.length
      ? { note: `last season (${input.season - 1})`, fantasyPoints: pointsProfile(pts(input.lastSeasonGames)), keyStatsPerGame: keyStatAverages(input.lastSeasonGames) }
      : null,
    nextGame: input.next
      ? {
          game: fixtureText(input.next),
          projection: input.next.projection
            ? { expectedPoints: input.next.projection.pts, likelyRange: `${input.next.projection.low}-${input.next.projection.high}`, role: input.next.projection.role, kickingThisWeek: input.next.projection.kicker }
            : null,
        }
      : null,
    ...(input.nextWeekOpen === false ? { nextWeekOutlook: "not yet: the weekly outlooks haven't started, so leave next_week empty" } : {}),
    matchupReliability: input.matchupGroup
      ? `For ${POS_GROUP_NAME[input.matchupGroup]}, the matchup numbers are ${MATCHUP_RELIABILITY[input.matchupGroup]}.`
      : null,
    restOfSeason: input.remaining.map(fixtureText),
    fantasyFinalsWeeks: input.finalsWeeks.map(fixtureText),
    teammatesSamePositionWithNews: input.teammates.map((t) => `${t.name} (${t.positions}): ${t.status}`),
    latestNews: input.notes,
    newsReports: (input.articles ?? []).map((a) => ({ date: a.date, headline: a.title, relevantText: a.excerpt })),
    previousCoachNotes: input.previous.map((n) => `${n.label} (${n.kind}): ${n.headline}`),
  };
  if (input.thisGame) {
    sheet.thisGame = {
      line: gameLine(input.thisGame, front, rules),
      fantasyPoints: roundPoints(playerPoints(input.thisGame.counts, front, rules)),
      projectedBeforehandForTheWeek: input.thisGame.projected,
      result: input.thisGame.teamScore != null && input.thisGame.oppScore != null ? `${p.team} ${input.thisGame.teamScore} - ${input.thisGame.oppScore} ${input.thisGame.opp ?? ""}`.trim() : null,
      howRepeatable: Object.fromEntries(
        KEY_STATS.filter((k) => Number(input.thisGame!.counts[k]) > 0).map((k) => [STAT_LABELS[k].long, repeatability(k)])
      ),
    };
  }
  if (input.statusChange) sheet.statusChange = { from: input.statusChange.from || "none", to: input.statusChange.to || "none (available)" };
  return sheet;
}

/**
 * The numbers shown with a note on the player card (Ethan, 27 Nov 2026): his projected points for
 * his next game at the time it was written (shown only on the "next week" part), and for an
 * after-the-game note what he scored. Season outlooks have neither.
 */
export function notePoints(input: CoachFactsInput): { projected: number | null; scored: number | null } {
  if (input.kind === "outlook") return { projected: null, scored: null };
  if (input.kind === "post_game") {
    const g = input.thisGame;
    if (!g) return { projected: null, scored: null };
    const { posAbbrev, secondaryPosAbbrev, thirdPosAbbrev } = input.player;
    const front = isFrontRow({ posAbbrev, secondaryPosAbbrev, thirdPosAbbrev }, input.rules);
    return { projected: input.next?.projection?.pts ?? null, scored: roundPoints(playerPoints(g.counts, front, input.rules)) };
  }
  return { projected: input.nextWeekOpen === false ? null : input.next?.projection?.pts ?? null, scored: null };
}
