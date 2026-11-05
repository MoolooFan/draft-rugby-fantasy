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
// - Knocked-out finalists keep playing: semi-final losers play a 3rd place game; in 6-team
//   finals the elimination-final losers play for 5th over the last two weeks (scores added).
// - No finals: champion and spoon are the top and bottom of the ladder.
// - Regular season: everyone plays everyone once before playing anyone again. With an odd
//   number of teams, if the weeks don't divide evenly, the last partial rotation is decided
//   week by week from the ladder so the extra byes go to the teams highest on the ladder
//   (and the extra games to the teams lower down).

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

/** One round of the rotation: a game for every team (one bye if the number of teams is odd). */
export type RotationRound = { byeTeamId: string | null; games: Array<{ homeTeamId: string; awayTeamId: string }> };

/** Regular-season weeks whose matchups are picked from the ladder when the week comes up. */
export type WeeksToDecide = { weeks: number[]; rounds: RotationRound[] };

export type LeagueSchedule = {
  regularWeeks: number[];
  playoffWeeks: number[];
  /** Fixed regular-season games (includes byes as awayTeamId: null). */
  regular: RegularGame[];
  /** Odd leagues only, when byes can't come out even: see pickRoundForWeek. */
  regularToDecide: WeeksToDecide | null;
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

/** The full rotation: n-1 rounds (n rounds with a bye when the number of teams is odd). */
export function rotationRounds(teamIds: string[]): RotationRound[] {
  if (teamIds.length < 2) return [];
  const ids: Array<string | null> = [...teamIds];
  if (ids.length % 2 === 1) ids.push(null);
  const n = ids.length;
  const rounds: RotationRound[] = [];
  let wheel = [...ids];
  for (let round = 0; round < n - 1; round++) {
    const r: RotationRound = { byeTeamId: null, games: [] };
    for (let i = 0; i < n / 2; i++) {
      const [x, y] = round % 2 === 0 ? [wheel[i], wheel[n - 1 - i]] : [wheel[n - 1 - i], wheel[i]];
      if (x == null || y == null) r.byeTeamId = (x ?? y) as string;
      else r.games.push({ homeTeamId: x, awayTeamId: y });
    }
    rounds.push(r);
    // keep the first team fixed, rotate the rest
    wheel = [wheel[0], wheel[n - 1], ...wheel.slice(1, n - 1)];
  }
  return rounds;
}

function roundToGames(r: RotationRound, week: number, flip: boolean): RegularGame[] {
  const out: RegularGame[] = r.games.map((g) =>
    flip ? { week, homeTeamId: g.awayTeamId, awayTeamId: g.homeTeamId } : { week, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId }
  );
  if (r.byeTeamId) out.push({ week, homeTeamId: r.byeTeamId, awayTeamId: null });
  return out;
}

export function buildRoundRobin(teamIds: string[], weeks: number[]): { fixed: RegularGame[]; toDecide: WeeksToDecide | null } {
  const rounds = rotationRounds(teamIds);
  if (!rounds.length) return { fixed: [], toDecide: null };
  const odd = teamIds.length % 2 === 1;
  const fullWeeks = odd ? weeks.length - (weeks.length % rounds.length) : weeks.length;

  const fixed: RegularGame[] = [];
  weeks.slice(0, fullWeeks).forEach((week, i) => {
    // swap home/away on every second pass through the rotation
    const flip = Math.floor(i / rounds.length) % 2 === 1;
    fixed.push(...roundToGames(rounds[i % rounds.length], week, flip));
  });

  const rest = weeks.slice(fullWeeks);
  if (!rest.length) return { fixed, toDecide: null };
  const flip = Math.floor(fullWeeks / rounds.length) % 2 === 1;
  const flipped = rounds.map((r) => ({
    byeTeamId: r.byeTeamId,
    games: flip ? r.games.map((g) => ({ homeTeamId: g.awayTeamId, awayTeamId: g.homeTeamId })) : r.games,
  }));
  return { fixed, toDecide: { weeks: rest, rounds: flipped } };
}

/**
 * Picks the matchups for one of the regularToDecide weeks: of the rotation rounds not used
 * yet, the one whose bye goes to the team highest on the ladder.
 * ladder: team ids, top first. usedRounds: indexes already picked for earlier weeks.
 */
export function pickRoundForWeek(toDecide: WeeksToDecide, week: number, ladder: string[], usedRounds: number[]): { roundIndex: number; games: RegularGame[] } {
  const used = new Set(usedRounds);
  const pos = (id: string | null) => (id == null ? 999 : ladder.indexOf(id) < 0 ? 999 : ladder.indexOf(id));
  let best = -1;
  toDecide.rounds.forEach((r, i) => {
    if (used.has(i)) return;
    if (best < 0 || pos(r.byeTeamId) < pos(toDecide.rounds[best].byeTeamId)) best = i;
  });
  if (best < 0) throw new Error("No rotation rounds left to pick");
  return { roundIndex: best, games: roundToGames(toDecide.rounds[best], week, false) };
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
        { key: "3P", bracket: "finals", label: "3rd Place Playoff", weeks: [2], home: { loserOf: "SF1" }, away: { loserOf: "SF2" } },
      ];
    case 6:
      return [
        { key: "EF1", bracket: "finals", label: "Elimination Final 1", weeks: [1], home: s(3), away: s(6) },
        { key: "EF2", bracket: "finals", label: "Elimination Final 2", weeks: [1], home: s(4), away: s(5) },
        { key: "SF1", bracket: "finals", label: "Semi Final 1", weeks: [2], home: s(1), away: { winnerOf_: ["EF1", "EF2"], pick: "worst" } },
        { key: "SF2", bracket: "finals", label: "Semi Final 2", weeks: [2], home: s(2), away: { winnerOf_: ["EF1", "EF2"], pick: "best" } },
        { key: "GF", bracket: "finals", label: "Grand Final", weeks: [3], home: { winnerOf: "SF1" }, away: { winnerOf: "SF2" }, decides: "champion" },
        { key: "3P", bracket: "finals", label: "3rd Place Playoff", weeks: [3], home: { loserOf: "SF1" }, away: { loserOf: "SF2" } },
        { key: "5P", bracket: "finals", label: "5th Place Playoff (2 weeks, scores added together)", weeks: [2, 3], home: { loserOf: "EF1" }, away: { loserOf: "EF2" } },
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

  const rr = buildRoundRobin(teamIds, regularWeeks);
  return {
    regularWeeks,
    playoffWeeks,
    regular: rr.fixed,
    regularToDecide: rr.toDecide,
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
