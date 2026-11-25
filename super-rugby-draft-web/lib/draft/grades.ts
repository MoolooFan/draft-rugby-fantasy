// lib/draft/grades.ts
// Draft grades (Ethan, 25 Nov 2026): when a draft finishes, each team gets A+ to F with a couple
// of bullet points, fixed from then on. Not just expected points:
//   - expected points: each player's points a game, from last season's form blended with where
//     his Draft Rank says he should score (players with few games lean on the Draft Rank);
//   - boom / bust: each player's spread (his good and bad games; wide for players with little
//     history), so a team's ceiling and floor count too, and anyone injured now has no floor;
//   - positional balance: empty starting spots, starting positions with nobody to cover them, and
//     piling bench players into one position all cost.
// Grades are curved within the league (the best team is usually around an A, the weakest a C-).
// Below C- only happens when a team is far behind what drafting by Draft Rank would have given
// it (a deliberately poor draft), so it's very rare.
// Pure: the server part is in lib/draft/gradesServer.ts.
import { assignToSlots, squadSlots, SLOT_KINDS, type SquadFormat } from "@/lib/league/squad";
import { rosterFits, teamForPick } from "@/lib/draft/rules";
import { canPlayPosition } from "@/lib/players/positions";

export type GradePlayer = {
  id: string;
  name: string;
  posAbbrev?: string | null;
  secondaryPosAbbrev?: string | null;
  thirdPosAbbrev?: string | null;
  draftRank?: number | null;
  /** injured / out / suspended right now */
  unavailable?: boolean;
};

export type GradePick = { pick: number; round: number; teamId: string; playerId: string };

export const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"] as const;
export type Grade = (typeof GRADES)[number];

/** z-score (within the league) needed for each grade down to C- */
const CURVE: Array<[number, Grade]> = [
  [1.5, "A+"], [1.0, "A"], [0.6, "A-"], [0.3, "B+"], [0.0, "B"], [-0.3, "B-"], [-0.65, "C+"], [-1.0, "C"],
];
/** below C-: the team's score against a draft made by Draft Rank (par) */
const BELOW: Array<[number, Grade]> = [[0.7, "D+"], [0.62, "D"], [0.55, "D-"]];

const BENCH_WEIGHT = 0.15;
const MIN_GAMES_FOR_FORM = 4;

export type PlayerOutlook = { exp: number; sd: number; games: number };

/**
 * Each player's expected points a game and spread. `history` = his points in each game he
 * played last season.
 */
export function playerOutlooks(players: GradePlayer[], history: Map<string, number[]>): Map<string, PlayerOutlook> {
  // what a Draft Rank is "worth": the points a game of the player with that place on last
  // season's points-a-game list (only players with enough games)
  const ppgs = players
    .map((p) => history.get(p.id) ?? [])
    .filter((g) => g.length >= MIN_GAMES_FOR_FORM)
    .map((g) => g.reduce((a, b) => a + b, 0) / g.length)
    .sort((a, b) => b - a);
  const byRank = [...players].sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999));
  const rankPpg = new Map<string, number>();
  byRank.forEach((p, i) => rankPpg.set(p.id, ppgs.length ? ppgs[Math.min(i, ppgs.length - 1)] * (i < ppgs.length ? 1 : 0.8) : 0));

  const out = new Map<string, PlayerOutlook>();
  for (const p of players) {
    const games = history.get(p.id) ?? [];
    const n = games.length;
    const fromRank = rankPpg.get(p.id) ?? 0;
    const ppg = n ? games.reduce((a, b) => a + b, 0) / n : 0;
    const w = n >= 8 ? 0.6 : n >= MIN_GAMES_FOR_FORM ? 0.45 : n ? 0.2 : 0;
    const exp = w * ppg + (1 - w) * fromRank;
    const sdGames = n >= MIN_GAMES_FOR_FORM ? Math.sqrt(games.reduce((a, b) => a + (b - ppg) ** 2, 0) / (n - 1)) : 0;
    // little history = a wide spread (could be anything)
    const sd = n >= MIN_GAMES_FOR_FORM ? Math.max(sdGames, 0.25 * exp) : 0.5 * exp;
    out.set(p.id, { exp, sd, games: n });
  }
  return out;
}

