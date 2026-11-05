// lib/status/import.ts
// Fetches a round's official team-list and injury articles and turns them into player statuses
// for the fantasy week: named in the XV -> "Starting", replacements -> "Benched", injury list ->
// e.g. "Knee - Season". Names that don't clearly match a player are flagged for the admin page.
// - Statuses Ethan set by hand ("manual") are never overwritten.
// - Each article is read once (the articles aren't updated afterwards; late changes are made by
//   Ethan by hand). Running it again is safe: it replaces its own earlier statuses and flags.
// - Injuries carry on until the next injury list: each new list replaces the current injuries of
//   the teams in it (a team not in the list, e.g. on a bye, keeps its injuries).
// - Starting / Benched are cleared once that team's game has finished (clearFinishedGameStatuses).
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateArticleUrls, injuryStatus, parseInjuryList, parseTeamLists, teamCodeFromName, type InjuryList, type TeamList } from "@/lib/status/articles";
import { matchName, type MatchPlayer } from "@/lib/status/match";
import { fantasyWeekForRealRound, getSeason, recentlyFinishedFixtures } from "@/lib/season";

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
        ...t.starting.map((name) => ({ team: t.team, name, status: "Starting" })),
        ...t.replacements.map((name) => ({ team: t.team, name, status: "Benched" })),
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
        .update({ status: null, updated_at: now, updated_by: "articles" })
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
        await db.from("players").update({ status, updated_at: now, updated_by: "articles" }).eq("season", seasonYear).eq("id", id);
      }
    }
  }
  return report;
}

/**
 * Once a game has finished, its two teams' "Starting" / "Benched" statuses for that week are
 * cleared (injuries stay until the next injury list). Safe to run every few minutes.
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
      const { data: gone, error: dErr } = await db
        .from("player_week_status")
        .delete()
        .eq("season", seasonYear)
        .eq("week", week)
        .in("status", ["Starting", "Benched", "starting", "benched"])
        .in("player_id", playerIds.slice(i, i + 200))
        .select("player_id");
      if (dErr) throw dErr;
      cleared += gone?.length ?? 0;
    }
  }
  return cleared;
}
