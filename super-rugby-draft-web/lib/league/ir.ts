// lib/league/ir.ts
// Injury reserve (IR), agreed with Ethan (Nov 2026):
// - One IR spot per team. Stored in rosters.data.irIds (playerIds = the rest of the team).
// - An IR player doesn't count towards the 20 or the position rules, isn't in any lineup and
//   doesn't score. He's still owned (nobody else can add or claim him) but can't be traded.
// - Only injured players, or players out for other reasons (personal reasons, etc.), can go in
//   IR - not Suspended / Starting / Sub / not named. Nobody is added straight into IR.
// - Moving a player to IR is allowed any time (a locked week's lineup doesn't change).
// - Once the IR player is healthy again, the team can't add, claim or trade (propose or accept)
//   until he's activated. Lineups and declining trades are still fine.
// - Activating: drop a player in the same move (no drop needed if the team has a free place),
//   or swap him with another injured player.
// - IR moves aren't listed in the Transactions tab.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROSTER_SIZE } from "@/lib/draft/rules";
import { rosterProblem, type RosterPlayer } from "@/lib/league/rosterChange";
import { currentStatusWeek, statusKind } from "@/lib/status/kind";

export const IR_SPOTS = 1;

/** rosters.data (old rows may have other shapes, so everything is optional). */
type RosterData = { playerIds?: unknown; irIds?: unknown } | null | undefined;

const ids = (x: unknown): string[] =>
  Array.isArray(x) ? [...new Set(x.map((v) => String(v ?? "").trim()).filter(Boolean))] : [];

/** The team's players in IR (from rosters.data). */
export function irIdsOf(data: RosterData): string[] {
  return ids(data?.irIds);
}

/** The team's players not in IR (from rosters.data). */
export function activeIdsOf(data: RosterData): string[] {
  const ir = new Set(irIdsOf(data));
  return ids(data?.playerIds).filter((id) => !ir.has(id));
}

/** Everyone the team owns, IR included (for "is this player taken?"). */
export function ownedIdsOf(data: RosterData): string[] {
  return [...new Set([...ids(data?.playerIds), ...irIdsOf(data)])];
}

/** Can a player with this status go in IR? Injured, or out for another reason. */
export function irEligible(status: string | null | undefined): boolean {
  const k = statusKind(status);
  return k === "injured" || k === "out";
}

export type IrAction =
  | { action: "move"; playerId: string } // active -> IR
  | { action: "activate"; playerId: string; dropPlayerId?: string | null } // IR -> active (dropping someone if full)
  | { action: "swap"; playerId: string; swapPlayerId: string }; // IR player <-> another injured player

export type IrResult =
  | { ok: true; active: string[]; ir: string[]; dropped: string | null; toIr: string | null; fromIr: string | null }
  | { ok: false; error: string };

const nameOf = (players: Map<string, RosterPlayer>, id: string) => {
  const p = players.get(id);
  return p ? `${p.firstName} ${p.lastName}` : id;
};

/**
 * The roster after an IR move, or why it isn't allowed.
 * statusOf(id): the player's status right now (this week's team list / injury list, else his card).
 */
