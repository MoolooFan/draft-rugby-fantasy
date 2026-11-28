// lib/league/roundRecap.ts
// A finalised round's recap for the whole league (Ethan, 19 Nov 2026): the league chat gets one
// "Round N recap" message, and tapping it opens this in a pop-up. Server only.
//  - every game's result
//  - the Shield: taken, defended or first awarded that round
//  - player of the week: the round's top scorer (all players, this league's scoring), and who had him
//  - the best and worst pickups for the round: players added that week (free agents and waiver
//    claims) who played in it, by the points they scored, with the player they replaced
//  - your best player: the top scorer in your XV that round (Ethan, 28 Nov 2026)
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSeason, realRoundsForWeek, SEASONS, weekLabel } from "@/lib/season";
import { isFrontRow, playerPoints, RESULT_STATS, roundPoints, STATS, statCountsFromRaw, type StatCounts } from "@/lib/scoring";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { addMatchResults } from "@/lib/results/matchResults";
import { loadRosterPlayers } from "@/lib/league/rosterChange";
import { loadShield } from "@/lib/league/shieldServer";

export type RecapTeam = { id: string; name: string };
export type RecapPickup = {
  playerId: string;
  name: string;
  /** Super Rugby team, for the jersey */
  teamCode: string | null;
  points: number;
  team: RecapTeam;
  via: "waiver" | "free agent";
  dropped: { id: string; name: string; teamCode: string | null; points: number } | null;
};
export type RoundRecap = {
  week: number;
  roundName: string;
  games: Array<{ label: string | null; home: RecapTeam | null; away: RecapTeam | null; homeScore: number | null; awayScore: number | null }>;
  shield: { name: string; kind: "awarded" | "defended" | "won"; holder: RecapTeam | null; other: RecapTeam | null; homeScore: number | null; awayScore: number | null; defences: number } | null;
  playersOfWeek: Array<{ id: string; name: string; teamCode: string | null; points: number; fantasyTeam: RecapTeam | null }>;
  bestPickup: RecapPickup | null;
  worstPickup: RecapPickup | null;
  /** the asking team's top scorer in its XV that round (null: none, or no team asked) */
  yourBest: { id: string; name: string; teamCode: string | null; points: number } | null;
};

