// lib/league/shield.ts
// The Shield (Ethan, Nov 2026): a challenge trophy inside a league, after the Ranfurly Shield.
// Worked out from the league's results every time (nothing stored), so it always matches the
// scores. Pure code (tested in scripts/tests/shield.test.ts).
//
// Rules agreed with Ethan:
// - First awarded to the highest score in the league's first round (most tries if level; still
//   level: the next round's top score instead). That round isn't a defence.
// - On the line only in the holder's HOME regular-season games: the away team takes it by
//   beating the holder; a draw and the holder keeps it (a defence). Away games, byes, finals and
//   the spoon playoff don't count.
// - It carries over to next season (leagues are linked by lineage). If the holder doesn't come
//   back, it goes to the team that held it before them; if they're gone too, it's awarded again
//   like the first time. Once someone else holds it, a returning team has no claim.
// - A league can switch it off (that season doesn't count; the holder keeps it) and rename it.
// - Started fresh in 2027 (SHIELD_FIRST_SEASON): earlier seasons don't count.

export const SHIELD_FIRST_SEASON = 2027;
export const DEFAULT_SHIELD_NAME = "The Shield";

/** "Ranfurly" -> "Ranfurly Shield"; "" -> "The Shield". The name always ends in "Shield". */
export function cleanShieldName(raw: unknown): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!s) return DEFAULT_SHIELD_NAME;
  return /\bshield$/i.test(s) ? s.replace(/shield$/i, "Shield") : `${s} Shield`;
}

export type ShieldGame = {
  week: number;
  homeTeamId: string;
  /** null = bye */
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTries?: number | null;
  awayTries?: number | null;
  final: boolean;
};

export type ShieldSeason = {
  leagueId: string;
  season: number;
  enabled: boolean;
  /** owner = the person (username), which links teams across seasons */
  teams: Array<{ id: string; owner: string; name: string }>;
  /** regular-season games only */
  games: ShieldGame[];
};

export type ShieldReign = {
  owner: string;
  teamId: string;
  teamName: string;
  leagueId: string;
  season: number;
  fromWeek: number;
  /** how it started: first award / won off the holder / handed back (holder didn't return) / awarded again */
  how: "awarded" | "won" | "handed_back" | "reawarded";
  /** the team it was won from (how = "won") */
  wonFromTeamName: string | null;
  defences: number;
  /** when it ended (null = still holding) */
  endedSeason: number | null;
  endedWeek: number | null;
  lostToTeamName: string | null;
};

