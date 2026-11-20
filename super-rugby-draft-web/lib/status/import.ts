// lib/status/import.ts
// Fetches a round's official team-list and injury articles and turns them into player statuses
// for the fantasy week: named in the XV -> "Starting - #12", replacements -> "Bench - #22" (the
// jersey from the list's order: 1-15, then 16 on), injury list -> e.g. "Knee - Season". Names that don't clearly match a player are flagged for the admin page.
// - Statuses Ethan set by hand ("manual") are never overwritten.
// - Each article is read once (the articles aren't updated afterwards; late changes are made by
//   Ethan by hand). Running it again is safe: it replaces its own earlier statuses and flags.
// - Injuries carry on until the next injury list: each new list replaces the current injuries of
//   the teams in it (a team not in the list, e.g. on a bye, keeps its injuries).
// - Late changes after the articles come from the official fantasy game (applyFantasyFeed,
//   lib/status/fantasyFeed.ts) until each game kicks off.
// - Starting / Benched are cleared once that team's game has finished (clearFinishedGameStatuses),
//   after being copied to player_round_roles, the lasting record of who started (lib/status/roles.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateArticleUrls, injuryStatus, parseInjuryList, parseTeamLists, teamCodeFromName, type InjuryList, type TeamList } from "@/lib/status/articles";
import { matchName, type MatchPlayer } from "@/lib/status/match";
import { fantasyWeekForRealRound, getSeason, kickoffMs, recentlyFinishedFixtures, teamListsReadAtMs } from "@/lib/season";
import { statusKind } from "@/lib/status/kind";
import { FANTASY_PLAYERS_URL, feedRole, fetchFantasyFeed, planTeamChanges, type FantasyFeed, type FeedEntry, type OurStatus } from "@/lib/status/fantasyFeed";
import { dueQuestionable, questionableStatus } from "@/lib/status/questionable";
import { GAME_OVER_AFTER_MS } from "@/lib/projections/live";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

async function fetchFirst(urls: string[]): Promise<{ url: string; html: string } | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Accept: "text/html" }, cache: "no-store" });
      if (res.ok) return { url, html: await res.text() };
    } catch {
      // try the next address
    }
  }
  return null;
}

const ROUND_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen"];

/** Find a round's two articles on the official news page (their addresses aren't consistent). */
async function findOnNewsPage(season: number, realRound: number): Promise<{ teams: string[]; injuries: string[] }> {
  const found = { teams: [] as string[], injuries: [] as string[] };
  try {
    const res = await fetch("https://super.rugby/superrugby/news/", { headers: { "User-Agent": BROWSER_UA, Accept: "text/html" }, cache: "no-store" });
    if (!res.ok) return found;
    const html = await res.text();
    const tokens = new Set([String(realRound), ROUND_WORDS[realRound]].filter(Boolean));
    for (const m of html.matchAll(/href="(\/superrugby\/news\/([a-z0-9-]+)\/)"/g)) {
      const slug = m[2];
      if (!slug.includes(String(season))) continue;
      const round = slug.match(/round-([a-z0-9]+)$/)?.[1];
      if (!round || !tokens.has(round)) continue;
      const url = `https://super.rugby${m[1]}`;
      if (/injur|unavailab/.test(slug)) found.injuries.push(url);
      else if (/teams/.test(slug)) found.teams.push(url);
    }
  } catch {
    // fall back to the usual addresses
  }
  return found;
}

export type ImportReport = {
  realRound: number;
  week: number | null;
  teamList: { url: string; teams: number; matched: number; flagged: number } | null;
  injuryList: { url: string; teams: number; matched: number; flagged: number } | null;
};

/**
 * Import one real round's articles. urls (optional) = addresses pasted on the admin page;
 * otherwise the usual addresses are tried.
 */
