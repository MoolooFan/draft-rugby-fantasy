// lib/coach/data.ts (server only)
// Gathers everything the AI coach needs for a season and week once (players, both seasons'
// stats, team strength, fixtures, expected points, statuses, Ethan's notes and player details,
// earlier coach notes), then builds each player's fact sheet (lib/coach/facts.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSeasonPlayers, type SitePlayer } from "@/lib/players/db";
import { loadStats, weekProjections, type StatRow, type WeekProjections } from "@/lib/projections/server";
import { fantasyWeekForRealRound, fixturesForWeek, getSeason, realRoundsForWeek, SEASONS, totalFantasyWeeks, weekLabel, type SeasonConfig } from "@/lib/season";
import { isFrontRow, playerPoints, STANDARD_SCORING, statCountsFromRaw, type ScoringRules } from "@/lib/scoring";
import { statusKind } from "@/lib/status/kind";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { teamCodeFromName } from "@/lib/status/articles";
import { canPlayPosition, positionsLabel } from "@/lib/players/positions";
import type { CoachFactsInput, CoachGame, CoachKind, FixtureInfo } from "@/lib/coach/facts";
import { allowedText, pointsAllowed, posGroup, type Appearance, type AllowedRow, type PosGroup } from "@/lib/coach/matchups";
import { articleExcerpt, TEAM_NAMES } from "@/lib/coach/articles";

const TEAM_NAME: Record<string, string> = {
  BLU: "Blues", BRU: "Brumbies", CHI: "Chiefs", CRU: "Crusaders", DRU: "Drua", FOR: "Force",
  HIG: "Highlanders", HUR: "Hurricanes", MOA: "Moana Pasifika", MOP: "Moana Pasifika", RED: "Reds", WAR: "Waratahs",
};
const team = (code: string | null | undefined) => normalizeTeamCode(code);
const fixtureTeam = (name: string) => team(teamCodeFromName(name) ?? name);
export const teamName = (code: string) => TEAM_NAME[team(code)] ?? code;

export type CoachSettings = { enabled: boolean; model: string };

export async function loadCoachSettings(db: SupabaseClient): Promise<CoachSettings> {
  const { data } = await db.from("coach_settings").select("enabled, model").eq("id", 1).maybeSingle();
  return { enabled: data?.enabled === true, model: String(data?.model || "claude-sonnet-5-5") };
}

export type CoachCtx = {
  season: number;
  s: SeasonConfig;
  /** the fantasy week the notes look ahead to */
  week: number;
  rules: ScoringRules;
  players: Map<string, SitePlayer>;
  games: Map<string, CoachGame[]>;
  lastGames: Map<string, CoachGame[]>;
  /** fantasy points each team gives up to each position (lib/coach/matchups.ts) */
  allowed: Map<string, Map<PosGroup, AllowedRow>>;
  proj: WeekProjections | null;
  profiles: Map<string, { birth_date: string | null; international: string | null; rest_notes: string | null; injury_notes: string | null }>;
  notes: { player: Map<string, string[]>; team: Map<string, string[]>; general: string[] };
  /** active articles Ethan shared (newest first) */
  articles: Array<{ title: string; source: string; date: string; text: string; players: Set<string>; teams: Set<string> }>;
  previous: Map<string, Array<{ kind: string; label: string; headline: string }>>;
};

