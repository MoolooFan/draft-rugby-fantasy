// lib/players/db.ts
// Loads a season's players from the database in the shape the pages already use (the same
// fields the old players.json file and players Google Sheet had), plus weekly status.
import type { SupabaseClient } from "@supabase/supabase-js";
import { POS_NAME } from "@/lib/draft/constants";
import { getSeason, SEASONS, weekFinaliseAtMs } from "@/lib/season";
import { loadSavedRoles, savedRoleStatus } from "@/lib/status/roles";

const TEAM_NAME: Record<string, string> = {
  BLU: "Blues", BRU: "Brumbies", CHI: "Chiefs", CRU: "Crusaders", DRU: "Drua", FOR: "Force",
  HIG: "Highlanders", HUR: "Hurricanes", MOA: "Moana", MOP: "Moana", RED: "Reds", WAR: "Waratahs",
};

const ZERO_STATS = {
  gamesPlayed: 0, starts: 0, triesScored: 0, tryAssists: 0, lineBreaks: 0, lineBreakAssists: 0, defendersBeaten: 0,
  metresGained: 0, offloads: 0, tacklesMade: 0, tacklesMissed: 0, turnoversForced: 0, interceptions: 0, fiftyTwentyTwos: 0,
  penaltiesConceded: 0, errors: 0, lineoutsWon: 0, lineoutSteals: 0, lineoutErrors: 0, scrumsWon: 0, conversions: 0,
  conversionsMissed: 0, penaltyGoals: 0, penaltyGoalsMissed: 0, dropGoals: 0, dropGoalsMissed: 0, yellowCards: 0, redCards: 0,
};

export type PlayerRow = {
  season: number;
  id: string;
  first_name: string;
  last_name: string;
  team_code: string;
  pos: string;
  pos2: string | null;
  pos3: string | null;
  draft_rank: number | null;
  external_id: number | null;
  status: string | null;
  active: boolean;
  /** Ethan's start-of-season notes for expected points (migration 20261112000000) */
  expected_role?: "starter" | "bench" | "squad" | null;
  kick_order?: number | null;
};

export type SitePlayer = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  teamName: string;
  posAbbrev: string;
  posName: string;
  secondaryPosAbbrev?: string;
  secondaryPosName?: string;
  thirdPosAbbrev?: string;
  thirdPosName?: string;
  draftRank: number;
  externalId: number | null;
  active: boolean;
  /** Ethan's start-of-season notes for expected points */
  expectedRole?: "starter" | "bench" | "squad" | null;
  kickOrder?: number | null;
  /** current status for the player card, e.g. 'Knee - TBC' */
  status: string | null;
  /** status by fantasy week, as written: { W1: "Starting", W2: "Benched", W3: "Knee - TBC" } (no entry = not named) */
  weeklyStatus: Record<string, string>;
  stats: typeof ZERO_STATS;
};

export function toSitePlayer(p: PlayerRow, weekly: Record<string, string> = {}): SitePlayer {
  return {
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    teamCode: p.team_code,
    teamName: TEAM_NAME[p.team_code] ?? p.team_code,
    posAbbrev: p.pos,
    posName: POS_NAME[p.pos] ?? p.pos,
    ...(p.pos2 ? { secondaryPosAbbrev: p.pos2, secondaryPosName: POS_NAME[p.pos2] ?? p.pos2 } : {}),
    ...(p.pos3 ? { thirdPosAbbrev: p.pos3, thirdPosName: POS_NAME[p.pos3] ?? p.pos3 } : {}),
    draftRank: p.draft_rank ?? 9999,
    externalId: p.external_id,
    active: p.active,
    expectedRole: p.expected_role ?? null,
    kickOrder: p.kick_order ?? null,
    status: p.status,
    weeklyStatus: weekly,
    stats: { ...ZERO_STATS },
  };
}

async function all<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** A season's players with their weekly statuses. Hidden (inactive) players only if asked. */
export async function loadSeasonPlayers(db: SupabaseClient, season: number, opts: { includeInactive?: boolean } = {}): Promise<SitePlayer[]> {
  const [rows, statuses] = await Promise.all([
    all<PlayerRow>((from, to) => {
      let q = db.from("players").select("*").eq("season", season);
      if (!opts.includeInactive) q = q.eq("active", true);
      return q.order("draft_rank", { ascending: true, nullsFirst: false }).order("id").range(from, to);
    }),
    all<{ week: number; player_id: string; status: string }>((from, to) =>
      db.from("player_week_status").select("week, player_id, status").eq("season", season).order("week").order("player_id").range(from, to)
    ),
  ]);
  const weekly = new Map<string, Record<string, string>>();
  for (const s of statuses) {
    const m = weekly.get(s.player_id) ?? {};
    m[`W${s.week}`] = s.status.trim();
    weekly.set(s.player_id, m);
  }
  // Finished weeks: the Starting / Bench statuses are cleared after each game, so they come back
  // from the saved record (lib/status/roles.ts) for the projections and AI coach. Only once the
  // week is finalised, so the XV / SUB badges don't come back while the week is still on.
  if (SEASONS[season]) {
    const s = getSeason(season);
    const now = Date.now();
    for (const r of await loadSavedRoles(db, season)) {
      const done = weekFinaliseAtMs(s, r.week);
      if (done == null || now < done) continue;
      const m = weekly.get(r.player_id) ?? {};
      if (!m[`W${r.week}`]) m[`W${r.week}`] = savedRoleStatus(r);
      weekly.set(r.player_id, m);
    }
  }
  return rows.map((p) => toSitePlayer(p, weekly.get(p.id)));
}