export type TeamScore = {
  teamId: string;
  /** starters' expected points a round, plus a little for the bench */
  expected: number;
  /** the starters' expected points a round */
  startersExpected: number;
  ceiling: number;
  floor: number;
  balance: number;
  score: number;
  starters: string[];
  bench: string[];
  emptyStarters: number;
  uncovered: string[];
  stacked: Array<{ pos: string; count: number }>;
};

const mainPos = (p: GradePlayer | undefined) => String(p?.posAbbrev ?? "").toUpperCase();

/** One team: who starts (the best line-up), its expected / ceiling / floor, balance and score. */
export function scoreTeam(teamId: string, roster: GradePlayer[], format: SquadFormat, outlook: Map<string, PlayerOutlook>): TeamScore {
  const exp = (p: GradePlayer) => outlook.get(p.id)?.exp ?? 0;
  const sorted = [...roster].sort((a, b) => exp(b) - exp(a));
  const placed = assignToSlots(sorted, format);
  const { starters: starterSlots } = squadSlots(format);
  const starters = starterSlots.map((s) => placed.get(s.id)).filter((p): p is GradePlayer => !!p);
  const startIds = new Set(starters.map((p) => p.id));
  const bench = roster.filter((p) => !startIds.has(p.id));

  let expected = 0, ceiling = 0, floor = 0;
  for (const p of starters) {
    const o = outlook.get(p.id) ?? { exp: 0, sd: 0, games: 0 };
    expected += o.exp;
    ceiling += o.exp + o.sd;
    floor += p.unavailable ? 0 : Math.max(0, o.exp - o.sd);
  }
  const startersExpected = expected;
  expected += BENCH_WEIGHT * bench.reduce((a, p) => a + exp(p), 0);

  // balance
  const emptyStarters = starterSlots.length - starters.length;
  const kinds = new Map<string, number>();
  for (const s of starterSlots) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const uncovered: string[] = [];
  for (const [kind, count] of kinds) {
    const k = SLOT_KINDS.find((x) => x.kind === kind);
    if (!k || k.positions.length > 3) continue; // Forward / Back / Any spots are always coverable
    const cover = bench.some((p) => k.positions.some((pos) => canPlayPosition(p, pos)));
    if (!cover && (count >= 2 || k.kind === "HO" || k.kind === "HB")) uncovered.push(k.kind);
  }
  const benchByPos = new Map<string, number>();
  for (const p of bench) benchByPos.set(mainPos(p), (benchByPos.get(mainPos(p)) ?? 0) + 1);
  const stacked = [...benchByPos].filter(([pos, n]) => pos && n >= 3).map(([pos, count]) => ({ pos, count }));
  const stackExcess = stacked.reduce((a, s) => a + s.count - 2, 0);
  // (a 5-man bench can't cover all 8 positions, so a gap costs little; piling up one position more)
  const balance = Math.max(0.6, 1 - 0.2 * emptyStarters - 0.012 * uncovered.length - 0.025 * stackExcess);

  // reliable points count a little more than the upside
  const score = balance * (0.55 * expected + 0.25 * floor + 0.2 * ceiling);
  return { teamId, expected, startersExpected, ceiling, floor, balance, score, starters: starters.map((p) => p.id), bench: bench.map((p) => p.id), emptyStarters, uncovered, stacked };
}

