// lib/projections/server.ts (server only)
// Every player's expected points for one fantasy week, from the database: this season's and
// last season's stats, team lists / injury list (weekly statuses), Ethan's player notes, the
// fixtures and difficulty ratings. The maths is in project.ts / live.ts (tested on 2026).
//
// Before a team's list is out: expected lineup from his earlier lists (and Ethan's role note);
// once it's out: his real role (not named = 0). Injured / suspended / out = 0 until the status
// is removed. Byes = 0.
import { savedMatchScores } from "@/lib/results/matchScores";
import type { MatchScore } from "@/lib/fixtures/scores";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFrontRow, statCountsFromRaw, type ScoringRules, type StatCounts } from "@/lib/scoring";
import { loadSeasonPlayers, type SitePlayer } from "@/lib/players/db";
import { fantasyWeekForRealRound, getSeason, kickoffMs, realRoundsForWeek, SEASONS, type SeasonFixture } from "@/lib/season";
import { statusKind } from "@/lib/status/kind";
import { teamCodeFromName } from "@/lib/status/articles";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import {
  averageRates, dutyKicker, expectedRole, kickingOrder, kickingPoints, lineoutStealFactor, opponentWeakness,
  projectPoints, projectPointsExpectedLineup, seasonPrior, teamStrength,
  type ListRole, type PastGame, type RoleChances, type RoleNote, type StatRates, type TeamGame, type TeamStrength,
} from "@/lib/projections/project";
import { lineupSpread, playerSpread, projectionRange } from "@/lib/projections/live";

export type PlayerProjection = {
  /** expected points this week */
  pts: number;
  /** the range: about the middle 6 in 10 outcomes */
  low: number;
  high: number;
  /** how uncertain (for win probability) */
  spread: number;
  /** "starting" / "bench" from the team list, "expected" before it, "out" = 0 (injured, not named, bye) */
  role: "starting" | "bench" | "expected" | "out";
  /** his team's kicker this week */
  kicker: boolean;
  /** his game's kickoff this week (null = bye) */
  kickoffMs: number | null;
  /** why he's projected 0 (role "out"): a bye, his status, or left out of his team's list */
  outReason?: "bye" | "injured" | "suspended" | "out" | "notNamed";
  /** due back from injury this round but not confirmed yet (QUES) */
  questionable?: boolean;
};

export type WeekProjections = {
  season: number;
  week: number;
  /** teams whose team list for this week is out */
  listsOut: string[];
  players: Record<string, PlayerProjection>;
};

const team = (code: string | null | undefined) => normalizeTeamCode(code);
const fixtureTeam = (name: string) => team(teamCodeFromName(name) ?? name);
const isOutKind = (k: ReturnType<typeof statusKind>) => k === "injured" || k === "suspended" || k === "out";

export type StatRow = { internal_player_id: string; round: number; stats: unknown };

