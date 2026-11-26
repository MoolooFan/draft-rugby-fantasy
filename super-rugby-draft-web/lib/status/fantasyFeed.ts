// lib/status/fantasyFeed.ts
// Late team changes from the official Super Rugby fantasy game (playfantasyrugby.com, where the
// player stats already come from; Ethan, 20 Nov 2026). Its player list marks each player
// "Selected to play", "Benched", "Not Selected / Bye Week", "Injured" or "Eliminated" for the
// round being played, and is kept up to date until kickoff. The Wednesday team-list articles
// (lib/status/import.ts) set Starting / Bench first; this catches what changes after them, e.g. a
// starter pulled out on Friday and a replacement moved up.
//
// Pure rules here (planTeamChanges); fetching and saving are in lib/status/import.ts.
// Safety first, because the feed's exact wording can't be seen until the season starts:
// - a team is only looked at when the feed has a full team list for it (15 selected to play and
//   5-10 benched), so an old or half-updated feed changes nothing;
// - a player is only taken off the team list if the feed lists him as not playing (a player the
//   fantasy game doesn't have is left alone);
// - statuses Ethan set by hand are never changed;
// - anything it doesn't recognise is reported, not guessed.
import { statusKind } from "@/lib/status/kind";

export const FANTASY_PLAYERS_URL = "https://www.playfantasyrugby.com/json/fantasy/players.json";
export const FANTASY_ROUNDS_URL = "https://www.playfantasyrugby.com/json/fantasy/rounds.json";
export const FANTASY_SQUADS_URL = "https://www.playfantasyrugby.com/json/fantasy/squads.json";

export type FeedRole = "starting" | "bench" | "none";

/** The feed's status word -> a role; null if it isn't one we know. */
export function feedRole(status: unknown): FeedRole | null {
  const s = String(status ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!s) return null;
  if (/^not-?selected|^bye|^eliminated|^injur|^suspend|^unavailable|^out\b/.test(s)) return "none";
  if (/bench|^sub|substitute|replacement|reserve|interchange/.test(s)) return "bench";
  if (/^(available|selected|starting|start|starter|playing|named|confirmed)/.test(s)) return "starting";
  return null;
}

/** One of the feed's players for a team, matched to the site's player where possible. */
export type FeedEntry = { playerId: string | null; name: string; role: FeedRole };
/** The site's current status for a player this week. */
export type OurStatus = { status: string; source: string };

export type FeedChange =
  | { kind: "set"; playerId: string; status: string; was: string | null }
  | { kind: "clear"; playerId: string; was: string };

export type TeamPlan = {
  /** the feed has a full team list for this team */
  ready: boolean;
  starters: number;
  bench: number;
  changes: FeedChange[];
  /** names on the feed's team list that don't match a player on the site */
  unmatched: Array<{ name: string; role: "starting" | "bench" }>;
};

const jerseyOf = (status: string | null | undefined): number | null => {
  const m = String(status ?? "").match(/#\s*(\d{1,2})/);
  return m ? Number(m[1]) : null;
};
const ourRole = (s: OurStatus | undefined): FeedRole => {
  const k = statusKind(s?.status);
  return k === "starting" || k === "bench" ? k : "none";
};

/**
 * What to change for one team so its Starting / Bench statuses match the feed.
 * ours: the site's statuses this week for the team's players (players with none are left out).
 */
export function planTeamChanges(feed: FeedEntry[], ours: Map<string, OurStatus>): TeamPlan {
  const starters = feed.filter((e) => e.role === "starting").length;
  const bench = feed.filter((e) => e.role === "bench").length;
  const plan: TeamPlan = { ready: starters === 15 && bench >= 5 && bench <= 10, starters, bench, changes: [], unmatched: [] };
  if (!plan.ready) return plan;

  const feedById = new Map<string, FeedRole>();
  for (const e of feed) {
    if (e.playerId) feedById.set(e.playerId, e.role);
    else if (e.role !== "none") plan.unmatched.push({ name: e.name, role: e.role });
  }
  const manual = (id: string) => ours.get(id)?.source === "manual";

  // Moves between roles (Ethan's own statuses stay as they are)
  const moves: Array<{ id: string; from: FeedRole; to: FeedRole }> = [];
  for (const [id, to] of feedById) {
    if (manual(id)) continue;
    const from = ourRole(ours.get(id));
    if (from !== to) moves.push({ id, from, to });
  }

  // A one-for-one swap keeps the jersey: the player moved up to the XV wears the number of the
  // starter he replaced (same for the bench). Anything more tangled goes without a number.
  const jerseyFor = (role: "starting" | "bench"): number | null => {
    const leaving = moves.filter((m) => m.from === role);
    const joining = moves.filter((m) => m.to === role);
    if (leaving.length !== 1 || joining.length !== 1) return null;
    return jerseyOf(ours.get(leaving[0].id)?.status);
  };
  const jersey = { starting: jerseyFor("starting"), bench: jerseyFor("bench") };

  for (const m of moves) {
    const was = ours.get(m.id)?.status ?? null;
    if (m.to === "none") {
      if (was) plan.changes.push({ kind: "clear", playerId: m.id, was });
      continue;
    }
    const base = m.to === "starting" ? "Starting" : "Bench";
    const n = jersey[m.to];
    plan.changes.push({ kind: "set", playerId: m.id, status: n ? `${base} - #${n}` : base, was });
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Fetching (server only)

export type RawFeedPlayer = { id: number; squadId: number; firstName: string; lastName: string; status: string };
export type FantasyFeed = {
  /** the round the fantasy game is on (the first one not completed) */
  round: number | null;
  players: RawFeedPlayer[];
  /** squad id -> team name, e.g. 3 -> "NSW Waratahs" */
  squads: Map<number, string>;
};

export async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function fetchFantasyFeed(): Promise<FantasyFeed> {
  const [players, rounds, squads] = (await Promise.all([getJson(FANTASY_PLAYERS_URL), getJson(FANTASY_ROUNDS_URL), getJson(FANTASY_SQUADS_URL)])) as [
    RawFeedPlayer[],
    Array<{ number?: number; id?: number; status?: string }>,
    Array<{ id: number; name: string }>,
  ];
  const current = (Array.isArray(rounds) ? rounds : []).find((r) => String(r?.status ?? "").toLowerCase() !== "completed");
  return {
    round: current ? Number(current.number ?? current.id) || null : null,
    players: Array.isArray(players) ? players : [],
    squads: new Map((Array.isArray(squads) ? squads : []).map((s) => [Number(s.id), String(s.name)])),
  };
}
