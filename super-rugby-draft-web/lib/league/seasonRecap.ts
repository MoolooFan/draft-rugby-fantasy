// lib/league/seasonRecap.ts
// The season recap (Ethan, 12 Nov 2026): shown once when a league's season is over and kept to
// view again any time (Team Details). Your season (ladder, record, points, honour), your best
// players, your shield story and weekly crowns / spoons, a league roundup, and stories about
// your team: a player added during the season who became a star, a late draft pick who starred,
// an early pick who flopped, a comeback (or slump) up the ladder, winning streaks, biggest win.
// Pure code: the route (app/api/recap/season) loads the data.
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";
import { seasonHonours, type HonourMatchup, type HonourPlace } from "@/lib/league/honours";
import { weeklyAwards } from "@/lib/league/weeklyAwards";
import type { ShieldEvent, ShieldReign } from "@/lib/league/shield";

export type SeasonMatchup = HonourMatchup & { weeks: number[]; label: string | null };
export type SeasonWeekResult = { week: number; team_id: string; score: number; player_points: Record<string, number> | null };

export type SeasonStory = { kind: "pickup" | "steal" | "bust" | "comeback" | "slump" | "streak" | "big_win"; text: string };

export type SeasonRecap = {
  season: number;
  you: {
    position: number;
    teams: number;
    wins: number;
    draws: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    honour: HonourPlace | null;
  };
  topPlayers: Array<{ id: string; name: string; points: number; games: number }>;
  bestGame: { id: string; name: string; points: number; week: number } | null;
  worstGame: { id: string; name: string; points: number; week: number } | null;
  crowns: number;
  spoons: number;
  shield: { name: string; won: number; defences: number; lost: number; holdsIt: boolean } | null;
  league: {
    champion: string | null;
    spoon: string | null;
    highestScore: { teamId: string; score: number; week: number } | null;
    mostCrowns: { teamIds: string[]; count: number } | null;
    topPlayer: { id: string; name: string; points: number; teamId: string } | null;
  };
  stories: SeasonStory[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function buildSeasonRecap(input: {
  season: number;
  myTeamId: string;
  teams: Array<{ id: string; name: string }>;
  matchups: SeasonMatchup[];
  results: SeasonWeekResult[];
  /** this league's draft: pick number per player, and the number of teams (for the round) */
  picks: Array<{ team_id: string; player_id: string; pick_number: number }>;
  playerName: (id: string) => string;
  shield?: { name: string; events: ShieldEvent[]; reigns: ShieldReign[]; holderTeamId: string | null; ownerOf: (teamId: string) => string | null } | null;
}): SeasonRecap {
  const { myTeamId, matchups, results } = input;
  const teamIds = input.teams.map((t) => t.id);
  const nameOf = (id: string | null) => input.teams.find((t) => t.id === id)?.name ?? "—";
  const regular = matchups.filter((m) => m.kind === "regular") as Array<SeasonMatchup & LadderMatchup>;
  const regularWeeks = [...new Set(regular.flatMap((m) => m.weeks))].sort((a, b) => a - b);

  // ---- your season
  const ladder = buildLadder(teamIds, regular);
  const myIndex = ladder.findIndex((r) => r.teamId === myTeamId);
  const myRow = myIndex >= 0 ? { ...ladder[myIndex], rank: myIndex + 1 } : null;
  const honours = seasonHonours(teamIds, matchups) ?? [];
  const honour = honours.find((h) => h.teamId === myTeamId)?.place ?? null;

  // ---- players who scored for you (points that counted, before the captain's x2)
  const mine = results.filter((r) => r.team_id === myTeamId);
  const byPlayer = new Map<string, { points: number; games: number; firstWeek: number }>();
  let bestGame: SeasonRecap["bestGame"] = null;
  let worstGame: SeasonRecap["worstGame"] = null;
  for (const r of mine) {
    for (const [id, raw] of Object.entries(r.player_points ?? {})) {
      const p = Number(raw) || 0;
      const b = byPlayer.get(id) ?? { points: 0, games: 0, firstWeek: r.week };
      b.points += p;
      b.games++;
      b.firstWeek = Math.min(b.firstWeek, r.week);
      byPlayer.set(id, b);
      if (!bestGame || p > bestGame.points) bestGame = { id, name: input.playerName(id), points: p, week: r.week };
      if (!worstGame || p < worstGame.points) worstGame = { id, name: input.playerName(id), points: p, week: r.week };
    }
  }
  const ranked = [...byPlayer].map(([id, b]) => ({ id, name: input.playerName(id), points: Math.round(b.points), games: b.games, firstWeek: b.firstWeek }))
    .sort((a, b) => b.points - a.points);

  // ---- crowns, spoons (regular season)
  const awards = weeklyAwards(results.filter((r) => regularWeeks.includes(r.week)).map((r) => ({ week: r.week, teamId: r.team_id, score: r.score })));
  const crowns = awards.weeks.filter((w) => w.crown.includes(myTeamId)).length;
  const spoons = awards.weeks.filter((w) => w.spoon.includes(myTeamId)).length;
  const crownCount = new Map<string, number>();
  for (const w of awards.weeks) for (const t of w.crown) crownCount.set(t, (crownCount.get(t) ?? 0) + 1);
  const maxCrowns = Math.max(0, ...crownCount.values());

  // ---- shield
  let shield: SeasonRecap["shield"] = null;
  if (input.shield) {
    const ev = input.shield.events;
    const won = ev.filter((e) => (e.kind === "won" || e.kind === "awarded") && e.holderTeamId === myTeamId).length;
    const defences = ev.filter((e) => e.kind === "defended" && e.holderTeamId === myTeamId).length;
    const lost = ev.filter((e) => e.kind === "won" && e.otherTeamId === myTeamId).length;
    const holdsIt = input.shield.holderTeamId === myTeamId;
    if (won || defences || lost || holdsIt) shield = { name: input.shield.name, won, defences, lost, holdsIt };
  }

  // ---- league roundup
  const champion = honours.find((h) => h.place === "champion")?.teamId ?? null;
  const spoonTeam = honours.find((h) => h.place === "wooden_spoon")?.teamId ?? null;
  const highest = results.reduce<SeasonRecap["league"]["highestScore"]>((a, r) => (!a || r.score > a.score ? { teamId: r.team_id, score: r.score, week: r.week } : a), null);
  const playerTotals = new Map<string, { points: number; byTeam: Map<string, number> }>();
  for (const r of results) {
    for (const [id, raw] of Object.entries(r.player_points ?? {})) {
      const t = playerTotals.get(id) ?? { points: 0, byTeam: new Map() };
      t.points += Number(raw) || 0;
      t.byTeam.set(r.team_id, (t.byTeam.get(r.team_id) ?? 0) + (Number(raw) || 0));
      playerTotals.set(id, t);
    }
  }
  const top = [...playerTotals].sort((a, b) => b[1].points - a[1].points)[0];
  const topPlayer = top
    ? { id: top[0], name: input.playerName(top[0]), points: Math.round(top[1].points), teamId: [...top[1].byTeam].sort((a, b) => b[1] - a[1])[0][0] }
    : null;

  // ---- stories
  const stories: SeasonStory[] = [];
  const nTeams = Math.max(1, teamIds.length);
  const myPicks = new Map(input.picks.filter((p) => p.team_id === myTeamId).map((p) => [p.player_id, Math.ceil(p.pick_number / nTeams)]));
  const rounds = Math.max(0, ...myPicks.values());
  const rankOf = (id: string) => ranked.findIndex((r) => r.id === id) + 1;
  const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 >= 11 && n % 100 <= 13) || n % 10 > 3 ? 0 : n % 10]}`;

  // a player added during the season who became one of your best
  const pickup = ranked.find((r) => !myPicks.has(r.id) && rankOf(r.id) <= 5 && r.points > 0);
  if (pickup) stories.push({ kind: "pickup", text: `${pickup.name}, added in round ${pickup.firstWeek}, became your ${ordinal(rankOf(pickup.id))} best scorer with ${pickup.points} points.` });

  // a late draft pick who starred
  const steal = ranked.find((r) => (myPicks.get(r.id) ?? 0) > Math.max(3, rounds / 2) && rankOf(r.id) <= 3);
  if (steal) stories.push({ kind: "steal", text: `Draft steal: ${steal.name}, your round ${myPicks.get(steal.id)} pick, scored ${steal.points} points (${ordinal(rankOf(steal.id))} on your team).` });

  // an early draft pick who flopped (rounds 1-3, below your team's median scorer)
  const median = ranked.length ? ranked[Math.floor(ranked.length / 2)].points : 0;
  const early = [...myPicks].filter(([, rd]) => rd <= 3).map(([id, rd]) => ({ id, rd, pts: byPlayer.get(id)?.points ?? 0 }))
    .sort((a, b) => a.pts - b.pts)[0];
  if (early && early.pts < median) stories.push({ kind: "bust", text: `Draft bust: ${input.playerName(early.id)}, your round ${early.rd} pick, only scored ${Math.round(early.pts)} points for you.` });

  // a comeback (or slump) up the ladder: a third of the way in vs the end
  if (regularWeeks.length >= 6 && myRow) {
    const cut = regularWeeks[Math.ceil(regularWeeks.length / 3) - 1];
    const early3 = buildLadder(teamIds, regular.filter((m) => Math.max(...m.weeks) <= cut));
    const was = early3.findIndex((r) => r.teamId === myTeamId) + 1;
    const now = myRow.rank;
    if (was > nTeams / 2 && now <= Math.ceil(nTeams / 2) && was - now >= 2) stories.push({ kind: "comeback", text: `Comeback: ${ordinal(was)} after round ${cut}, finished the regular season ${ordinal(now)}.` });
    else if (was <= 2 && now > nTeams / 2) stories.push({ kind: "slump", text: `Slump: ${ordinal(was)} after round ${cut}, finished the regular season ${ordinal(now)}.` });
  }

  // longest winning streak and biggest win (regular season)
  let streak = 0, best = 0, bigWin: { margin: number; opp: string; week: number } | null = null;
  for (const w of regularWeeks) {
    const m = regular.find((x) => x.weeks.includes(w) && (x.home_team_id === myTeamId || x.away_team_id === myTeamId) && x.away_team_id);
    if (!m || m.status !== "final" || m.home_score == null || m.away_score == null) continue;
    const home = m.home_team_id === myTeamId;
    const diff = (home ? m.home_score - m.away_score : m.away_score - m.home_score);
    if (diff > 0) {
      streak++;
      best = Math.max(best, streak);
      const opp = (home ? m.away_team_id : m.home_team_id) as string;
      if (!bigWin || diff > bigWin.margin) bigWin = { margin: diff, opp, week: w };
    } else streak = 0;
  }
  if (best >= 3) stories.push({ kind: "streak", text: `Won ${best} in a row at your best.` });
  if (bigWin) stories.push({ kind: "big_win", text: `Biggest win: by ${bigWin.margin} against ${nameOf(bigWin.opp)} in round ${bigWin.week}.` });

  return {
    season: input.season,
    you: {
      position: myRow?.rank ?? 0,
      teams: nTeams,
      wins: myRow?.won ?? 0,
      draws: myRow?.drawn ?? 0,
      losses: myRow?.lost ?? 0,
      pointsFor: Math.round(myRow?.pointsFor ?? sum(mine.map((r) => r.score))),
      pointsAgainst: Math.round(myRow?.pointsAgainst ?? 0),
      honour,
    },
    topPlayers: ranked.slice(0, 3).map(({ id, name, points, games }) => ({ id, name, points, games })),
    bestGame,
    worstGame,
    crowns,
    spoons,
    shield,
    league: {
      champion,
      spoon: spoonTeam,
      highestScore: highest,
      mostCrowns: maxCrowns ? { teamIds: [...crownCount].filter(([, n]) => n === maxCrowns).map(([t]) => t), count: maxCrowns } : null,
      topPlayer,
    },
    stories,
  };
}