/** Every player's games from stat rows, with the opponent and home / away for each. */
function coachGames(rows: StatRow[], season: number, playerTeam: (id: string) => string | null, weekly: (id: string, week: number) => string | null): Map<string, CoachGame[]> {
  const s = SEASONS[season] ? getSeason(season) : null;
  const fx = new Map<string, { opp: string; home: boolean | null }>();
  for (const f of s?.fixtures ?? []) {
    const h = fixtureTeam(f.homeTeam), a = fixtureTeam(f.awayTeam);
    fx.set(`${h}|${f.week}`, { opp: a, home: f.neutralVenue ? null : true });
    fx.set(`${a}|${f.week}`, { opp: h, home: f.neutralVenue ? null : false });
  }
  const out = new Map<string, CoachGame[]>();
  for (const r of rows) {
    const id = String(r.internal_player_id);
    const t = playerTeam(id);
    const f = t ? fx.get(`${t}|${r.round}`) : undefined;
    const fw = s ? fantasyWeekForRealRound(s, r.round) : null;
    const k = statusKind(fw ? weekly(id, fw) : null);
    const g: CoachGame = {
      round: r.round,
      label: `Round ${r.round}`,
      opp: f ? teamName(f.opp) : null,
      home: f ? f.home : null,
      counts: statCountsFromRaw(r.stats),
      listed: k === "starting" || k === "bench" ? k : null,
    };
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(g);
  }
  for (const g of out.values()) g.sort((a, b) => a.round - b.round);
  return out;
}

/**
 * Every player's games as appearances against a team: his position that day (jersey on the team
 * list if known, else his listed position) and his fantasy points. `offset` keeps last season's
 * games before this season's.
 */
function appearances(rows: StatRow[], season: number, players: Map<string, SitePlayer>, rules: ScoringRules, offset: number): Appearance[] {
  const s = SEASONS[season] ? getSeason(season) : null;
  if (!s) return [];
  const opp = new Map<string, string>();
  for (const f of s.fixtures) {
    const h = fixtureTeam(f.homeTeam), a = fixtureTeam(f.awayTeam);
    opp.set(`${h}|${f.week}`, a);
    opp.set(`${a}|${f.week}`, h);
  }
  const out: Appearance[] = [];
  for (const r of rows) {
    const p = players.get(String(r.internal_player_id));
    if (!p) continue;
    const c = statCountsFromRaw(r.stats);
    if (!(Number(c.minutesPlayed) > 0)) continue;
    const o = opp.get(`${team(p.teamCode)}|${r.round}`);
    const fw = fantasyWeekForRealRound(s, r.round);
    const group = posGroup(p.posAbbrev, fw ? p.weeklyStatus?.[`W${fw}`] : null);
    if (!o || !group) continue;
    out.push({ opp: o, game: r.round + offset, group, points: playerPoints(c, isFrontRow(p, rules), rules), minutes: Number(c.minutesPlayed) });
  }
  return out;
}