/** "Par": what each spot would have got drafting purely by Draft Rank (keeping the positions legal). */
export function parScores(order: string[], players: GradePlayer[], format: SquadFormat, size: number, outlook: Map<string, PlayerOutlook>): number[] {
  const pool = [...players].sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999));
  const taken = new Set<string>();
  const rosters = new Map<string, GradePlayer[]>(order.map((t) => [t, []]));
  for (let n = 1; n <= order.length * size; n++) {
    const team = teamForPick(order, n)!;
    const roster = rosters.get(team)!;
    const p = pool.find((x) => !taken.has(x.id) && rosterFits([...roster, x], format));
    if (!p) break;
    taken.add(p.id);
    roster.push(p);
  }
  return order.map((t) => scoreTeam(t, rosters.get(t)!, format, outlook).score);
}

/** The grade for a team's score, given the league's scores and par. */
export function gradeFor(score: number, all: number[], par: number): Grade {
  if (par > 0) {
    const ratio = score / par;
    if (ratio < BELOW[BELOW.length - 1][0] - 0.08) return "F";
    for (let i = BELOW.length - 1; i >= 0; i--) if (ratio < BELOW[i][0]) return BELOW[i][1];
  }
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const sdRaw = all.length > 1 ? Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / (all.length - 1)) : 0;
  const sd = Math.max(sdRaw, 0.04 * mean, 1e-9); // close leagues don't swing from A+ to C-
  const z = (score - mean) / sd;
  for (const [cut, g] of CURVE) if (z >= cut) return g;
  return "C-";
}

export type TeamGradeFacts = {
  teamName: string;
  grade: Grade;
  rank: number;
  teams: number;
  expectedPerRound: number;
  ceiling: number;
  floor: number;
  firstPick: { name: string; pick: number } | null;
  bestValue: { name: string; pick: number; draftRank: number } | null;
  biggestReach: { name: string; pick: number; draftRank: number } | null;
  strongest: string | null;
  weakest: string | null;
  uncovered: string[];
  stacked: Array<{ pos: string; count: number }>;
  emptyStarters: number;
  boom: string[];
  risks: string[];
  /** every pick, for the coach: position, pick, Draft Rank, last season's points a game and games, starter or bench, spread */
  squad: Array<{ name: string; pos: string; pick: number; draftRank: number | null; expected: number; lastSeasonPpg: number | null; games: number; role: "starter" | "bench"; profile: "steady" | "boom or bust" | "unknown" }>;
};

export type TeamGrade = { teamId: string; grade: Grade; score: number; rank: number; facts: TeamGradeFacts; bullets: string[] };

const POS_GROUP: Record<string, string> = {
  PR: "props", HO: "hooker", LK: "locks", LF: "loose forwards", HB: "halfback", FH: "first five", CE: "midfield", OB: "back three",
};