export async function importRoundStatus(
  db: SupabaseClient,
  seasonYear: number,
  realRound: number,
  urls: { teams?: string; injuries?: string } = {},
  opts: { kinds?: Array<"team-list" | "injury-list"> } = {}
): Promise<ImportReport> {
  const want = new Set(opts.kinds ?? ["team-list", "injury-list"]);
  const season = getSeason(seasonYear);
  const week = fantasyWeekForRealRound(season, realRound);
  const report: ImportReport = { realRound, week, teamList: null, injuryList: null };
  if (week == null) return report;

  const { data: playerRows, error } = await db
    .from("players")
    .select("id, first_name, last_name, team_code")
    .eq("season", seasonYear)
    .eq("active", true);
  if (error) throw error;
  const players: MatchPlayer[] = (playerRows ?? []).map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, teamCode: p.team_code }));

  const { data: manualRows, error: mErr } = await db
    .from("player_week_status")
    .select("player_id")
    .eq("season", seasonYear)
    .eq("week", week)
    .eq("source", "manual");
  if (mErr) throw mErr;
  const manual = new Set((manualRows ?? []).map((r) => r.player_id));

  const cand = candidateArticleUrls(seasonYear, realRound);
  const listed = urls.teams && urls.injuries ? { teams: [], injuries: [] } : await findOnNewsPage(seasonYear, realRound);
  const teamsDoc = want.has("team-list") ? await fetchFirst(urls.teams ? [urls.teams] : [...listed.teams, ...cand.teams]) : null;
  const injuryDoc = want.has("injury-list") ? await fetchFirst(urls.injuries ? [urls.injuries] : [...listed.injuries, ...cand.injuries]) : null;
  const now = new Date().toISOString();

  async function apply(
    kind: "team-list" | "injury-list",
    url: string,
    teams: string[],
    entries: Array<{ team: string; name: string; status: string }>
  ) {
    const statuses = new Map<string, string>();
    const flags: Record<string, unknown>[] = [];
    // Flags Ethan already fixed or ignored this week stay dealt with (the articles are re-read hourly).
    const { data: resolvedRows, error: rsErr } = await db
      .from("status_import_flags")
      .select("raw_text")
      .eq("season", seasonYear)
      .eq("week", week)
      .eq("source", kind)
      .not("resolved_at", "is", null);
    if (rsErr) throw rsErr;
    const alreadyResolved = new Set((resolvedRows ?? []).map((r) => r.raw_text));
    for (const e of entries) {
      const m = matchName(e.name, e.team, players);
      if (m.kind === "match") {
        if (!statuses.has(m.player.id)) statuses.set(m.player.id, e.status);
      } else if (alreadyResolved.has(`${e.name} → ${e.status}`)) {
        continue;
      } else {
        flags.push({
          season: seasonYear, week, source: kind, team_code: e.team, raw_text: `${e.name} → ${e.status}`,
          problem: m.problem, suggestion_player_id: m.suggestion?.id ?? null,
        });
      }
    }
    // Replace this source's earlier statuses for these teams (not Ethan's manual ones).
    const teamPlayerIds = players.filter((p) => teams.includes(p.teamCode)).map((p) => p.id);
    for (let i = 0; i < teamPlayerIds.length; i += 200) {
      const { error: dErr } = await db
        .from("player_week_status")
        .delete()
        .eq("season", seasonYear)
        .eq("week", week)
        .eq("source", kind)
        .in("player_id", teamPlayerIds.slice(i, i + 200));
      if (dErr) throw dErr;
    }
    const rows = [...statuses]
      .filter(([id]) => !manual.has(id))
      .map(([player_id, status]) => ({ season: seasonYear, week, player_id, status, source: kind, updated_at: now, updated_by: "articles" }));
    if (rows.length) {
      const { error: uErr } = await db.from("player_week_status").upsert(rows, { onConflict: "season,week,player_id" });
      if (uErr) throw uErr;
    }
    // Replace unresolved flags from this source for these teams.
    const { error: fdErr } = await db
      .from("status_import_flags")
      .delete()
      .eq("season", seasonYear)
      .eq("week", week)
      .eq("source", kind)
      .in("team_code", teams)
      .is("resolved_at", null);
    if (fdErr) throw fdErr;
    if (flags.length) {
      const { error: fErr } = await db.from("status_import_flags").insert(flags);
      if (fErr) throw fErr;
    }
    const { error: lErr } = await db
      .from("status_imports")
      .insert({ season: seasonYear, real_round: realRound, kind, url, teams, matched: statuses.size, flagged: flags.length });
    if (lErr) throw lErr;
    return { url, teams: teams.length, matched: statuses.size, flagged: flags.length };
  }

  if (teamsDoc) {
    const lists: TeamList[] = parseTeamLists(teamsDoc.html);
    if (lists.length) {
      const entries = lists.flatMap((t) => [
        ...t.starting.map((name, i) => ({ team: t.team, name, status: `Starting - #${i + 1}` })),
        ...t.replacements.map((name, i) => ({ team: t.team, name, status: `Bench - #${16 + i}` })),
      ]);
      report.teamList = await apply("team-list", teamsDoc.url, lists.map((t) => t.team), entries);
    }
  }
  if (injuryDoc) {
    const lists: InjuryList[] = parseInjuryList(injuryDoc.html);
    if (lists.length) {
      const entries = lists.flatMap((t) => t.players.map((p) => ({ team: t.team, name: p.name, status: injuryStatus(p) })));
      report.injuryList = await apply("injury-list", injuryDoc.url, lists.map((t) => t.team), entries);
      // The player card's current status: for each team in this list, its injuries are replaced
      // (players no longer listed are cleared). Teams not in the list keep theirs.
      const listTeams = lists.map((t) => t.team);
      const { error: cErr } = await db
        .from("players")
        .update({ status: null, status_round: realRound, updated_at: now, updated_by: "articles" })
        .eq("season", seasonYear)
        .in("team_code", listTeams)
        .not("status", "is", null);
      if (cErr) throw cErr;
      const injured = new Map<string, string>();
      for (const e of entries) {
        const m = matchName(e.name, e.team, players);
        if (m.kind === "match") injured.set(m.player.id, e.status);
      }
      for (const [id, status] of injured) {
        await db.from("players").update({ status, status_round: realRound, updated_at: now, updated_by: "articles" }).eq("season", seasonYear).eq("id", id);
      }
    }
  }
  return report;
}

