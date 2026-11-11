// lib/league/honours.ts
// Season honours (champion, runner-up, third, semi-finalists, wooden spoon) and championship
// stars (plan item E8, agreed with Ethan Nov 2026).
//
// - When every game of a league's season is final, its honours are recorded in the honours
//   table (by person, so they follow the person to next season's league).
// - A league keeps its history across seasons through leagues.lineage_id: restarting a league
//   for a new season keeps the same lineage, and Ethan links the 2025/26 history (imported by
//   name) to the first 2027 league and to people's accounts on the admin page.
// - A team's stars = championships its owner has won in that league's lineage.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";

export type HonourPlace = "champion" | "runner_up" | "third" | "semi_finalist" | "wooden_spoon";

export type HonourMatchup = LadderMatchup & {
  kind: string;
  playoff_key: string | null;
  decides: string | null;
  winner_team_id: string | null;
};

/** The season's honours once every game is final (null while any game is still to be played). */
export function seasonHonours(teamIds: string[], matchups: HonourMatchup[]): Array<{ teamId: string; place: HonourPlace }> | null {
  if (!matchups.length || matchups.some((m) => m.status !== "final")) return null;
  const out = new Map<string, HonourPlace>();
  const set = (teamId: string | null, place: HonourPlace) => {
    if (teamId && !out.has(teamId)) out.set(teamId, place);
  };
  const loser = (m: HonourMatchup) =>
    !m.away_team_id ? null : m.winner_team_id === m.home_team_id ? m.away_team_id : m.winner_team_id === m.away_team_id ? m.home_team_id : null;
  const ladder = buildLadder(teamIds, matchups).map((r) => r.teamId);

  const gf = matchups.find((m) => m.decides === "champion");
  if (gf && gf.winner_team_id) {
    set(gf.winner_team_id, "champion");
    set(loser(gf), "runner_up");
  } else {
    set(ladder[0] ?? null, "champion"); // no finals: top of the ladder
    set(ladder[1] ?? null, "runner_up");
  }
  const third = matchups.find((m) => m.playoff_key === "3P");
  if (third?.winner_team_id) set(third.winner_team_id, "third");
  for (const m of matchups) {
    if (m.kind === "finals" && String(m.playoff_key ?? "").startsWith("SF")) set(loser(m), "semi_finalist");
  }
  if (third) set(loser(third), "semi_finalist");

  const spoonGame = matchups.find((m) => m.decides === "spoon");
  const spoon = spoonGame ? loser(spoonGame) : ladder[ladder.length - 1] ?? null;
  if (spoon && !out.has(spoon)) out.set(spoon, "wooden_spoon");

  return [...out].map(([teamId, place]) => ({ teamId, place }));
}

type Db = SupabaseClient;

/** The lineage (league history group) of a league: its lineage_id, or its own id. */
export async function leagueLineage(db: Db, leagueId: string): Promise<string> {
  const { data } = await db.from("leagues").select("lineage_id").eq("id", leagueId).maybeSingle();
  return data?.lineage_id ?? leagueId;
}

/**
 * Records a league's season honours once every game is final (safe to run again: it replaces
 * that league's rows). Called after each week is finalised.
 */