/** Every team's grade, facts and plain bullet points. */
export function gradeDraft(args: {
  order: string[];
  teamNames: Map<string, string>;
  picks: GradePick[];
  players: GradePlayer[];
  history: Map<string, number[]>;
  format: SquadFormat;
  size: number;
}): TeamGrade[] {
  const { order, picks, players, history, format, size } = args;
  const byId = new Map(players.map((p) => [p.id, p]));
  const outlook = playerOutlooks(players, history);
  const rosters = new Map<string, GradePlayer[]>(order.map((t) => [t, []]));
  for (const pk of picks) {
    const p = byId.get(pk.playerId);
    if (p) rosters.get(pk.teamId)?.push(p);
  }
  const scored = order.map((t) => scoreTeam(t, rosters.get(t) ?? [], format, outlook));
  const pars = parScores(order, players, format, size, outlook);
  const par = [...pars].sort((a, b) => a - b)[Math.floor(pars.length / 2)] ?? 0;
  // the curve leaves out a team that's far below par (a deliberately poor draft), so one tanked
  // team doesn't lift everyone else's grades
  const curved = scored.filter((s) => !(par > 0 && s.score / par < BELOW[0][0])).map((s) => s.score);
  const all = curved.length >= 2 ? curved : scored.map((s) => s.score);
  const ranked = [...scored].sort((a, b) => b.score - a.score);

  // position groups' expected points across the league (strongest / weakest for each team)
  const groupPts = (s: TeamScore) => {
    const m = new Map<string, number>();
    for (const id of s.starters) {
      const pos = mainPos(byId.get(id));
      m.set(pos, (m.get(pos) ?? 0) + (outlook.get(id)?.exp ?? 0));
    }
    return m;
  };
  const groups = new Map(scored.map((s) => [s.teamId, groupPts(s)]));
  const posList = Object.keys(POS_GROUP);
  const leagueAvg = new Map(posList.map((pos) => [pos, scored.reduce((a, s) => a + (groups.get(s.teamId)!.get(pos) ?? 0), 0) / Math.max(1, scored.length)]));

  return scored.map((s) => {
    const grade = gradeFor(s.score, all, par);
    const rank = ranked.findIndex((x) => x.teamId === s.teamId) + 1;
    const mine = picks.filter((p) => p.teamId === s.teamId).sort((a, b) => a.pick - b.pick);
    const withRank = mine.map((p) => ({ p, pl: byId.get(p.playerId) })).filter((x) => x.pl && x.pl.draftRank != null) as Array<{ p: GradePick; pl: GradePlayer }>;
    const value = [...withRank].sort((a, b) => (b.p.pick - (b.pl.draftRank ?? 0)) - (a.p.pick - (a.pl.draftRank ?? 0)))[0];
    const reach = [...withRank].sort((a, b) => ((b.pl.draftRank ?? 0) - b.p.pick) - ((a.pl.draftRank ?? 0) - a.p.pick))[0];
    const g = groups.get(s.teamId)!;
    const rel = posList
      .filter((pos) => (leagueAvg.get(pos) ?? 0) > 0)
      .map((pos) => ({ pos, r: (g.get(pos) ?? 0) / (leagueAvg.get(pos) ?? 1) }))
      .sort((a, b) => b.r - a.r);
    const boom = s.starters
      .map((id) => ({ id, o: outlook.get(id)! }))
      .filter((x) => x.o && x.o.games >= MIN_GAMES_FOR_FORM && x.o.sd > 0.45 * x.o.exp)
      .sort((a, b) => b.o.exp + b.o.sd - (a.o.exp + a.o.sd))
      .slice(0, 2)
      .map((x) => byId.get(x.id)!.name);
    const risks = s.starters
      .map((id) => byId.get(id)!)
      .filter((p) => p.unavailable || (outlook.get(p.id)?.games ?? 0) < 3)
      .slice(0, 3)
      .map((p) => `${p.name}${p.unavailable ? " (injured / out now)" : " (few games last season)"}`);
    const startSet = new Set(s.starters);
    const squad = mine.map((pk) => {
      const pl = byId.get(pk.playerId);
      const o = outlook.get(pk.playerId) ?? { exp: 0, sd: 0, games: 0 };
      const hist = history.get(pk.playerId) ?? [];
      return {
        name: pl?.name ?? "?",
        pos: [pl?.posAbbrev, pl?.secondaryPosAbbrev, pl?.thirdPosAbbrev].filter(Boolean).join("/"),
        pick: pk.pick,
        draftRank: pl?.draftRank ?? null,
        expected: Math.round(o.exp * 10) / 10,
        lastSeasonPpg: hist.length ? Math.round((hist.reduce((a, b) => a + b, 0) / hist.length) * 10) / 10 : null,
        games: o.games,
        role: startSet.has(pk.playerId) ? ("starter" as const) : ("bench" as const),
        profile: o.games < MIN_GAMES_FOR_FORM ? ("unknown" as const) : o.sd > 0.45 * o.exp ? ("boom or bust" as const) : ("steady" as const),
      };
    });
    const facts: TeamGradeFacts = {
      teamName: args.teamNames.get(s.teamId) ?? s.teamId,
      grade,
      rank,
      teams: order.length,
      expectedPerRound: Math.round(s.startersExpected),
      ceiling: Math.round(s.ceiling),
      floor: Math.round(s.floor),
      firstPick: mine[0] ? { name: byId.get(mine[0].playerId)?.name ?? "?", pick: mine[0].pick } : null,
      bestValue: value && value.p.pick - (value.pl.draftRank ?? 0) >= 1.5 * order.length ? { name: value.pl.name, pick: value.p.pick, draftRank: value.pl.draftRank ?? 0 } : null,
      biggestReach: reach && (reach.pl.draftRank ?? 0) - reach.p.pick >= 2 * order.length ? { name: reach.pl.name, pick: reach.p.pick, draftRank: reach.pl.draftRank ?? 0 } : null,
      strongest: rel[0] && rel[0].r > 1.1 ? POS_GROUP[rel[0].pos] : null,
      weakest: rel.length && rel[rel.length - 1].r < 0.9 ? POS_GROUP[rel[rel.length - 1].pos] : null,
      uncovered: s.uncovered,
      stacked: s.stacked,
      emptyStarters: s.emptyStarters,
      boom,
      risks,
      squad,
    };
    return { teamId: s.teamId, grade, score: s.score, rank, facts, bullets: plainBullets(facts) };
  });
}

