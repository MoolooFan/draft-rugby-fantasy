// lib/league/recap.ts
// The weekly recap (plan item E7, agreed with Ethan Nov 2026): shown the first time you open
// the site after a round is finalised, once per league. Your matchup result, your best player,
// your biggest dud (lowest-scoring starter - a starter who didn't play was replaced by a sub,
// so he isn't counted), the league's crown and spoon, your ladder change and your next
// opponent. Pure code: the route (app/api/recap) loads the data.
import type { Lineup } from "@/lib/scoring/week";
import { isBenchSlot } from "@/lib/league/squad";
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";
import { weeklyAwards } from "@/lib/league/weeklyAwards";

export type RecapMatchup = LadderMatchup & {
  label: string | null;
  weeks: number[];
};

export type RecapWeekResult = {
  week: number;
  team_id: string;
  score: number;
  final_lineup: Lineup | null;
  player_points: Record<string, number> | null;
  captain_used_id: string | null;
};

export type RecapPlayer = { id: string; name: string; points: number; captain: boolean };

export type Recap = {
  week: number;
  matchup:
    | {
        kind: "game";
        label: string | null;
        opponentId: string;
        myScore: number | null;
        oppScore: number | null;
        result: "win" | "loss" | "draw" | "in progress";
        /** a game over several weeks: "week 1 of 2" */
        part: string | null;
      }
    | { kind: "bye"; myScore: number | null }
    | null;
  best: RecapPlayer | null;
  dud: RecapPlayer | null;
  crown: { teamIds: string[]; score: number } | null;
  spoon: { teamIds: string[]; score: number } | null;
  ladder: { before: number | null; after: number; teams: number } | null;
  next: { opponentId: string | null; label: string | null; week: number } | null;
};

export function buildRecap(input: {
  week: number;
  myTeamId: string;
  teamIds: string[];
  matchups: RecapMatchup[];
  results: RecapWeekResult[];
  playerName: (id: string) => string;
}): Recap {
  const { week, myTeamId, matchups, results } = input;
  const mine = results.find((r) => r.week === week && r.team_id === myTeamId) ?? null;
  const scoreOf = (teamId: string | null, w: number) =>
    teamId ? results.find((r) => r.week === w && r.team_id === teamId)?.score ?? null : null;
  const involves = (m: RecapMatchup) => m.home_team_id === myTeamId || m.away_team_id === myTeamId;

  // ---- matchup ----
  let matchup: Recap["matchup"] = null;
  const game = matchups.find((m) => m.weeks.includes(week) && involves(m));
  if (game) {
    const home = game.home_team_id === myTeamId;
    const opp = home ? game.away_team_id : game.home_team_id;
    if (!opp) {
      matchup = { kind: "bye", myScore: mine?.score ?? (home ? game.home_score : null) };
    } else {
      const weeks = [...game.weeks].sort((a, b) => a - b);
      const last = weeks[weeks.length - 1] === week;
      let myScore = scoreOf(myTeamId, week);
      let oppScore = scoreOf(opp, week);
      if (weeks.length > 1 && last && game.status === "final") {
        // a game over several weeks: the totals decide it
        myScore = home ? game.home_score : game.away_score;
        oppScore = home ? game.away_score : game.home_score;
      } else if (myScore == null && weeks.length === 1) {
        myScore = home ? game.home_score : game.away_score;
        oppScore = home ? game.away_score : game.home_score;
      }
      const decided = (weeks.length === 1 || last) && myScore != null && oppScore != null;
      const result: "win" | "loss" | "draw" | "in progress" = !decided
        ? "in progress"
        : myScore! > oppScore!
          ? "win"
          : myScore! < oppScore!
            ? "loss"
            : "draw";
      matchup = {
        kind: "game",
        label: game.kind === "regular" ? null : game.label,
        opponentId: opp,
        myScore,
        oppScore,
        result,
        part: weeks.length > 1 ? `week ${weeks.indexOf(week) + 1} of ${weeks.length}` : null,
      };
    }
  }

  // ---- best player and biggest dud (players who counted for your team) ----
  let best: RecapPlayer | null = null;
  let dud: RecapPlayer | null = null;
  if (mine?.player_points) {
    const pts = mine.player_points;
    const player = (id: string): RecapPlayer => ({
      id,
      name: input.playerName(id),
      points: Number(pts[id] ?? 0),
      captain: mine.captain_used_id === id,
    });
    const counted = Object.keys(pts);
    // starting slots = everything but the bench (any league's squad)
    const starters = Object.entries(mine.final_lineup ?? {}).filter(([s]) => !isBenchSlot(s)).map(([, p]) => p?.id).filter((x): x is string => !!x);
    const pool = starters.length ? starters : counted;
    if (counted.length) best = counted.map(player).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))[0];
    if (pool.length) dud = pool.map(player).sort((a, b) => a.points - b.points || a.name.localeCompare(b.name))[0];
    if (best && dud && best.id === dud.id) dud = null;
  }

  // ---- crown and spoon for this week (regular season only) ----
  const regularThisWeek = matchups.some((m) => m.kind === "regular" && m.weeks.includes(week));
  let crown: Recap["crown"] = null;
  let spoon: Recap["spoon"] = null;
  if (regularThisWeek) {
    const a = weeklyAwards(results.filter((r) => r.week === week).map((r) => ({ week, teamId: r.team_id, score: r.score }))).latest;
    if (a) {
      crown = { teamIds: a.crown, score: a.top };
      spoon = { teamIds: a.spoon, score: a.bottom };
    }
  }

  // ---- ladder: where you were before this week and where you are now ----
  let ladder: Recap["ladder"] = null;
  if (regularThisWeek) {
    const upTo = (w: number) => matchups.filter((m) => m.kind === "regular" && Math.max(...m.weeks) <= w);
    const pos = (rows: ReturnType<typeof buildLadder>) => rows.findIndex((r) => r.teamId === myTeamId) + 1 || null;
    const before = upTo(week - 1).some((m) => m.status === "final") ? pos(buildLadder(input.teamIds, upTo(week - 1))) : null;
    const after = pos(buildLadder(input.teamIds, upTo(week)));
    if (after) ladder = { before, after, teams: input.teamIds.length };
  }

  // ---- next opponent ----
  let next: Recap["next"] = null;
  const upcoming = matchups
    .filter((m) => involves(m) && Math.min(...m.weeks) > week)
    .sort((a, b) => Math.min(...a.weeks) - Math.min(...b.weeks))[0];
  if (upcoming) {
    next = {
      opponentId: upcoming.home_team_id === myTeamId ? upcoming.away_team_id : upcoming.home_team_id,
      label: upcoming.kind === "regular" ? null : upcoming.label,
      week: Math.min(...upcoming.weeks),
    };
  }

  return { week, matchup, best, dud, crown, spoon, ladder, next };
}