export async function loadRoundRecap(db: SupabaseClient, leagueId: string, week: number, yourTeamId?: string | null): Promise<RoundRecap | null> {
  const [{ data: league }, { data: teams }] = await Promise.all([
    db.from("leagues").select("season").eq("id", leagueId).maybeSingle(),
    db.from("teams").select("id, name").eq("league_id", leagueId),
  ]);
  if (!league) return null;
  const season = Number(league.season);
  if (!SEASONS[season]) return null;
  const seasonCfg = getSeason(season);
  const team = (id: string | null | undefined): RecapTeam | null => {
    const t = (teams ?? []).find((x) => x.id === id);
    return t ? { id: t.id, name: t.name } : null;
  };

  const [{ data: matchups }, { data: results }, { data: fins }, { data: picks }, { data: fa }, { data: claims }] = await Promise.all([
    db.from("league_matchups").select("kind, label, weeks, home_team_id, away_team_id, home_score, away_score").eq("league_id", leagueId),
    db.from("team_week_results").select("team_id, player_points").eq("league_id", leagueId).eq("week", week),
    db.from("league_week_finalisations").select("week").eq("league_id", leagueId).eq("week", week),
    db.from("team_selections").select("team_id, lineup").eq("league_id", leagueId).eq("week", week),
    db.from("free_agent_transfers").select("team_id, add_player_id, drop_player_id").eq("league_id", leagueId).eq("week", week).eq("status", "PROCESSED"),
    db.from("waiver_claims").select("team_id, add_player_id, drop_player_id").eq("league_id", leagueId).eq("week", week).eq("status", "PROCESSED"),
  ]);
  const thisWeek = (matchups ?? []).filter((m) => (m.weeks ?? []).map(Number).includes(week));
  const allScored = thisWeek.length > 0 && thisWeek.every((m) => !m.away_team_id || (m.home_score != null && m.away_score != null));
  if (!(results ?? []).length && !(fins ?? []).length && !allScored) return null; // not finalised yet

  // --- results
  const games = thisWeek
    .map((m) => ({
      label: m.kind === "regular" ? null : (m.label as string | null),
      home: team(m.home_team_id),
      away: team(m.away_team_id),
      homeScore: m.home_score == null ? null : Number(m.home_score),
      awayScore: m.away_score == null ? null : Number(m.away_score),
    }));

  // --- every player's points in the round (this league's scoring)
  const rules = await getLeagueScoringRules(db, leagueId);
  const rounds = realRoundsForWeek(seasonCfg, week);
  const counts = new Map<string, StatCounts>();
  for (let from = 0; ; from += 1000) {
    const { data: rows, error } = await db
      .from("player_round_stats")
      .select("internal_player_id, round, raw_json")
      .eq("season", season)
      .in("round", rounds)
      .range(from, from + 999);
    if (error) throw error;
    await addMatchResults(db, season, (rows ?? []) as never);
    for (const r of rows ?? []) {
      const c = statCountsFromRaw((r.raw_json as { stats?: unknown } | null)?.stats);
      const id = String(r.internal_player_id);
      const prev = counts.get(id);
      if (!prev) counts.set(id, c);
      else for (const s of [...STATS, ...RESULT_STATS]) prev[s.key] = Number(prev[s.key] ?? 0) + Number(c[s.key] ?? 0);
    }
    if ((rows ?? []).length < 1000) break;
  }
  const pickups = [
    ...(claims ?? []).map((c) => ({ ...c, via: "waiver" as const })),
    ...(fa ?? []).map((c) => ({ ...c, via: "free agent" as const })),
  ];
  const ids = [...counts.keys(), ...pickups.flatMap((p) => [p.add_player_id, p.drop_player_id].filter(Boolean) as string[])];
  const players = await loadRosterPlayers(db, season, ids);
  const pointsOf = (id: string): number => {
    const c = counts.get(id);
    const p = players.get(id);
    return c ? roundPoints(playerPoints(c, isFrontRow(p ?? null, rules), rules)) : 0;
  };
  const codeOf = (id: string): string | null => ((players.get(id) as { teamCode?: string } | undefined)?.teamCode ?? null) || null;
  const nameOf = (id: string) => {
    const p = players.get(id) as { firstName?: string; lastName?: string } | undefined;
    return p ? `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() : id;
  };

  // --- player of the week (ties: all of them), and the fantasy team that had him in its XV
  let top = 0;
  for (const id of counts.keys()) top = Math.max(top, pointsOf(id));
  // the team that had him starting: the round's stored results, else the lineups saved for it
  const scoredFor = (id: string): string | null => {
    const fromResults = (results ?? []).find((r) => Object.prototype.hasOwnProperty.call((r.player_points as Record<string, number>) ?? {}, id))?.team_id;
    if (fromResults) return fromResults;
    for (const sel of picks ?? []) {
      for (const [slot, pl] of Object.entries((sel.lineup ?? {}) as Record<string, { id?: string } | null>)) {
        if (!/^bench\d+$/.test(slot) && pl?.id === id) return sel.team_id;
      }
    }
    return null;
  };
  const playersOfWeek =
    top > 0
      ? [...counts.keys()]
          .filter((id) => pointsOf(id) === top)
          .map((id) => ({ id, name: nameOf(id), teamCode: codeOf(id), points: top, fantasyTeam: team(scoredFor(id)) }))
      : [];

  // --- pickups for the round, by the points the new player scored in it
  // only players who got on the field that round: injured players are often picked up weeks
  // before they're back, and shouldn't count as a bad pickup (Ethan, 19 Nov 2026)
  const played = (id: string) => Number(counts.get(id)?.minutesPlayed ?? 0) > 0;
  const rated: RecapPickup[] = pickups
    .filter((p) => p.add_player_id && team(p.team_id) && played(String(p.add_player_id)))
    .map((p) => ({
      playerId: String(p.add_player_id),
      name: nameOf(String(p.add_player_id)),
      teamCode: codeOf(String(p.add_player_id)),
      points: pointsOf(String(p.add_player_id)),
      team: team(p.team_id)!,
      via: p.via,
      dropped: p.drop_player_id ? { id: String(p.drop_player_id), name: nameOf(String(p.drop_player_id)), teamCode: codeOf(String(p.drop_player_id)), points: pointsOf(String(p.drop_player_id)) } : null,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const bestPickup = rated[0] ?? null;
  const worstPickup = rated.length > 1 ? rated[rated.length - 1] : null;

  // --- the Shield that round
  let shield: RoundRecap["shield"] = null;
  try {
    const s = await loadShield(db, leagueId);
    const e = s.events.find((x) => x.week === week);
    if (e) {
      // defences in the holder's reign up to and including this round
      let holder: string | null = null;
      let defences = 0;
      for (const x of [...s.events].sort((a, b) => a.week - b.week)) {
        if (x.week > week) break;
        if (x.kind === "defended" && x.holderTeamId === holder) defences++;
        else if (x.holderTeamId !== holder) {
          holder = x.holderTeamId;
          defences = x.kind === "defended" ? 1 : 0;
        }
      }
      shield = { name: s.name, kind: e.kind, holder: team(e.holderTeamId), other: team(e.otherTeamId), homeScore: e.homeScore, awayScore: e.awayScore, defences };
    }
  } catch (err) {
    console.error("[roundRecap] shield:", err);
  }

  // --- your best player: the players who scored for your team (the round's stored results), else
  // the starters in the lineup you saved for it
  let yourBest: RoundRecap["yourBest"] = null;
  if (yourTeamId) {
    const stored = (results ?? []).find((r) => r.team_id === yourTeamId)?.player_points as Record<string, number> | null | undefined;
    let ids = Object.keys(stored ?? {});
    if (!ids.length) {
      const sel = (picks ?? []).find((x) => x.team_id === yourTeamId);
      ids = Object.entries((sel?.lineup ?? {}) as Record<string, { id?: string } | null>)
        .filter(([slot, pl]) => !/^bench\d+$/.test(slot) && pl?.id)
        .map(([, pl]) => String(pl!.id));
    }
    const best = ids
      .filter((id) => counts.has(id))
      .map((id) => ({ id, points: pointsOf(id) }))
      .sort((a, b) => b.points - a.points)[0];
    if (best) yourBest = { id: best.id, name: nameOf(best.id), teamCode: codeOf(best.id), points: best.points };
  }

  return { week, roundName: weekLabel(seasonCfg, week), games, shield, playersOfWeek, bestPickup, worstPickup, yourBest };
}
