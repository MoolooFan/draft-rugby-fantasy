// lib/league/rosterChange.ts
// Server side of every roster change (free-agent adds, waiver claims, trades, and later IR):
// 1. the new roster must keep the position rules (so a full XV is always possible), and
// 2. afterwards each changed team's lineup for every week that isn't locked yet is fixed up
//    (lib/league/lineup.ts), with the captain / vice-captain rules applied.
// Locked weeks are never changed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rosterFits, startingGaps } from "@/lib/draft/rules";
import { isStandardSquad, kindLabel, rosterSize, SLOT_KINDS, squadFormatOf, STANDARD_SQUAD, type SquadFormat } from "@/lib/league/squad";
import { fixCaptains, updateLineup } from "@/lib/league/lineup";
import { selectionDeadlineMs } from "@/lib/league/deadlines";
import { getSeason, SEASONS, totalFantasyWeeks } from "@/lib/season";
import type { Lineup, LineupPlayer } from "@/lib/scoring/week";

type Db = SupabaseClient;

export type RosterPlayer = LineupPlayer & { draftRank: number };

/** Positions (and names) of these players, from the players table. */
export async function loadRosterPlayers(db: Db, season: number, ids: string[]): Promise<Map<string, RosterPlayer>> {
  const out = new Map<string, RosterPlayer>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db
      .from("players")
      .select("id, first_name, last_name, team_code, pos, pos2, pos3, draft_rank")
      .eq("season", season)
      .in("id", unique.slice(i, i + 200));
    if (error) throw error;
    for (const p of data ?? []) {
      out.set(p.id, {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        teamCode: p.team_code,
        posAbbrev: p.pos,
        secondaryPosAbbrev: p.pos2 ?? null,
        thirdPosAbbrev: p.pos3 ?? null,
        draftRank: p.draft_rank ?? 9999,
      });
    }
  }
  return out;
}

export const POSITION_RULES_ERROR =
  "This would break the position rules (your team needs 2 PR, 1 HO, 2 LK, 3 LF, 1 HB, 1 FH, 2 CE and 3 OB)";

/** The position-rules message for a league's squad. */
export function positionRulesError(format?: SquadFormat | null): string {
  if (!format || isStandardSquad(format)) return POSITION_RULES_ERROR;
  const parts = SLOT_KINDS.filter((k) => (format.starters[k.kind] ?? 0) > 0).map((k) => {
    const n = format.starters[k.kind]!;
    const group = ["TF", "HV", "FW", "BK", "ANY"].includes(k.kind);
    return `${n} ${group ? kindLabel(k.kind) : k.short}`;
  });
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `This would break the position rules (your team needs ${list})`;
}

/**
 * Why this roster (not counting IR) breaks the rules, or null if it's fine.
 * prevIds: the roster before the change. A team below 20 (a player in IR) may already be short
 * of a position; a change is fine as long as it doesn't leave more starting spots unfillable
 * than before. A full team of 20 must always be able to field a full XV.
 */
export function rosterProblem(ids: string[], players: Map<string, RosterPlayer>, prevIds?: string[], format?: SquadFormat | null): string | null {
  const max = rosterSize(format ?? STANDARD_SQUAD);
  if (ids.length > max) return `A team can have at most ${max} players (not counting IR)`;
  const missing = ids.filter((id) => !players.has(id));
  if (missing.length) return `Unknown player: ${missing[0]}`;
  const next = ids.map((id) => players.get(id)!);
  if (!rosterFits(next, format)) return positionRulesError(format);
  const gaps = startingGaps(next, format);
  if (gaps > 0) {
    const before = prevIds ? startingGaps(prevIds.map((id) => players.get(id)).filter((p): p is RosterPlayer => !!p), format) : 0;
    if (gaps > before) return positionRulesError(format);
  }
  return null;
}

