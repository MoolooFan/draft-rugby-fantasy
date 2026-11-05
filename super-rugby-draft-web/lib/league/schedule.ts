// lib/league/schedule.ts
// Builds a league's season schedule: a round-robin regular season, then finals and a
// consolation ("wooden spoon") playoff in the last weeks. Pure code, no database.
//
// Rules agreed with Ethan (see REBUILD-PLAN.md, "Season rules"):
// - Finals: none / 2 / 3 / 4 / 6 teams. 3: 1st seed gets a bye to the final.
//   6: 3v6 and 4v5, then 1 plays the lowest remaining seed and 2 the other, then the final.
// - Consolation: everyone else, as a mirror image (losers go through, bottom seeds get the
//   byes); the loser of the last game gets the wooden spoon.
//   - If it needs FEWER weeks than the finals, the spoon game is played over the extra
//     weeks with the scores added together.
//   - If it needs MORE weeks, the top consolation seeds sit out of the spoon race and play
//     "fill-in" games (each other, then the teams that have escaped the spoon) instead.
// - No finals: champion and spoon are the top and bottom of the ladder.

export type FinalsSize = 0 | 2 | 3 | 4 | 6;

/** Where a playoff team comes from. Seeds are ladder positions after the regular season (1 = top). */
export type Source =
  | { seed: number }
  | { winnerOf: string }
  | { loserOf: string }
  /** Of the winners of these games, the one with the better (pick "best") or worse seed. */
  | { winnerOf_: string[]; pick: "best" | "worst" }
  | { loserOf_: string[]; pick: "best" | "worst" };

export type PlayoffGame = {
  key: string;
  bracket: "finals" | "consolation" | "fill-in";
  label: string;
  /** Season weeks this game is played over. More than one = scores added together. */
  weeks: number[];
  home: Source;
  away: Source;
  /** The grand final decides the champion; the spoon game's loser gets the wooden spoon. */
  decides?: "champion" | "spoon";
};

export type RegularGame = {
  week: number;
  homeTeamId: string;
  /** null = bye */
  awayTeamId: string | null;
};

export type LeagueSchedule = {
  regularWeeks: number[];
  playoffWeeks: number[];
  regular: RegularGame[];
  playoffs: PlayoffGame[];
  /** Set when exactly one team misses the finals: that seed gets the spoon without a game. */
  spoonSeedWithoutGame: number | null;
};

const FINALS_WEEKS: Record<FinalsSize, number> = { 0: 0, 2: 1, 3: 2, 4: 2, 6: 3 };

export function finalsWeekCount(size: FinalsSize): number {
  return FINALS_WEEKS[size];
}

// ---------------------------------------------------------------------------
// Regular season: round-robin (circle method). Odd number of teams = one bye per week.