export async function loadStats(db: SupabaseClient, season: number, beforeRound: number): Promise<StatRow[]> {
  const out: StatRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("player_round_stats")
      .select("internal_player_id, round, stats:raw_json->stats")
      .eq("season", season)
      .lt("round", beforeRound)
      .order("round")
      .order("internal_player_id")
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as StatRow[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Games per player (minutes > 0), with what his team list said that week. */
function gamesByPlayer(rows: StatRow[], season: number, players: Map<string, SitePlayer>): Map<string, PastGame[]> {
  const s = SEASONS[season] ? getSeason(season) : null;
  const out = new Map<string, PastGame[]>();
  for (const r of rows) {
    const counts: StatCounts = statCountsFromRaw(r.stats);
    if (!(Number(counts.minutesPlayed) > 0)) continue;
    const id = String(r.internal_player_id);
    const fw = s ? fantasyWeekForRealRound(s, r.round) : null;
    const k = statusKind(fw ? players.get(id)?.weeklyStatus?.[`W${fw}`] : null);
    const g: PastGame = { round: r.round, counts, listed: k === "starting" || k === "bench" ? k : null };
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(g);
  }
  for (const g of out.values()) g.sort((a, b) => a.round - b.round);
  return out;
}

/**
 * Real teams' games: the official final score (match_results, from the official fantasy game;
 * Ethan, 27 Nov 2026), and tries, penalty-goal attempts and lineout steals from the player stats.
 * Only a game with no official score (an older season) has its score added up from the player
 * stats (tries, conversions, penalties, drop goals; this misses penalty tries).
 */
export function teamGames(rows: StatRow[], season: number, teamOf: (id: string) => string | null, official: MatchScore[] = []): Map<string, TeamGame[]> {
  const s = SEASONS[season] ? getSeason(season) : null;
  const opp = new Map<string, string>(); // `${team}|${round}` -> opponent
  for (const f of s?.fixtures ?? []) {
    const h = fixtureTeam(f.homeTeam), a = fixtureTeam(f.awayTeam);
    opp.set(`${h}|${f.week}`, a);
    opp.set(`${a}|${f.week}`, h);
  }
  const acc = new Map<string, { pts: number; tries: number; pens: number; steals: number }>();
  for (const r of rows) {
    const t = teamOf(String(r.internal_player_id));
    if (!t) continue;
    const c = statCountsFromRaw(r.stats);
    const key = `${t}|${r.round}`;
    const a = acc.get(key) ?? { pts: 0, tries: 0, pens: 0, steals: 0 };
    const n = (k: keyof StatCounts) => Number(c[k]) || 0;
    a.pts += 5 * n("tries") + 2 * n("conversions") + 3 * n("penaltyGoals") + 3 * n("dropGoals");
    a.tries += n("tries");
    a.pens += n("penaltyGoals") + n("penaltyGoalsMissed");
    a.steals += n("lineoutSteals");
    acc.set(key, a);
  }
  const score = new Map<string, { for: number; against: number }>();
  for (const m of official) {
    score.set(`${team(m.homeTeam)}|${m.realRound}`, { for: m.homeScore, against: m.awayScore });
    score.set(`${team(m.awayTeam)}|${m.realRound}`, { for: m.awayScore, against: m.homeScore });
  }
  const out = new Map<string, TeamGame[]>();
  for (const [key, a] of acc) {
    const [t, round] = key.split("|");
    const o = opp.get(key);
    const against = o ? acc.get(`${o}|${round}`) : undefined;
    if (!against) continue;
    const real = score.get(key);
    if (!out.has(t)) out.set(t, []);
    out.get(t)!.push({ round: Number(round), pointsFor: real ? real.for : a.pts, pointsAgainst: real ? real.against : against.pts, tries: a.tries, penaltyShots: a.pens, lineoutSteals: a.steals });
  }
  for (const g of out.values()) g.sort((x, y) => x.round - y.round);
  return out;
}

const cache = new Map<string, { at: number; data: WeekProjections }>();
const CACHE_MS = 5 * 60 * 1000;

/** Every active player's expected points for a fantasy week, under these scoring rules. */
export async function weekProjections(
  db: SupabaseClient, season: number, week: number, rules: ScoringRules, nowMs: number = Date.now()
): Promise<WeekProjections> {
  const key = `${season}|${week}|${JSON.stringify(rules)}`;
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < CACHE_MS) return hit.data;

  const s = getSeason(season);
  const rounds = realRoundsForWeek(s, week);
  const firstRound = Math.min(...rounds);
  const lastSeason = SEASONS[season - 1] ? season - 1 : null;

  const [players, lastPlayers, rows, lastRows, ratings] = await Promise.all([
    loadSeasonPlayers(db, season),
    lastSeason ? loadSeasonPlayers(db, lastSeason, { includeInactive: true }) : Promise.resolve([] as SitePlayer[]),
    loadStats(db, season, firstRound),
    lastSeason ? loadStats(db, lastSeason, 999) : Promise.resolve([] as StatRow[]),
    db.from("team_difficulty").select("team, home_rating, away_rating").eq("season", season),
  ]);
  if (ratings.error) throw ratings.error;
  const rating = new Map(((ratings.data ?? []) as Array<{ team: string; home_rating: number; away_rating: number }>).map((r) => [team(r.team), r]));

  const byId = new Map(players.map((p) => [p.id, p]));
  const lastById = new Map(lastPlayers.map((p) => [p.id, p]));
  const games = gamesByPlayer(rows, season, byId);
  const lastGames = lastSeason ? gamesByPlayer(lastRows, lastSeason, lastById) : new Map<string, PastGame[]>();
  const frontRow = (p: SitePlayer) => isFrontRow(p, rules);

  // position averages: this season so far + last season
  const byPos = new Map<string, Array<{ games: PastGame[]; frontRow: boolean }>>();
  for (const p of [...players, ...lastPlayers]) {
    const g = (byId.get(p.id) === p ? games : lastGames).get(p.id);
    if (!g?.length) continue;
    if (!byPos.has(p.posAbbrev)) byPos.set(p.posAbbrev, []);
    byPos.get(p.posAbbrev)!.push({ games: g, frontRow: frontRow(p) });
  }
  const posAvg = new Map([...byPos].map(([pos, g]) => [pos, averageRates(g, rules)]));

  // real teams: strength from their last 8 games (last season's carry into the new one)
  const [official, lastOfficial] = await Promise.all([
    savedMatchScores(db, season).catch(() => [] as MatchScore[]),
    lastSeason ? savedMatchScores(db, lastSeason).catch(() => [] as MatchScore[]) : Promise.resolve([] as MatchScore[]),
  ]);
  const tg = teamGames(rows, season, (id) => team(byId.get(id)?.teamCode), official);
  const ltg = lastSeason ? teamGames(lastRows, lastSeason, (id) => team(lastById.get(id)?.teamCode), lastOfficial) : new Map<string, TeamGame[]>();
  const strength = new Map<string, TeamStrength>();
  for (const t of new Set([...tg.keys(), ...ltg.keys(), ...players.map((p) => team(p.teamCode))])) {
    const recent = [...(ltg.get(t) ?? []).map((g) => ({ ...g, round: g.round - 100 })), ...(tg.get(t) ?? [])].slice(-8);
    strength.set(t, teamStrength(recent));
  }
  const strengthOf = (t: string) => strength.get(t) ?? teamStrength([]);

  // this week's fixture per team
  const fixtureOf = new Map<string, { f: SeasonFixture; home: boolean; opp: string }>();
  for (const f of s.fixtures.filter((x) => rounds.includes(x.week))) {
    const h = fixtureTeam(f.homeTeam), a = fixtureTeam(f.awayTeam);
    fixtureOf.set(h, { f, home: true, opp: a });
    fixtureOf.set(a, { f, home: false, opp: h });
  }
  const clampFdr = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
  const fdrFor = (t: string) => {
    const fx = fixtureOf.get(t);
    const r = fx ? rating.get(fx.opp) : undefined;
    if (!fx || !r) return null;
    if (fx.f.neutralVenue) return clampFdr((r.home_rating + r.away_rating) / 2);
    return clampFdr(fx.home ? r.away_rating : r.home_rating);
  };

  // statuses this week, and whose team list is out
  const statusNow = (p: SitePlayer) => p.weeklyStatus?.[`W${week}`] || p.status || "";
  const listsOut = new Set<string>();
  for (const p of players) {
    const k = statusKind(p.weeklyStatus?.[`W${week}`]);
    if (k === "starting" || k === "bench") listsOut.add(team(p.teamCode));
  }

  // expected lineup from this season's earlier lists (last season's if there are none yet)
  const listHistory = (p: SitePlayer): ListRole[] => {
    const h: ListRole[] = [];
    const own = games.get(p.id) ?? [];
    for (let w = 1; w < week; w++) {
      const rr = realRoundsForWeek(s, w);
      const t = team(p.teamCode);
      const played = s.fixtures.some((f) => rr.includes(f.week) && (fixtureTeam(f.homeTeam) === t || fixtureTeam(f.awayTeam) === t));
      if (!played) { h.push("none"); continue; }
      const k = statusKind(p.weeklyStatus?.[`W${w}`]);
      if (k === "starting" || k === "bench") h.push(k);
      else if (isOutKind(k)) h.push("out");
      else {
        const g = own.find((x) => rr.includes(x.round));
        h.push(g ? (Number(g.counts.minutesPlayed) >= 40 ? "starting" : "bench") : "notNamed");
      }
    }
    if (h.some((x) => x !== "none")) return h;
    // nothing yet this season: his last few games last season, if he stayed at the same team
    const last = lastById.get(p.id);
    if (!last || team(last.teamCode) !== team(p.teamCode)) return h;
    return (lastGames.get(p.id) ?? []).slice(-4).map((g) => (g.listed ?? (Number(g.counts.minutesPlayed) >= 40 ? "starting" : "bench")) as ListRole);
  };
  const chancesOf = new Map<string, RoleChances>();
  const chances = (p: SitePlayer) => {
    if (!chancesOf.has(p.id)) chancesOf.set(p.id, expectedRole(listHistory(p), undefined, (p.expectedRole ?? null) as RoleNote | null));
    return chancesOf.get(p.id)!;
  };

  // kicking: order per team (Ethan's notes; otherwise last season's order for players who stayed)
  const lastOrder = new Map<string, string[]>();
  if (lastSeason) {
    const byTeam = new Map<string, Array<{ id: string; games: PastGame[] }>>();
    for (const p of lastPlayers) {
      const t = team(p.teamCode);
      if (!byTeam.has(t)) byTeam.set(t, []);
      byTeam.get(t)!.push({ id: p.id, games: lastGames.get(p.id) ?? [] });
    }
    for (const [t, g] of byTeam) lastOrder.set(t, kickingOrder(g, 999));
  }
  const ruledOut = (p: SitePlayer) => {
    const t = team(p.teamCode);
    if (!fixtureOf.has(t)) return true;
    const k = statusKind(statusNow(p));
    if (isOutKind(k)) return true;
    return listsOut.has(t) && !(k === "starting" || k === "bench");
  };
  const kickerOf = new Map<string, string | null>();
  for (const t of new Set(players.map((p) => team(p.teamCode)))) {
    const squad = players.filter((p) => team(p.teamCode) === t);
    const explicit = squad.some((p) => p.kickOrder === 1 || p.kickOrder === 2);
    const lo = lastOrder.get(t) ?? [];
    const order = kickingOrder(squad.map((p) => {
      const stayed = team(lastById.get(p.id)?.teamCode) === t;
      const implicit = !explicit && stayed ? (lo[0] === p.id ? 1 : lo[1] === p.id ? 2 : null) : null;
      return { id: p.id, games: games.get(p.id) ?? [], kickOrder: p.kickOrder ?? implicit };
    }), firstRound);
    const listed = listsOut.has(t);
    kickerOf.set(t, dutyKicker(order, (id) => {
      const p = byId.get(id);
      if (!p || ruledOut(p)) return false;
      return listed ? statusKind(statusNow(p)) === "starting" : chances(p).start >= 0.5;
    }));
  }

  const out: Record<string, PlayerProjection> = {};
  for (const p of players) {
    const t = team(p.teamCode);
    const fx = fixtureOf.get(t);
    const kickoff = fx ? kickoffMs(fx.f) : null;
    if (!fx || ruledOut(p)) {
      const k = statusKind(statusNow(p));
      const outReason = !fx ? "bye" : k === "injured" || k === "suspended" || k === "out" ? k : "notNamed";
      out[p.id] = { pts: 0, low: 0, high: 0, spread: 0, role: "out", kicker: false, kickoffMs: kickoff, outReason };
      continue;
    }
    const own = games.get(p.id) ?? [];
    const last = lastGames.get(p.id) ?? [];
    const oppS = strengthOf(fx.opp);
    const isKicker = kickerOf.get(t) === p.id;
    const kicking = isKicker ? kickingPoints([...last, ...own], strengthOf(t), oppS, rules) : null;
    const prior: StatRates = seasonPrior(posAvg.get(p.posAbbrev) ?? {}, p.draftRank, last.length ? { games: last, frontRow: frontRow(p) } : null, rules);
    const base = {
      games: own, lastSeasonGames: last, pos: p.posAbbrev, frontRow: frontRow(p), prior, draftRank: p.draftRank,
      fdr: fdrFor(t), home: fx.f.neutralVenue ? null : fx.home,
      opponentWeakness: opponentWeakness(oppS), opponentSteals: lineoutStealFactor(oppS), rules,
    };
    let pts: number, spread: number, role: PlayerProjection["role"];
    if (listsOut.has(t)) {
      role = statusKind(statusNow(p)) === "starting" ? "starting" : "bench";
      pts = projectPoints({ ...base, role, kicking });
      spread = playerSpread(pts);
    } else {
      role = "expected";
      const c = chances(p);
      pts = projectPointsExpectedLineup({ ...base, chances: c, kicking });
      spread = lineupSpread([
        { chance: c.start, projected: projectPoints({ ...base, role: "starting", kicking }) },
        { chance: c.bench, projected: projectPoints({ ...base, role: "bench" }) },
      ]);
    }
    out[p.id] = { pts, ...projectionRange(pts), spread: Math.round(spread * 10) / 10, role, kicker: isKicker, kickoffMs: kickoff, ...(statusKind(statusNow(p)) === "questionable" ? { questionable: true } : {}) };
  }

  const data: WeekProjections = { season, week, listsOut: [...listsOut], players: out };
  cache.set(key, { at: nowMs, data });
  return data;
}