/** Ordering for "highest draft pick": this league's pick number, then players never drafted by draft rank. */
export async function loadPickRank(db: Db, leagueId: string, players: Map<string, RosterPlayer>): Promise<(id: string) => number> {
  const { data, error } = await db.from("draft_picks").select("player_id, pick_number").eq("league_id", leagueId);
  if (error) throw error;
  const pick = new Map<string, number>((data ?? []).map((r) => [String(r.player_id), Number(r.pick_number)]));
  return (id: string) => pick.get(id) ?? 100_000 + (players.get(id)?.draftRank ?? 9999);
}

/** The first week of this league whose lineups haven't locked yet (null after the season). */
export function firstOpenWeek(season: number, firstWeek: number | null | undefined, nowMs: number): number | null {
  if (!SEASONS[season]) return null;
  const n = totalFantasyWeeks(getSeason(season));
  for (let w = Math.max(1, firstWeek ?? 1); w <= n; w++) {
    const d = selectionDeadlineMs(season, w);
    if (d != null && d > nowMs) return w;
  }
  return null;
}

type SelectionRow = { team_id: string; week: number; lineup: Lineup | null; captain_id: string | null; vice_id: string | null; locked_at: string | null };

/** A team's lineup for a week: the one saved for it, or else its most recent earlier one (carried over). */
export function effectiveSelection(rows: SelectionRow[], teamId: string, week: number): SelectionRow | null {
  const mine = rows.filter((r) => r.team_id === teamId && r.week <= week).sort((a, b) => b.week - a.week);
  return mine[0] ?? null;
}

/**
 * After rosters change: fix each team's lineups for the weeks that aren't locked yet. A team
 * with no lineup saved for the first open week gets one (its carried-over lineup, fixed), so
 * what the team page shows is what will lock.
 * rosters: team id -> its player ids now (not including IR).
 */
export async function updateLineupsAfterRosterChange(
  db: Db,
  leagueId: string,
  rosters: Map<string, string[]>,
  nowMs: number = Date.now()
): Promise<{ updated: number }> {
  if (!rosters.size) return { updated: 0 };
  const { data: league, error: lErr } = await db.from("leagues").select("season, first_week, squad_format").eq("id", leagueId).maybeSingle();
  if (lErr) throw lErr;
  if (!league) return { updated: 0 };
  const season = Number(league.season);
  const format = squadFormatOf(league.squad_format);
  const open = firstOpenWeek(season, league.first_week, nowMs);
  if (open == null) return { updated: 0 };

  const teamIds = [...rosters.keys()];
  const { data: rows, error: sErr } = await db
    .from("team_selections")
    .select("team_id, week, lineup, captain_id, vice_id, locked_at")
    .eq("league_id", leagueId)
    .in("team_id", teamIds);
  if (sErr) throw sErr;
  const selections = (rows ?? []) as SelectionRow[];

  const players = await loadRosterPlayers(db, season, [...rosters.values()].flat());
  const pickRank = await loadPickRank(db, leagueId, players);

  const upserts: Array<Record<string, unknown>> = [];
  for (const [teamId, ids] of rosters) {
    const roster = ids
      .map((id) => players.get(id))
      .filter((p): p is RosterPlayer => !!p)
      .sort((a, b) => pickRank(a.id) - pickRank(b.id));
    // the first open week (saved or carried over), then any later weeks already saved
    const weeks = new Set<number>([open, ...selections.filter((r) => r.team_id === teamId && r.week > open).map((r) => r.week)]);
    for (const week of [...weeks].sort((a, b) => a - b)) {
      const sel = effectiveSelection(selections, teamId, week);
      if (sel?.week === week && sel.locked_at) continue; // locked: never changed
      const res = updateLineup(sel?.lineup ?? null, roster, format);
      const caps = fixCaptains(res.lineup, sel?.captain_id, sel?.vice_id, pickRank, format);
      upserts.push({
        league_id: leagueId,
        week,
        team_id: teamId,
        lineup: res.lineup,
        captain_id: caps.captainId,
        vice_id: caps.viceId,
        updated_at: new Date(nowMs).toISOString(),
      });
    }
  }
  if (upserts.length) {
    const { error } = await db.from("team_selections").upsert(upserts, { onConflict: "league_id,week,team_id" });
    if (error) throw error;
  }
  return { updated: upserts.length };
}