/** Load what the coach needs for a season, looking ahead to `week`. */
export async function loadCoachCtx(db: SupabaseClient, season: number, week: number): Promise<CoachCtx> {
  const s = getSeason(season);
  const lastSeason = SEASONS[season - 1] ? season - 1 : null;
  const rules = STANDARD_SCORING;
  const [players, lastPlayers, rows, lastRows, profiles, ctxRows, articleRows] = await Promise.all([
    loadSeasonPlayers(db, season, { includeInactive: true }),
    lastSeason ? loadSeasonPlayers(db, lastSeason, { includeInactive: true }) : Promise.resolve([] as SitePlayer[]),
    loadStats(db, season, 999),
    lastSeason ? loadStats(db, lastSeason, 999) : Promise.resolve([] as StatRow[]),
    db.from("player_profiles").select("player_id, birth_date, international, rest_notes, injury_notes"),
    db.from("coach_context").select("scope, player_id, team_code, text, created_at").eq("active", true).order("created_at"),
    db.from("coach_articles").select("title, source, text, player_ids, team_codes, created_at").eq("active", true).order("created_at", { ascending: false }).limit(60),
  ]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const lastById = new Map(lastPlayers.map((p) => [p.id, p]));
  const proj = week >= 1 && week <= totalFantasyWeeks(s) ? await weekProjections(db, season, week, rules).catch(() => null) : null;

  // fantasy points each team gives up to each position, per 80 minutes: its last 12 games (last
  // season's carry into this one)
  const allowed = pointsAllowed([
    ...(lastSeason ? appearances(lastRows, lastSeason, lastById, rules, -100) : []),
    ...appearances(rows, season, byId, rules, 0),
  ]);

  const notes = { player: new Map<string, string[]>(), team: new Map<string, string[]>(), general: [] as string[] };
  for (const c of ctxRows.data ?? []) {
    const text = `${String(c.created_at).slice(0, 10)}: ${c.text}`;
    if (c.scope === "general") notes.general.push(text);
    else if (c.scope === "team" && c.team_code) notes.team.set(team(c.team_code), [...(notes.team.get(team(c.team_code)) ?? []), text]);
    else if (c.scope === "player" && c.player_id) notes.player.set(c.player_id, [...(notes.player.get(c.player_id) ?? []), text]);
  }

  return {
    season,
    s,
    week,
    rules,
    players: byId,
    games: coachGames(rows, season, (id) => team(byId.get(id)?.teamCode), (id, w) => byId.get(id)?.weeklyStatus?.[`W${w}`] ?? null),
    lastGames: lastSeason ? coachGames(lastRows, lastSeason, (id) => team(lastById.get(id)?.teamCode), (id, w) => lastById.get(id)?.weeklyStatus?.[`W${w}`] ?? null) : new Map(),
    allowed,
    proj,
    profiles: new Map((profiles.data ?? []).map((p) => [String(p.player_id), p])),
    notes,
    // (no table yet = no articles)
    articles: (articleRows.data ?? []).map((a) => ({
      title: String(a.title || "Article"),
      source: String(a.source || ""),
      date: String(a.created_at).slice(0, 10),
      text: String(a.text || ""),
      players: new Set((a.player_ids ?? []).map(String)),
      teams: new Set((a.team_codes ?? []).map((c: string) => team(c))),
    })),
    previous: new Map(),
  };
}

/** Earlier coach notes for these players (newest 3 each), for continuity. */
export async function loadPreviousNotes(db: SupabaseClient, ctx: CoachCtx, playerIds: string[]): Promise<void> {
  if (!playerIds.length) return;
  for (let i = 0; i < playerIds.length; i += 300) {
    const { data } = await db
      .from("coach_notes")
      .select("player_id, kind, week, headline, created_at")
      .in("player_id", playerIds.slice(i, i + 300))
      .eq("season", ctx.season)
      .eq("hidden", false)
      .order("created_at", { ascending: false });
    for (const n of data ?? []) {
      const list = ctx.previous.get(n.player_id) ?? [];
      if (list.length >= 3) continue;
      list.push({ kind: n.kind, label: n.week ? weekLabel(ctx.s, n.week) : "Season", headline: n.headline });
      ctx.previous.set(n.player_id, list);
    }
  }
}

function fixtureFor(ctx: CoachCtx, teamCode: string, week: number, group: PosGroup | null): FixtureInfo | null {
  const t = team(teamCode);
  for (const f of fixturesForWeek(ctx.s, week)) {
    const h = fixtureTeam(f.homeTeam), a = fixtureTeam(f.awayTeam);
    if (h !== t && a !== t) continue;
    const opp = h === t ? a : h;
    return {
      label: weekLabel(ctx.s, week),
      opp: teamName(opp),
      home: f.neutralVenue ? null : h === t,
      oppAllows: group ? allowedText(ctx.allowed.get(opp)?.get(group), group) : null,
    };
  }
  return null;
}

/** One player's fact-sheet input. */
export function coachInput(
  ctx: CoachCtx,
  playerId: string,
  kind: CoachKind,
  extra: {
    thisGameRound?: number;
    teamScore?: number | null;
    oppScore?: number | null;
    /** after a game: his projected points for that week, worked out from the games before it */
    projected?: number | null;
    statusChange?: { from: string | null; to: string | null };
  } = {},
  nowMs = Date.now()
): CoachFactsInput | null {
  const p = ctx.players.get(playerId);
  if (!p) return null;
  const t = team(p.teamCode);
  const prof = ctx.profiles.get(playerId);
  const weeks = totalFantasyWeeks(ctx.s);
  const games = ctx.games.get(playerId) ?? [];
  const status = p.weeklyStatus?.[`W${ctx.week}`] || p.status || null;
  const pr = ctx.proj?.players[playerId] ?? null;
  // his position for matchups: this week's jersey if the team list is out, else his listed position
  const group = posGroup(p.posAbbrev, p.weeklyStatus?.[`W${ctx.week}`]);
  const next = fixtureFor(ctx, t, ctx.week, group);
  const remaining: FixtureInfo[] = [];
  for (let w = ctx.week + 1; w <= weeks; w++) {
    const f = fixtureFor(ctx, t, w, group);
    if (f) remaining.push(f);
  }
  const finalsWeeks = [weeks - 1, weeks].filter((w) => w >= 1).map((w) => fixtureFor(ctx, t, w, group)).filter((f): f is FixtureInfo => !!f);

  // teammates who play his position and have a status this week
  const teammates: CoachFactsInput["teammates"] = [];
  for (const q of ctx.players.values()) {
    if (q.id === playerId || team(q.teamCode) !== t || !q.active) continue;
    if (![p.posAbbrev, p.secondaryPosAbbrev, p.thirdPosAbbrev].some((pos) => pos && canPlayPosition(q, pos))) continue;
    const st = q.weeklyStatus?.[`W${ctx.week}`] || q.status;
    if (st) teammates.push({ name: `${q.firstName} ${q.lastName}`, positions: positionsLabel(q), status: st });
  }

  let thisGame: CoachFactsInput["thisGame"] = null;
  if (extra.thisGameRound != null) {
    const g = games.find((x) => x.round === extra.thisGameRound);
    if (g) {
      const gw = fantasyWeekForRealRound(ctx.s, g.round);
      thisGame = { ...g, teamScore: extra.teamScore ?? null, oppScore: extra.oppScore ?? null, projected: extra.projected ?? null };
      if (gw) thisGame.label = weekLabel(ctx.s, gw);
    }
  }
  // only games before the one being written about (or all of them)
  const before = extra.thisGameRound != null ? games.filter((g) => g.round < extra.thisGameRound!) : games;

  return {
    kind,
    season: ctx.season,
    nowMs,
    rules: ctx.rules,
    player: {
      name: `${p.firstName} ${p.lastName}`,
      team: teamName(t),
      positions: positionsLabel(p),
      posAbbrev: p.posAbbrev,
      secondaryPosAbbrev: p.secondaryPosAbbrev,
      thirdPosAbbrev: p.thirdPosAbbrev,
      draftRank: p.draftRank < 9999 ? p.draftRank : null,
      expectedRole: p.expectedRole ?? null,
      kickOrder: p.kickOrder ?? null,
      status,
      birthDate: prof?.birth_date ?? null,
      international: prof?.international ?? null,
      restNotes: prof?.rest_notes ?? null,
      injuryNotes: prof?.injury_notes ?? null,
    },
    games: kind === "post_game" ? [...before, ...(thisGame ? [thisGame] : [])] : games,
    lastSeasonGames: ctx.lastGames.get(playerId) ?? [],
    next: next ? { ...next, projection: pr ? { pts: pr.pts, low: pr.low, high: pr.high, role: pr.role, kicker: pr.kicker } : null } : null,
    remaining,
    finalsWeeks,
    teammates,
    matchupGroup: group,
    thisGame,
    statusChange: extra.statusChange ?? null,
    notes: [...ctx.notes.general, ...(ctx.notes.team.get(t) ?? []), ...(ctx.notes.player.get(playerId) ?? [])],
    // the 3 newest articles about him (or, failing that, his team): the paragraphs that mention him
    articles: [...(ctx.articles ?? []).filter((a) => a.players.has(playerId)), ...(ctx.articles ?? []).filter((a) => !a.players.has(playerId) && a.teams.has(t))]
      .slice(0, 3)
      .map((a) => ({
        title: a.title,
        source: a.source,
        date: a.date,
        excerpt: articleExcerpt(a.text, a.players.has(playerId) ? [`${p.firstName} ${p.lastName}`, p.lastName] : TEAM_NAMES[t] ?? [teamName(t)], a.players.has(playerId) ? 1500 : 700),
      })),
    previous: ctx.previous.get(playerId) ?? [],
  };
}

/** Real rounds in a fantasy week (re-exported for the runner). */
export { realRoundsForWeek };