export async function recordSeasonHonours(db: Db, leagueId: string): Promise<boolean> {
  const { data: league, error: lErr } = await db.from("leagues").select("id, name, season, lineage_id, schedule_plan").eq("id", leagueId).maybeSingle();
  if (lErr) throw lErr;
  if (!league) return false;
  // Every week of the season must be finalised (some games are only added as the ladder decides them).
  const planWeeks: number[] = Array.isArray(league.schedule_plan?.weeks) ? league.schedule_plan.weeks : [];
  if (!planWeeks.length) return false;
  const { data: done, error: fErr } = await db.from("league_week_finalisations").select("week").eq("league_id", leagueId);
  if (fErr) throw fErr;
  const finalised = new Set((done ?? []).map((d) => d.week));
  if (planWeeks.some((w) => !finalised.has(w))) return false;
  const [teams, matchups] = await Promise.all([
    db.from("teams").select("id, owner_username, name").eq("league_id", leagueId),
    db.from("league_matchups").select("kind, status, playoff_key, decides, winner_team_id, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus").eq("league_id", leagueId),
  ]);
  if (teams.error) throw teams.error;
  if (matchups.error) throw matchups.error;
  const honours = seasonHonours((teams.data ?? []).map((t) => t.id), (matchups.data ?? []) as HonourMatchup[]);
  if (!honours) return false;

  const owners = [...new Set((teams.data ?? []).map((t) => String(t.owner_username ?? "")).filter(Boolean))];
  const { data: users, error: uErr } = owners.length
    ? await db.from("users").select("id, username, username_norm, first_name").in("username_norm", owners)
    : { data: [], error: null };
  if (uErr) throw uErr;
  const userByName = new Map((users ?? []).map((u) => [u.username_norm, u]));

  const rows = honours.map((h) => {
    const team = (teams.data ?? []).find((t) => t.id === h.teamId);
    const user = userByName.get(String(team?.owner_username ?? ""));
    return {
      season: league.season,
      league_id: leagueId,
      league_name: league.name,
      lineage_id: league.lineage_id ?? leagueId,
      person_name: user?.first_name || user?.username || team?.owner_username || team?.name || "?",
      user_id: user?.id ?? null,
      place: h.place,
    };
  });
  const { error: dErr } = await db.from("honours").delete().eq("league_id", leagueId).eq("season", league.season);
  if (dErr) throw dErr;
  const { error: iErr } = await db.from("honours").insert(rows);
  if (iErr) throw iErr;
  return true;
}

/** Championships per team in this league (their owner's titles in the league's lineage). */
export async function championshipStars(db: Db, leagueId: string, teams: Array<{ id: string; owner_username: string | null }>): Promise<Record<string, number>> {
  const lineage = await leagueLineage(db, leagueId);
  const { data: champs, error } = await db.from("honours").select("user_id").eq("lineage_id", lineage).eq("place", "champion").not("user_id", "is", null);
  if (error) throw error;
  if (!champs?.length) return {};
  const owners = [...new Set(teams.map((t) => String(t.owner_username ?? "")).filter(Boolean))];
  const { data: users, error: uErr } = await db.from("users").select("id, username_norm").in("username_norm", owners);
  if (uErr) throw uErr;
  const idByOwner = new Map((users ?? []).map((u) => [u.username_norm, u.id]));
  const out: Record<string, number> = {};
  for (const t of teams) {
    const uid = idByOwner.get(String(t.owner_username ?? ""));
    const n = uid ? champs.filter((c) => c.user_id === uid).length : 0;
    if (n) out[t.id] = n;
  }
  return out;
}

/**
 * The team this person had the last time they played in this league's lineage (any earlier
 * season - they may have skipped one), so a rejoining player gets their name and picture back.
 */
export async function previousTeam(db: Db, lineage: string, ownerUsername: string, excludeLeagueId: string): Promise<{ name: string; picture_url: string | null } | null> {
  const { data: leagues, error } = await db.from("leagues").select("id, season").or(`lineage_id.eq.${lineage},id.eq.${lineage}`).neq("id", excludeLeagueId);
  if (error) throw error;
  if (!leagues?.length) return null;
  const seasonOf = new Map(leagues.map((l) => [l.id, Number(l.season) || 0]));
  const { data: teams, error: tErr } = await db
    .from("teams")
    .select("league_id, name, picture_url")
    .eq("owner_username", ownerUsername)
    .in("league_id", leagues.map((l) => l.id));
  if (tErr) throw tErr;
  const latest = (teams ?? []).sort((a, b) => (seasonOf.get(b.league_id) ?? 0) - (seasonOf.get(a.league_id) ?? 0))[0];
  return latest ? { name: latest.name, picture_url: latest.picture_url ?? null } : null;
}
