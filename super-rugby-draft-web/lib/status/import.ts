// lib/status/import.ts
// Fetches a round's official team-list and injury articles and turns them into player statuses
// for the fantasy week: named in the XV -> "Starting", replacements -> "Benched", injury list ->
// e.g. "Knee - Season". Names that don't clearly match a player are flagged for the admin page.
// - Statuses Ethan set by hand ("manual") are never overwritten.
// - Safe to run again (it runs hourly until kickoff to pick up article updates): it replaces
//   its own earlier statuses and unresolved flags for the teams in the article.
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateArticleUrls, injuryStatus, parseInjuryList, parseTeamLists, type InjuryList, type TeamList } from "@/lib/status/articles";
import { matchName, type MatchPlayer } from "@/lib/status/match";
import { fantasyWeekForRealRound, getSeason } from "@/lib/season";

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
  urls: { teams?: string; injuries?: string } = {}
): Promise<ImportReport> {
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
  const teamsDoc = await fetchFirst(urls.teams ? [urls.teams] : cand.teams);
  const injuryDoc = await fetchFirst(urls.injuries ? [urls.injuries] : cand.injuries);
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
      // The player card's "current status": injured players get their injury; named players
      // are cleared (skipping any Ethan changed by hand this week).
      const injured = new Map<string, string>();
      for (const e of entries) {
        const m = matchName(e.name, e.team, players);
        if (m.kind === "match" && !manual.has(m.player.id)) injured.set(m.player.id, e.status);
      }
      for (const [id, status] of injured) {
        await db.from("players").update({ status, updated_at: now, updated_by: "articles" }).eq("season", seasonYear).eq("id", id);
      }
    }
  }
  if (report.teamList) {
    const { data: named } = await db.from("player_week_status").select("player_id").eq("season", seasonYear).eq("week", week).eq("source", "team-list");
    const ids = (named ?? []).map((r) => r.player_id).filter((id) => !manual.has(id));
    for (let i = 0; i < ids.length; i += 200) {
      await db.from("players").update({ status: null, updated_at: now, updated_by: "articles" }).eq("season", seasonYear).in("id", ids.slice(i, i + 200));
    }
  }
  return report;
}
