// lib/league/reversePlan.ts
// Pure part of the commissioner's reversals (lib/league/reverse.ts): the rosters after reversing a
// trade, waiver claim or free agent move, or why it can't be done. No database.
import { activeIdsOf, irIdsOf, ownedIdsOf } from "@/lib/league/ir";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RosterData = any;

/** A drop after a reversal: the player added goes back to the pool, locked for a day. */
export const REVERSE_LOCK_MS = 24 * 60 * 60 * 1000;

export type Plan =
  | { ok: false; error: string }
  | { ok: true; next: Map<string, string[]>; moved: string[]; unlock: string[]; lock: string[] };

/**
 * Pure: the rosters after reversing a trade. fromTeam gave offerIds and got requestIds.
 * rosters: team id -> rosters.data. name: a player's name for messages.
 */
export function planTradeReversal(
  t: { fromTeamId: string; toTeamId: string; offerIds: string[]; requestIds: string[] },
  rosters: Map<string, RosterData>,
  name: (id: string) => string,
  teamName: (id: string) => string
): Plan {
  const from = rosters.get(t.fromTeamId), to = rosters.get(t.toTeamId);
  if (!from || !to) return { ok: false, error: "One of the teams' rosters wasn't found" };
  const fromActive = activeIdsOf(from), toActive = activeIdsOf(to);
  const check = (ids: string[], data: RosterData, active: string[], teamId: string): string | null => {
    for (const id of ids) {
      if (irIdsOf(data).includes(id)) return `${name(id)} is in ${teamName(teamId)}'s IR spot now, so this trade can't be reversed until he's activated.`;
      if (!active.includes(id)) return `${name(id)} isn't on ${teamName(teamId)} any more (dropped or traded since), so this trade can't be reversed.`;
    }
    return null;
  };
  const problem = check(t.requestIds, from, fromActive, t.fromTeamId) ?? check(t.offerIds, to, toActive, t.toTeamId);
  if (problem) return { ok: false, error: problem };
  const next = new Map<string, string[]>([
    [t.fromTeamId, [...fromActive.filter((id) => !t.requestIds.includes(id)), ...t.offerIds]],
    [t.toTeamId, [...toActive.filter((id) => !t.offerIds.includes(id)), ...t.requestIds]],
  ]);
  return { ok: true, next, moved: [...t.offerIds, ...t.requestIds], unlock: [], lock: [] };
}

/** Pure: the roster after reversing a waiver claim or free agent move (add, and maybe a drop). */
export function planMoveReversal(
  m: { teamId: string; addId: string | null; dropId: string | null },
  rosters: Map<string, RosterData>,
  name: (id: string) => string,
  teamName: (id: string) => string
): Plan {
  if (!m.addId) return { ok: false, error: "A drop made to bring a player back from IR can't be reversed." };
  const mine = rosters.get(m.teamId);
  if (!mine) return { ok: false, error: "The team's roster wasn't found" };
  if (irIdsOf(mine).includes(m.addId)) return { ok: false, error: `${name(m.addId)} is in ${teamName(m.teamId)}'s IR spot now, so this can't be reversed until he's activated.` };
  const active = activeIdsOf(mine);
  if (!active.includes(m.addId)) return { ok: false, error: `${name(m.addId)} isn't on ${teamName(m.teamId)} any more (dropped or traded since), so this can't be reversed.` };
  if (m.dropId) {
    for (const [teamId, data] of rosters) {
      if (ownedIdsOf(data).includes(m.dropId)) {
        return { ok: false, error: teamId === m.teamId ? `${name(m.dropId)} is already back on ${teamName(teamId)}.` : `${name(m.dropId)} has since been signed by ${teamName(teamId)}, so he can't be given back.` };
      }
    }
  }
  const next = new Map([[m.teamId, [...active.filter((id) => id !== m.addId), ...(m.dropId ? [m.dropId] : [])]]]);
  return { ok: true, next, moved: [m.addId, ...(m.dropId ? [m.dropId] : [])], unlock: m.dropId ? [m.dropId] : [], lock: [m.addId] };
}


/** How long after a move the commissioner can reverse it (Ethan, 23 Nov 2026). */
export const REVERSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: until when a move made at atMs can be reversed: 24 hours, or until the first game of the
 * next round kicks off, whichever comes first. kickoffs: each round's first kickoff (ms).
 */
export function reversibleUntilMs(atMs: number, kickoffs: number[]): number {
  const next = kickoffs.filter((k) => Number.isFinite(k) && k > atMs).sort((a, b) => a - b)[0];
  return Math.min(atMs + REVERSE_WINDOW_MS, next ?? Infinity);
}