/**
 * Once a game has finished, its two teams' "Starting - #N" / "Bench - #N" statuses for that week
 * are cleared (injuries stay until the next injury list). Safe to run every few minutes.
 * Before they go they're saved in player_round_roles, so who started each round is kept.
 */
export async function clearFinishedGameStatuses(db: SupabaseClient, seasonYear: number, nowMs: number): Promise<number> {
  const season = getSeason(seasonYear);
  let cleared = 0;
  for (const f of recentlyFinishedFixtures(season, nowMs)) {
    const week = fantasyWeekForRealRound(season, Number(f.week));
    const teams = [teamCodeFromName(f.homeTeam), teamCodeFromName(f.awayTeam)].filter((t): t is string => !!t);
    if (week == null || !teams.length) continue;
    const { data: ids, error } = await db.from("players").select("id").eq("season", seasonYear).in("team_code", teams);
    if (error) throw error;
    const playerIds = (ids ?? []).map((p) => p.id);
    for (let i = 0; i < playerIds.length; i += 200) {
      const chunk = playerIds.slice(i, i + 200);
      const { data: named, error: nErr } = await db
        .from("player_week_status")
        .select("player_id, status, source")
        .eq("season", seasonYear)
        .eq("week", week)
        .or("status.ilike.starting%,status.ilike.bench%")
        .in("player_id", chunk);
      if (nErr) throw nErr;
      const keep = (named ?? []).map((r) => ({
        season: seasonYear,
        real_round: Number(f.week),
        week,
        player_id: r.player_id,
        role: statusKind(r.status) === "starting" ? "starting" : "bench",
        jersey: Number(String(r.status).match(/#\s*(\d{1,2})/)?.[1]) || null,
        source: r.source,
        saved_at: new Date(nowMs).toISOString(),
      }));
      if (keep.length) {
        const { error: kErr } = await db.from("player_round_roles").upsert(keep, { onConflict: "season,real_round,player_id" });
        if (kErr) throw kErr;
      }
      const { data: gone, error: dErr } = await db
        .from("player_week_status")
        .delete()
        .eq("season", seasonYear)
        .eq("week", week)
        .or("status.ilike.starting%,status.ilike.bench%")
        .in("player_id", chunk)
        .select("player_id");
      if (dErr) throw dErr;
      cleared += gone?.length ?? 0;
    }
  }
  return cleared;
}

/**
 * Questionable (QUES): once the round before a player's due return has finished, his card
 * status "Hamstring - 1-2 weeks" becomes "Questionable - Hamstring" until the next injury list
 * (lib/status/questionable.ts). Safe to run every few minutes. Returns how many changed.
 */
export async function applyQuestionable(db: SupabaseClient, seasonYear: number, nowMs: number): Promise<number> {
  const season = getSeason(seasonYear);
  const lastKickoff = new Map<number, number>();
  for (const f of season.fixtures) {
    const k = kickoffMs(f);
    if (Number.isFinite(k)) lastKickoff.set(f.week, Math.max(lastKickoff.get(f.week) ?? 0, k));
  }
  const roundFinishedMs = (r: number) => {
    const k = lastKickoff.get(r);
    return k == null ? null : k + GAME_OVER_AFTER_MS;
  };
  const { data, error } = await db
    .from("players")
    .select("id, status, status_round")
    .eq("season", seasonYear)
    .not("status", "is", null)
    .not("status_round", "is", null);
  if (error) throw error;
  let changed = 0;
  for (const p of data ?? []) {
    if (!dueQuestionable(p.status, p.status_round, roundFinishedMs, nowMs)) continue;
    const { error: uErr } = await db
      .from("players")
      .update({ status: questionableStatus(String(p.status)), updated_at: new Date(nowMs).toISOString(), updated_by: "questionable" })
      .eq("season", seasonYear)
      .eq("id", p.id)
      .eq("status", p.status); // only if it hasn't changed meanwhile
    if (uErr) throw uErr;
    changed++;
  }
  return changed;
}

export type FeedReport = {
  round: number | null;
  /** why nothing was checked, if so */
  skipped?: string;
  checked: string[];
  /** teams whose list isn't complete in the feed yet */
  notReady: string[];
  changes: number;
  unmatched: number;
  /** status words the feed used that we don't recognise (to check once the season starts) */
  unknownStatuses: string[];
};

/**
 * Late changes from the official fantasy game (lib/status/fantasyFeed.ts): for every game of the
 * round the fantasy game is on that hasn't kicked off yet, and whose team lists have been read,
 * Starting / Bench are brought in line with the fantasy game's list. Each change is listed on the
 * admin page (To check) so Ethan can see what moved. Safe to run every few minutes; returns null
 * when no game is waiting (nothing is fetched).
 */
export async function applyFantasyFeed(
  db: SupabaseClient,
  seasonYear: number,
  nowMs: number,
  fetchFeed: () => Promise<FantasyFeed> = fetchFantasyFeed
): Promise<FeedReport | null> {
  const season = getSeason(seasonYear);
  const waiting = season.fixtures.filter((f) => {
    const at = teamListsReadAtMs(season, Number(f.week));
    return kickoffMs(f) > nowMs && at != null && nowMs >= at;
  });
  if (!waiting.length) return null;

  const feed = await fetchFeed();
  const report: FeedReport = { round: feed.round, checked: [], notReady: [], changes: 0, unmatched: 0, unknownStatuses: [] };
  report.unknownStatuses = [...new Set(feed.players.map((p) => String(p.status ?? "")).filter((s) => s && feedRole(s) == null))];
  const fixtures = waiting.filter((f) => Number(f.week) === feed.round);
  if (!fixtures.length) return { ...report, skipped: `the fantasy game is on round ${feed.round ?? "?"}` };
  const realRound = Number(fixtures[0].week);
  const week = fantasyWeekForRealRound(season, realRound);
  if (week == null) return { ...report, skipped: "round not in the season" };

  // only once that round's team lists have been read (they set the jerseys; this fixes what changed)
  const { data: lists, error: lErr } = await db.from("status_imports").select("id").eq("season", seasonYear).eq("real_round", realRound).eq("kind", "team-list").limit(1);
  if (lErr) throw lErr;
  if (!lists?.length) return { ...report, skipped: "team lists not read yet" };

  const teams = [...new Set(fixtures.flatMap((f) => [teamCodeFromName(f.homeTeam), teamCodeFromName(f.awayTeam)]).filter((t): t is string => !!t))];
  const { data: playerRows, error: pErr } = await db
    .from("players")
    .select("id, first_name, last_name, team_code, external_id")
    .eq("season", seasonYear)
    .eq("active", true)
    .in("team_code", teams);
  if (pErr) throw pErr;
  const players = playerRows ?? [];
  const byExternal = new Map(players.filter((p) => p.external_id != null).map((p) => [Number(p.external_id), p]));
  const nameOf = new Map(players.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const matchPlayers: MatchPlayer[] = players.map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name, teamCode: p.team_code }));

  const { data: statusRows, error: sErr } = await db
    .from("player_week_status")
    .select("player_id, status, source")
    .eq("season", seasonYear)
    .eq("week", week)
    .in("player_id", players.map((p) => p.id));
  if (sErr) throw sErr;
  const ours = new Map<string, OurStatus>((statusRows ?? []).map((r) => [r.player_id, { status: r.status, source: r.source }]));

  // flags already raised this week (so the same change or name isn't listed twice)
  const { data: oldFlags, error: ofErr } = await db.from("status_import_flags").select("raw_text").eq("season", seasonYear).eq("week", week).eq("source", "fantasy-feed");
  if (ofErr) throw ofErr;
  const flagged = new Set((oldFlags ?? []).map((f) => f.raw_text));
  const flags: Record<string, unknown>[] = [];
  const changedTeams: string[] = [];
  const now = new Date(nowMs).toISOString();

  for (const team of teams) {
    const entries: FeedEntry[] = [];
    for (const fp of feed.players) {
      if (teamCodeFromName(feed.squads.get(Number(fp.squadId)) ?? "") !== team) continue;
      const role = feedRole(fp.status);
      if (role == null) continue;
      const name = `${fp.firstName ?? ""} ${fp.lastName ?? ""}`.trim();
      let playerId = byExternal.get(Number(fp.id))?.id ?? null;
      if (!playerId) {
        const m = matchName(name, team, matchPlayers);
        if (m.kind === "match") playerId = m.player.id;
      }
      entries.push({ playerId, name, role });
    }
    const teamIds = new Set(players.filter((p) => p.team_code === team).map((p) => p.id));
    const plan = planTeamChanges(entries, new Map([...ours].filter(([id]) => teamIds.has(id))));
    if (!plan.ready) {
      report.notReady.push(`${team} (${plan.starters} + ${plan.bench})`);
      continue;
    }
    report.checked.push(team);

    for (const c of plan.changes) {
      if (c.kind === "set") {
        const { error } = await db
          .from("player_week_status")
          .upsert({ season: seasonYear, week, player_id: c.playerId, status: c.status, source: "fantasy-feed", updated_at: now, updated_by: "fantasy game" }, { onConflict: "season,week,player_id" });
        if (error) throw error;
      } else {
        const { error } = await db.from("player_week_status").delete().eq("season", seasonYear).eq("week", week).eq("player_id", c.playerId).neq("source", "manual");
        if (error) throw error;
      }
      const text = `${nameOf.get(c.playerId) ?? c.playerId}: ${c.was ?? "not named"} → ${c.kind === "set" ? c.status : "not playing"}`;
      if (!flagged.has(text)) {
        flagged.add(text);
        flags.push({ season: seasonYear, week, source: "fantasy-feed", team_code: team, raw_text: text, problem: "Late change from the fantasy game" });
      }
    }
    for (const u of plan.unmatched) {
      const text = `${u.name} → ${u.role === "starting" ? "Starting" : "Bench"}`;
      if (flagged.has(text)) continue;
      flagged.add(text);
      const m = matchName(u.name, team, matchPlayers);
      flags.push({
        season: seasonYear, week, source: "fantasy-feed", team_code: team, raw_text: text,
        problem: "A name from the fantasy game didn't match a player", suggestion_player_id: m.kind === "flag" ? m.suggestion?.id ?? null : null,
      });
      report.unmatched++;
    }
    if (plan.changes.length) changedTeams.push(team);
    report.changes += plan.changes.length;
  }

  if (flags.length) {
    const { error } = await db.from("status_import_flags").insert(flags);
    if (error) throw error;
  }
  if (report.changes || report.unmatched) {
    const { error } = await db
      .from("status_imports")
      .insert({ season: seasonYear, real_round: realRound, kind: "fantasy-feed", url: FANTASY_PLAYERS_URL, teams: changedTeams, matched: report.changes, flagged: report.unmatched });
    if (error) throw error;
  }
  return report;
}