export function buildRoundRobin(teamIds: string[], weeks: number[]): RegularGame[] {
  if (teamIds.length < 2) return [];
  const ids: Array<string | null> = [...teamIds];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;

  const cycle: Array<Array<[string | null, string | null]>> = [];
  let wheel = [...ids];
  for (let round = 0; round < n - 1; round++) {
    const pairs: Array<[string | null, string | null]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = wheel[i];
      const b = wheel[n - 1 - i];
      pairs.push(round % 2 === 0 ? [a, b] : [b, a]);
    }
    cycle.push(pairs);
    // keep the first team fixed, rotate the rest
    wheel = [wheel[0], wheel[n - 1], ...wheel.slice(1, n - 1)];
  }

  const out: RegularGame[] = [];
  weeks.forEach((week, i) => {
    const pairs = cycle[i % cycle.length];
    // swap home/away on every second pass through the cycle
    const flip = Math.floor(i / cycle.length) % 2 === 1;
    for (const [x, y] of pairs) {
      const [home, away] = flip ? [y, x] : [x, y];
      if (home == null && away == null) continue;
      if (home == null) out.push({ week, homeTeamId: away as string, awayTeamId: null });
      else out.push({ week, homeTeamId: home, awayTeamId: away });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Playoff layouts. Weeks here are 1-based within the playoffs.

type Draft = Omit<PlayoffGame, "weeks"> & { weeks: number[] };

function finalsLayout(size: FinalsSize): Draft[] {
  const s = (n: number): Source => ({ seed: n });
  switch (size) {
    case 0:
      return [];
    case 2:
      return [{ key: "GF", bracket: "finals", label: "Grand Final", weeks: [1], home: s(1), away: s(2), decides: "champion" }];
    case 3:
      return [
        { key: "QF", bracket: "finals", label: "Qualifying Final", weeks: [1], home: s(2), away: s(3) },
        { key: "GF", bracket: "finals", label: "Grand Final", weeks: [2], home: s(1), away: { winnerOf: "QF" }, decides: "champion" },
      ];
    case 4:
      return [
        { key: "SF1", bracket: "finals", label: "Semi Final 1", weeks: [1], home: s(1), away: s(4) },
        { key: "SF2", bracket: "finals", label: "Semi Final 2", weeks: [1], home: s(2), away: s(3) },
        { key: "GF", bracket: "finals", label: "Grand Final", weeks: [2], home: { winnerOf: "SF1" }, away: { winnerOf: "SF2" }, decides: "champion" },
      ];
    case 6:
      return [
        { key: "EF1", bracket: "finals", label: "Elimination Final 1", weeks: [1], home: s(3), away: s(6) },
        { key: "EF2", bracket: "finals", label: "Elimination Final 2", weeks: [1], home: s(4), away: s(5) },
        { key: "SF1", bracket: "finals", label: "Semi Final 1", weeks: [2], home: s(1), away: { winnerOf_: ["EF1", "EF2"], pick: "worst" } },
        { key: "SF2", bracket: "finals", label: "Semi Final 2", weeks: [2], home: s(2), away: { winnerOf_: ["EF1", "EF2"], pick: "best" } },
        { key: "GF", bracket: "finals", label: "Grand Final", weeks: [3], home: { winnerOf: "SF1" }, away: { winnerOf: "SF2" }, decides: "champion" },
      ];
  }
}

const SPOON_LABEL = "Wooden Spoon Playoff";

/** Consolation layouts by number of teams; c(1) = best of them. Mirror of the finals. */
function consolationLayout(size: 2 | 3 | 4 | 6, c: (n: number) => Source): Draft[] {
  switch (size) {
    case 2:
      return [{ key: "WS", bracket: "consolation", label: SPOON_LABEL, weeks: [1], home: c(1), away: c(2), decides: "spoon" }];
    case 3:
      return [
        { key: "CQ", bracket: "consolation", label: "Consolation Playoff", weeks: [1], home: c(1), away: c(2) },
        { key: "WS", bracket: "consolation", label: SPOON_LABEL, weeks: [2], home: c(3), away: { loserOf: "CQ" }, decides: "spoon" },
      ];
    case 4:
      return [
        { key: "CS1", bracket: "consolation", label: "Consolation Semi 1", weeks: [1], home: c(1), away: c(4) },
        { key: "CS2", bracket: "consolation", label: "Consolation Semi 2", weeks: [1], home: c(2), away: c(3) },
        { key: "WS", bracket: "consolation", label: SPOON_LABEL, weeks: [2], home: { loserOf: "CS1" }, away: { loserOf: "CS2" }, decides: "spoon" },
      ];
    case 6:
      return [
        { key: "CE1", bracket: "consolation", label: "Consolation Playoff 1", weeks: [1], home: c(1), away: c(4) },
        { key: "CE2", bracket: "consolation", label: "Consolation Playoff 2", weeks: [1], home: c(2), away: c(3) },
        { key: "CS1", bracket: "consolation", label: "Consolation Semi 1", weeks: [2], home: c(6), away: { loserOf_: ["CE1", "CE2"], pick: "best" } },
        { key: "CS2", bracket: "consolation", label: "Consolation Semi 2", weeks: [2], home: c(5), away: { loserOf_: ["CE1", "CE2"], pick: "worst" } },
        { key: "WS", bracket: "consolation", label: SPOON_LABEL, weeks: [3], home: { loserOf: "CS1" }, away: { loserOf: "CS2" }, decides: "spoon" },
      ];
  }
}

const CONSOLATION_WEEKS = { 2: 1, 3: 2, 4: 2, 6: 3 } as const;

function lastWeek(g: Draft) {
  return Math.max(...g.weeks);
}

/** Every source that names a game's winner (used to find teams that have escaped the spoon). */
function winnerRefs(games: Draft[]): Set<string> {
  const refs = new Set<string>();
  for (const g of games) {
    for (const src of [g.home, g.away]) {
      if ("winnerOf" in src) refs.add(src.winnerOf);
      if ("winnerOf_" in src) src.winnerOf_.forEach((k) => refs.add(k));
    }
  }
  return refs;
}

function playoffLayout(teamCount: number, finals: FinalsSize): { games: Draft[]; weeks: number; spoonSeedWithoutGame: number | null } {
  const L = FINALS_WEEKS[finals];
  if (L === 0) return { games: [], weeks: 0, spoonSeedWithoutGame: null };

  const games: Draft[] = finalsLayout(finals);
  const R = teamCount - finals; // teams in the consolation
  if (R <= 0) return { games, weeks: L, spoonSeedWithoutGame: null };
  if (R === 1) return { games, weeks: L, spoonSeedWithoutGame: teamCount };

  // Largest standard consolation that fits in the finals' weeks.
  const size = ([6, 4, 3, 2] as const).find((s) => s <= R && CONSOLATION_WEEKS[s] <= L) ?? 2;
  const fillIns = R - size; // top consolation seeds that sit out of the spoon race
  const firstSpoonSeed = finals + fillIns + 1;
  const cons = consolationLayout(size, (n) => ({ seed: firstSpoonSeed + n - 1 }));

  // Fewer weeks than the finals: the spoon game is played over the extra weeks (aggregate).
  const extra = L - CONSOLATION_WEEKS[size];
  if (extra > 0) {
    const ws = cons.find((g) => g.decides === "spoon")!;
    const start = ws.weeks[0];
    ws.weeks = Array.from({ length: extra + 1 }, (_, i) => start + i);
    ws.label = `${SPOON_LABEL} (${ws.weeks.length} weeks, scores added together)`;
  }
  games.push(...cons);

  // Fill-in games: each week, consolation teams that are out of the spoon race play each other.
  // Fill-in seeds play the teams that have escaped the spoon first; escaped teams left over
  // play each other (e.g. the two consolation-semi winners).
  {
    const refs = winnerRefs(cons);
    let n = 0;
    for (let w = 1; w <= L; w++) {
      const seeds: Source[] = Array.from({ length: fillIns }, (_, i) => ({ seed: finals + 1 + i }));
      const escaped: Source[] = cons
        .filter((g) => lastWeek(g) < w && !refs.has(g.key))
        .map((g) => ({ winnerOf: g.key }));
      const pairs: Array<[Source, Source]> = [];
      while (seeds.length && escaped.length) pairs.push([seeds.shift()!, escaped.shift()!]);
      const rest = [...seeds, ...escaped];
      while (rest.length >= 2) pairs.push([rest.shift()!, rest.shift()!]);
      for (const [home, away] of pairs) {
        games.push({ key: `FI${++n}`, bracket: "fill-in", label: "Consolation Game", weeks: [w], home, away });
      }
    }
  }

  return { games, weeks: L, spoonSeedWithoutGame: null };
}

// ---------------------------------------------------------------------------

export function buildLeagueSchedule(params: {
  /** Team ids in the order to use for the round-robin (shuffle before calling for a random draw). */
  teamIds: string[];
  /** Season weeks the league plays, e.g. [1..16]. Finals take the last ones. */
  weeks: number[];
  finals: FinalsSize;
}): LeagueSchedule {
  const { teamIds, weeks, finals } = params;
  if (teamIds.length < 2) throw new Error("A league needs at least 2 teams");
  if (finals > teamIds.length) throw new Error(`A ${finals}-team final needs at least ${finals} teams`);

  const layout = playoffLayout(teamIds.length, finals);
  if (layout.weeks >= weeks.length) throw new Error("Not enough weeks for a regular season before the finals");

  const regularWeeks = weeks.slice(0, weeks.length - layout.weeks);
  const playoffWeeks = weeks.slice(weeks.length - layout.weeks);

  return {
    regularWeeks,
    playoffWeeks,
    regular: buildRoundRobin(teamIds, regularWeeks),
    playoffs: layout.games.map((g) => ({ ...g, weeks: g.weeks.map((w) => playoffWeeks[w - 1]) })),
    spoonSeedWithoutGame: layout.spoonSeedWithoutGame,
  };
}

// ---------------------------------------------------------------------------
// Filling in playoff teams as results come in.

/** Winner and loser team ids of a decided playoff game. */
export type PlayoffResult = { winnerTeamId: string; loserTeamId: string };

/**
 * Which team a source refers to, once known.
 * seedToTeam: ladder position (1 = top) -> team id, from the final regular-season ladder.
 * results: decided playoff games by key. Returns null while still undecided.
 */
export function resolveSource(
  src: Source,
  seedToTeam: (seed: number) => string | null,
  results: Record<string, PlayoffResult | undefined>
): string | null {
  if ("seed" in src) return seedToTeam(src.seed);
  if ("winnerOf" in src) return results[src.winnerOf]?.winnerTeamId ?? null;
  if ("loserOf" in src) return results[src.loserOf]?.loserTeamId ?? null;

  const keys = "winnerOf_" in src ? src.winnerOf_ : src.loserOf_;
  const teams = keys.map((k) => {
    const r = results[k];
    if (!r) return null;
    return "winnerOf_" in src ? r.winnerTeamId : r.loserTeamId;
  });
  if (teams.some((t) => t == null)) return null;

  const seedOf = (teamId: string) => {
    for (let s = 1; s <= 64; s++) if (seedToTeam(s) === teamId) return s;
    return 999;
  };
  const sorted = (teams as string[]).slice().sort((a, b) => seedOf(a) - seedOf(b));
  return src.pick === "best" ? sorted[0] : sorted[sorted.length - 1];
}