export type ShieldEvent = {
  leagueId: string;
  season: number;
  week: number;
  kind: "awarded" | "defended" | "won";
  /** holder after this game */
  holderTeamId: string;
  /** the other team in a defence / the team it was won from */
  otherTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type ShieldState = {
  reigns: ShieldReign[];
  events: ShieldEvent[];
  /** the current holder (null = not awarded yet) */
  holder: { owner: string; teamId: string | null; reign: ShieldReign } | null;
};

const scoreOf = (g: ShieldGame, side: "home" | "away") => Number(side === "home" ? g.homeScore : g.awayScore);
const triesOf = (g: ShieldGame, side: "home" | "away") => Number((side === "home" ? g.homeTries : g.awayTries) ?? 0);

/** The team that takes it in a week with no holder: top score, then most tries; null if still level. */
function topOfWeek(games: ShieldGame[]): string | null {
  const rows: Array<{ team: string; score: number; tries: number }> = [];
  for (const g of games) {
    if (!g.final || g.homeScore == null) continue;
    rows.push({ team: g.homeTeamId, score: scoreOf(g, "home"), tries: triesOf(g, "home") });
    if (g.awayTeamId && g.awayScore != null) rows.push({ team: g.awayTeamId, score: scoreOf(g, "away"), tries: triesOf(g, "away") });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => b.score - a.score || b.tries - a.tries);
  const [a, b] = rows;
  return b && a.score === b.score && a.tries === b.tries ? null : a.team;
}

export function computeShield(seasons: ShieldSeason[]): ShieldState {
  const reigns: ShieldReign[] = [];
  const events: ShieldEvent[] = [];
  let current: ShieldReign | null = null;

  const startReign = (s: ShieldSeason, teamId: string, week: number, how: ShieldReign["how"], wonFrom: string | null) => {
    const t = s.teams.find((x) => x.id === teamId)!;
    current = {
      owner: t.owner, teamId, teamName: t.name, leagueId: s.leagueId, season: s.season, fromWeek: week,
      how, wonFromTeamName: wonFrom, defences: 0, endedSeason: null, endedWeek: null, lostToTeamName: null,
    };
    reigns.push(current);
  };

  for (const s of [...seasons].filter((x) => x.season >= SHIELD_FIRST_SEASON).sort((a, b) => a.season - b.season)) {
    if (!s.enabled) continue;
    const teamOfOwner = (owner: string) => s.teams.find((t) => t.owner === owner) ?? null;
    const weeks = [...new Set(s.games.map((g) => g.week))].sort((a, b) => a - b);

    // a new season: the holder's team this season, or hand it back, or award it again
    let holderTeam: string | null = null;
    if (current) {
      const prev: ShieldReign = current;
      const own = teamOfOwner(prev.owner);
      if (own) {
        holderTeam = own.id;
        if (prev.season !== s.season) {
          // same reign carries on with this season's team
          prev.teamId = own.id;
          prev.teamName = own.name;
          prev.leagueId = s.leagueId;
        }
      } else {
        // the reign before this one, if that team is back
        const before = [...reigns].reverse().find((r) => r !== prev && r.owner !== prev.owner);
        const back = before ? teamOfOwner(before.owner) : null;
        prev.endedSeason = s.season;
        prev.endedWeek = 0;
        current = null;
        if (back) {
          startReign(s, back.id, weeks[0] ?? 1, "handed_back", null);
          holderTeam = back.id;
        }
      }
    }
    const reawardHow: ShieldReign["how"] = reigns.length ? "reawarded" : "awarded";

    for (const w of weeks) {
      const games = s.games.filter((g) => g.week === w);
      if (!games.every((g) => g.final)) break; // stop at the first week not finished
      if (!holderTeam) {
        const top = topOfWeek(games);
        if (!top) continue;
        startReign(s, top, w, reawardHow, null);
        holderTeam = top;
        const g = games.find((x) => x.homeTeamId === top || x.awayTeamId === top) ?? null;
        events.push({ leagueId: s.leagueId, season: s.season, week: w, kind: "awarded", holderTeamId: top, otherTeamId: null, homeScore: g?.homeScore ?? null, awayScore: g?.awayScore ?? null });
        continue;
      }
      const home = games.find((g) => g.homeTeamId === holderTeam && g.awayTeamId);
      if (!home) continue; // away, or a bye: not on the line
      const reign = current!;
      if (scoreOf(home, "away") > scoreOf(home, "home")) {
        const challenger = home.awayTeamId!;
        reign.endedSeason = s.season;
        reign.endedWeek = w;
        reign.lostToTeamName = s.teams.find((t) => t.id === challenger)?.name ?? null;
        startReign(s, challenger, w, "won", reign.teamName);
        holderTeam = challenger;
        events.push({ leagueId: s.leagueId, season: s.season, week: w, kind: "won", holderTeamId: challenger, otherTeamId: home.homeTeamId, homeScore: home.homeScore, awayScore: home.awayScore });
      } else {
        reign.defences++;
        events.push({ leagueId: s.leagueId, season: s.season, week: w, kind: "defended", holderTeamId: holderTeam, otherTeamId: home.awayTeamId, homeScore: home.homeScore, awayScore: home.awayScore });
      }
    }
  }

  const last = current as ShieldReign | null;
  return { reigns, events, holder: last ? { owner: last.owner, teamId: last.teamId, reign: last } : null };
}

/** The holder's next shield game this season: his first home regular-season game not yet played. */
export function nextShieldGame(season: ShieldSeason, holderTeamId: string | null): ShieldGame | null {
  if (!holderTeamId || !season.enabled) return null;
  return [...season.games].sort((a, b) => a.week - b.week).find((g) => !g.final && g.homeTeamId === holderTeamId && !!g.awayTeamId) ?? null;
}

export type ShieldRecap = {
  name: string;
  /** what happened to the shield this round, from your point of view (or the league's news) */
  thisWeek:
    | { kind: "you_awarded" | "you_won" | "you_defended" | "you_lost" | "you_challenged"; otherTeamId: string | null; homeScore: number | null; awayScore: number | null }
    | { kind: "news_awarded" | "news_won"; holderTeamId: string; otherTeamId: string | null }
    | null;
  /** your next game is a shield game: defending at home, or challenging away */
  next: "defending" | "challenging" | null;
};

/** The weekly recap's shield lines (Ethan, Nov 2026). */
export function shieldRecap(input: {
  name: string;
  enabled: boolean;
  events: ShieldEvent[];
  week: number;
  myTeamId: string;
  next: { week: number; homeTeamId: string; awayTeamId: string } | null;
  myNextWeek: number | null;
}): ShieldRecap | null {
  if (!input.enabled) return null;
  const e = input.events.find((x) => x.week === input.week) ?? null;
  const me = input.myTeamId;
  let thisWeek: ShieldRecap["thisWeek"] = null;
  if (e) {
    const scores = { homeScore: e.homeScore, awayScore: e.awayScore };
    if (e.kind === "awarded") thisWeek = e.holderTeamId === me ? { kind: "you_awarded", otherTeamId: null, ...scores } : { kind: "news_awarded", holderTeamId: e.holderTeamId, otherTeamId: null };
    else if (e.kind === "won" && e.holderTeamId === me) thisWeek = { kind: "you_won", otherTeamId: e.otherTeamId, ...scores };
    else if (e.kind === "won" && e.otherTeamId === me) thisWeek = { kind: "you_lost", otherTeamId: e.holderTeamId, ...scores };
    else if (e.kind === "won") thisWeek = { kind: "news_won", holderTeamId: e.holderTeamId, otherTeamId: e.otherTeamId };
    else if (e.holderTeamId === me) thisWeek = { kind: "you_defended", otherTeamId: e.otherTeamId, ...scores };
    else if (e.otherTeamId === me) thisWeek = { kind: "you_challenged", otherTeamId: e.holderTeamId, ...scores };
  }
  const n = input.next;
  const next = n && input.myNextWeek === n.week ? (n.homeTeamId === me ? "defending" : n.awayTeamId === me ? "challenging" : null) : null;
  if (!thisWeek && !next) return null;
  return { name: input.name, thisWeek, next };
}