export function applyIrAction(
  input: { active: string[]; ir: string[] },
  a: IrAction,
  players: Map<string, RosterPlayer>,
  statusOf: (id: string) => string | null
): IrResult {
  const active = [...input.active];
  const ir = [...input.ir];
  const notEligible = (id: string) =>
    `Only injured players (or players out for reasons like personal leave) can go in IR - ${nameOf(players, id)} isn't`;

  if (a.action === "move") {
    if (!active.includes(a.playerId)) return { ok: false, error: "That player isn't in your team" };
    if (ir.length >= IR_SPOTS) return { ok: false, error: "Your IR spot is already taken" };
    if (!irEligible(statusOf(a.playerId))) return { ok: false, error: notEligible(a.playerId) };
    return {
      ok: true,
      active: active.filter((id) => id !== a.playerId),
      ir: [...ir, a.playerId],
      dropped: null,
      toIr: a.playerId,
      fromIr: null,
    };
  }

  if (!ir.includes(a.playerId)) return { ok: false, error: "That player isn't in your IR spot" };
  const restIr = ir.filter((id) => id !== a.playerId);

  if (a.action === "activate") {
    const drop = a.dropPlayerId ? String(a.dropPlayerId) : null;
    if (drop && !active.includes(drop)) return { ok: false, error: "The player to drop isn't in your team" };
    const next = [...active.filter((id) => id !== drop), a.playerId];
    if (next.length > ROSTER_SIZE) {
      return { ok: false, error: `Your team is full - choose a player to drop to make room for ${nameOf(players, a.playerId)}` };
    }
    const problem = rosterProblem(next, players, active);
    if (problem) return { ok: false, error: problem };
    return { ok: true, active: next, ir: restIr, dropped: drop, toIr: null, fromIr: a.playerId };
  }

  // swap
  if (!active.includes(a.swapPlayerId)) return { ok: false, error: "That player isn't in your team" };
  if (!irEligible(statusOf(a.swapPlayerId))) return { ok: false, error: notEligible(a.swapPlayerId) };
  const next = [...active.filter((id) => id !== a.swapPlayerId), a.playerId];
  const problem = rosterProblem(next, players, active);
  if (problem) return { ok: false, error: problem };
  return { ok: true, active: next, ir: [...restIr, a.swapPlayerId], dropped: null, toIr: a.swapPlayerId, fromIr: a.playerId };
}

/** The IR player who is healthy again (so must be activated before adds / claims / trades), if any. */
export function healthyIrPlayerId(ir: string[], statusOf: (id: string) => string | null): string | null {
  return ir.find((id) => !irEligible(statusOf(id))) ?? null;
}

export function healthyIrMessage(name: string, mine = true): string {
  return mine
    ? `${name} is fit again - activate him from your IR spot (Team Selection) before making adds, claims or trades`
    : `The other team has to activate ${name} from their IR spot before they can trade`;
}

// ---------------------------------------------------------------------------
// Database helpers (server only)

/** Players' statuses right now: this week's (team list / injury list), else their card status. */
export async function loadCurrentStatuses(
  db: SupabaseClient,
  season: number,
  playerIds: string[],
  nowMs: number = Date.now()
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(playerIds.filter(Boolean))];
  if (!unique.length) return out;
  const week = currentStatusWeek(season, nowMs);
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const [cards, weekly] = await Promise.all([
      db.from("players").select("id, status").eq("season", season).in("id", chunk),
      db.from("player_week_status").select("player_id, status").eq("season", season).eq("week", week).in("player_id", chunk),
    ]);
    if (cards.error) throw cards.error;
    if (weekly.error) throw weekly.error;
    for (const p of cards.data ?? []) {
      const s = String(p.status ?? "").trim();
      out.set(p.id, s && s !== "-" ? s : null);
    }
    for (const w of weekly.data ?? []) {
      const s = String(w.status ?? "").trim();
      if (s) out.set(w.player_id, s);
    }
  }
  return out;
}

/**
 * If this team's IR player is fit again, the message explaining why it can't add / claim /
 * trade; otherwise null.
 */
export async function healthyIrBlock(
  db: SupabaseClient,
  season: number,
  rosterData: RosterData,
  opts: { mine?: boolean; nowMs?: number } = {}
): Promise<string | null> {
  const ir = irIdsOf(rosterData);
  if (!ir.length) return null;
  const statuses = await loadCurrentStatuses(db, season, ir, opts.nowMs);
  const id = healthyIrPlayerId(ir, (x) => statuses.get(x) ?? null);
  if (!id) return null;
  const { data } = await db.from("players").select("first_name, last_name").eq("season", season).eq("id", id).maybeSingle();
  const name = data ? `${data.first_name} ${data.last_name}` : id;
  return healthyIrMessage(name, opts.mine ?? true);
}