const KIND_NAME: Record<string, string> = { PR: "prop", HO: "hooker", LK: "lock", LF: "loose forward", HB: "halfback", FH: "first five", CE: "centre", OB: "outside back", TF: "tight five", HV: "halves" };

const plural = (group: string) => /s$/.test(group) && group !== "back three";
const both = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

/**
 * Two or three plain bullet points from the facts, as full sentences (Ethan, 25 Nov 2026: no
 * "Label:" style), until the coach writes better ones.
 */
export function plainBullets(f: TeamGradeFacts): string[] {
  const out: string[] = [];
  if (f.bestValue) out.push(`${f.bestValue.name} was the best value, taken at pick ${f.bestValue.pick} with a Draft Rank of ${f.bestValue.draftRank}.`);
  if (f.strongest) out.push(`The ${f.strongest} ${plural(f.strongest) ? "are" : "is"} the strongest part of this squad.`);
  if (f.emptyStarters) out.push(`${f.emptyStarters === 1 ? "One starting spot is" : `${f.emptyStarters} starting spots are`} still empty, which costs points every round.`);
  else if (f.stacked.length) out.push(`With ${f.stacked[0].count} ${KIND_NAME[f.stacked[0].pos] ?? f.stacked[0].pos}s on the bench, the squad leans heavily one way.`);
  else if (f.uncovered.length) out.push(`There's no bench cover at ${f.uncovered.slice(0, 2).map((k) => KIND_NAME[k] ?? k).join(" or ")}, so one injury there leaves a hole.`);
  else if (f.weakest) out.push(`The ${f.weakest} ${plural(f.weakest) ? "look" : "looks"} like the weakest part of this squad.`);
  const risk = f.risks[0] ? /^(.*) \((injured \/ out now|few games last season)\)$/.exec(f.risks[0]) : null;
  if (risk) out.push(risk[2] === "injured / out now" ? `${risk[1]} is a risk early on, as he's injured or out right now.` : `${risk[1]} is a gamble, with only a few games last season to go on.`);
  else if (f.boom.length) out.push(`${both(f.boom)} ${f.boom.length > 1 ? "are" : "is"} boom or bust, capable of winning or losing a round on ${f.boom.length > 1 ? "their" : "his"} own.`);
  if (out.length < 2 && f.biggestReach) out.push(`${f.biggestReach.name} was a reach at pick ${f.biggestReach.pick}, with a Draft Rank of ${f.biggestReach.draftRank}.`);
  if (out.length < 2) out.push(`Expect about ${f.expectedPerRound} points a round: around ${f.floor} on a bad day and ${f.ceiling} on a good one.`);
  return out.slice(0, 3);
}

