// lib/league/reverse.ts
// The commissioner reverses a trade, waiver claim or free agent move that has already gone through
// (Ethan, 23 Nov 2026), usually after the rest of the league disputes it. Moves go through as
// normal; this undoes one afterwards:
// - Trade: every player goes back to the team he came from.
// - Waiver claim / free agent move: the player added goes back to the pool (locked for 24 hours,
//   like any drop, so he can't be picked straight back up) and the player dropped comes back.
// It only works while everything is still where the move left it: a player since dropped, traded
// on, moved to IR, or (for a dropped player) signed by another team stops it, and it says why.
// Both teams must still keep the position rules. Weeks already locked keep their lineups and
// points (only weeks not locked yet change, like any roster change). Drops made to bring a player
// back from IR can't be reversed.
// Time limit (Ethan, 23 Nov 2026): 24 hours after the move, or until the first game of the next
// round kicks off, whichever comes first. The commissioner does it from the Commissioner section at
// the bottom of the Transactions tab (listReversible), so the page looks normal for everyone else.
import type { SupabaseClient } from "@supabase/supabase-js";
import { activeIdsOf, irIdsOf, ownedIdsOf } from "@/lib/league/ir";
import { planMoveReversal, planTradeReversal, reversibleUntilMs, REVERSE_LOCK_MS, REVERSE_WINDOW_MS } from "@/lib/league/reversePlan";
import { getSeason, SEASONS, totalFantasyWeeks, weekFirstKickoffMs } from "@/lib/season";
import { loadRosterPlayers, rosterProblem, updateLineupsAfterRosterChange } from "@/lib/league/rosterChange";
import { loadSquadFormat } from "@/lib/league/squadServer";
import { cancelInvalidPendingTradesForTeams, cancelPendingTradesTouchingPlayers } from "@/lib/trades/cancelPendingTrades";
import { postMessage } from "@/lib/chat/server";
import { LEAGUE_CHANNEL } from "@/lib/chat/common";

type Db = SupabaseClient;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RosterData = any;

export type ReverseKind = "trade" | "claim" | "transfer";

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

/** Every round's first kickoff in a season (ms). */
function roundKickoffs(season: number): number[] {
  if (!SEASONS[season]) return [];
  const s = getSeason(season);
  return Array.from({ length: totalFantasyWeeks(s) }, (_, i) => weekFirstKickoffMs(s, i + 1)).filter(Number.isFinite);
}

type MoveRow = { status: string; accepted_at?: string | null; updated_at?: string | null; processed_at_ms?: number | null; updated_at_ms?: number | null; created_at_ms?: number | null };

/** When a move went through (ms). */
function madeAtMs(kind: ReverseKind, r: MoveRow): number {
  if (kind === "trade") return Date.parse(String(r.accepted_at ?? r.updated_at ?? "")) || 0;
  if (kind === "claim") return Number(r.processed_at_ms ?? r.updated_at_ms) || 0;
  return Number(r.created_at_ms) || 0;
}

const TOO_LATE = "Too late to reverse: moves can only be reversed for 24 hours, and not once the next round has kicked off.";

export type ReversibleMove = {
  kind: ReverseKind;
  id: string;
  atMs: number;
  untilMs: number;
  teamIds: string[];
  /** e.g. "Josh's Team ⇄ Will's Team" or "Josh's Team" */
  title: string;
  /** e.g. "Josh's Team gets D. McKenzie; Will's Team gets B. Donaldson" or "+ D. McKenzie, − B. Donaldson" */
  detail: string;
};

/** The moves the commissioner can still reverse, newest first (commissioner only). */
export async function listReversible(db: Db, p: { leagueId: string; username: string; nowMs?: number }): Promise<{ ok: true; moves: ReversibleMove[] } | { ok: false; error: string; status: number }> {
  const now = p.nowMs ?? Date.now();
  const league = await q<{ created_by: string | null; season: number } | null>(db.from("leagues").select("created_by, season").eq("id", p.leagueId).maybeSingle());
  if (!league) return { ok: false, error: "League not found", status: 404 };
  if (String(league.created_by ?? "").trim().toLowerCase() !== p.username.trim().toLowerCase()) return { ok: false, error: "Only the commissioner can reverse moves", status: 403 };
  const kickoffs = roundKickoffs(Number(league.season));
  const since = now - REVERSE_WINDOW_MS;
  const [trades, claims, transfers, teams] = await Promise.all([
    q<Array<MoveRow & { id: string; from_team_id: string; to_team_id: string; offer_player_ids: string[]; request_player_ids: string[] }>>(
      db.from("trade_offers").select("id, status, accepted_at, updated_at, from_team_id, to_team_id, offer_player_ids, request_player_ids").eq("league_id", p.leagueId).eq("status", "accepted").gte("updated_at", new Date(since).toISOString())
    ),
    q<Array<MoveRow & { id: string; team_id: string; add_player_id: string; drop_player_id: string | null }>>(
      db.from("waiver_claims").select("id, status, processed_at_ms, updated_at_ms, team_id, add_player_id, drop_player_id").eq("league_id", p.leagueId).eq("status", "PROCESSED").gte("updated_at_ms", since)
    ),
    q<Array<MoveRow & { id: string; team_id: string; add_player_id: string | null; drop_player_id: string | null }>>(
      db.from("free_agent_transfers").select("id, status, created_at_ms, team_id, add_player_id, drop_player_id").eq("league_id", p.leagueId).eq("status", "PROCESSED").gte("created_at_ms", since).not("add_player_id", "is", null)
    ),
    q<Array<{ id: string; name: string }>>(db.from("teams").select("id, name").eq("league_id", p.leagueId)),
  ]);
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "A team";
  const ids = [...trades.flatMap((t) => [...(t.offer_player_ids ?? []), ...(t.request_player_ids ?? [])]), ...[...claims, ...transfers].flatMap((m) => [m.add_player_id, m.drop_player_id])].filter((x): x is string => !!x);
  const players = await loadRosterPlayers(db, Number(league.season), ids);
  const short = (id: string) => {
    const pl = players.get(id);
    return pl ? `${String(pl.firstName ?? "").slice(0, 1)}. ${pl.lastName}` : id;
  };
  const out: ReversibleMove[] = [];
  const add = (kind: ReverseKind, r: MoveRow & { id: string }, m: Omit<ReversibleMove, "kind" | "id" | "atMs" | "untilMs">) => {
    const atMs = madeAtMs(kind, r);
    const untilMs = reversibleUntilMs(atMs, kickoffs);
    if (atMs && atMs <= now && now < untilMs) out.push({ kind, id: r.id, atMs, untilMs, ...m });
  };
  for (const t of trades) {
    add("trade", t, {
      teamIds: [t.from_team_id, t.to_team_id],
      title: `${teamName(t.from_team_id)} ⇄ ${teamName(t.to_team_id)}`,
      detail: `${teamName(t.from_team_id)} got ${(t.request_player_ids ?? []).map(short).join(", ")}; ${teamName(t.to_team_id)} got ${(t.offer_player_ids ?? []).map(short).join(", ")}`,
    });
  }
  for (const [kind, rows] of [["claim", claims], ["transfer", transfers]] as const) {
    for (const m of rows) {
      add(kind, m, {
        teamIds: [m.team_id],
        title: `${teamName(m.team_id)} · ${kind === "claim" ? "Waiver claim" : "Free agent"}`,
        detail: `IN: ${short(m.add_player_id!)}${m.drop_player_id ? ` · OUT: ${short(m.drop_player_id)}` : ""}`,
      });
    }
  }
  return { ok: true, moves: out.sort((a, b) => b.atMs - a.atMs) };
}

/** Reverse one move. Checks the commissioner first. Returns a message for the league chat / page. */
export async function reverseMove(db: Db, p: { leagueId: string; username: string; kind: ReverseKind; id: string; nowMs?: number }): Promise<{ ok: true; message: string } | { ok: false; error: string; status: number }> {
  const now = p.nowMs ?? Date.now();
  const league = await q<{ created_by: string | null; season: number } | null>(db.from("leagues").select("created_by, season").eq("id", p.leagueId).maybeSingle());
  if (!league) return { ok: false, error: "League not found", status: 404 };
  if (String(league.created_by ?? "").trim().toLowerCase() !== p.username.trim().toLowerCase()) {
    return { ok: false, error: "Only the commissioner can reverse moves", status: 403 };
  }

  // the move
  type Trade = { id: string; league_id: string; from_team_id: string; to_team_id: string; offer_player_ids: string[]; request_player_ids: string[]; status: string; accepted_at: string | null; updated_at: string };
  type Move = { id: string; league_id: string; team_id: string; add_player_id: string | null; drop_player_id: string | null; status: string };
  const table = p.kind === "trade" ? "trade_offers" : p.kind === "claim" ? "waiver_claims" : "free_agent_transfers";
  const row = await q<Trade | Move | null>(db.from(table).select("*").eq("id", p.id).eq("league_id", p.leagueId).maybeSingle());
  if (!row) return { ok: false, error: "That move wasn't found", status: 404 };
  const status = String(row.status).toLowerCase();
  if (status === "reversed") return { ok: false, error: "That's already been reversed", status: 400 };
  if (status !== (p.kind === "trade" ? "accepted" : "processed")) return { ok: false, error: "Only moves that went through can be reversed", status: 400 };
  if (now >= reversibleUntilMs(madeAtMs(p.kind, row as MoveRow), roundKickoffs(Number(league.season)))) return { ok: false, error: TOO_LATE, status: 400 };

  // everyone's rosters (a dropped player may have been signed by anyone), names for messages
  const rosterRows = await q<Array<{ team_id: string; data: RosterData }>>(db.from("rosters").select("team_id, data").eq("league_id", p.leagueId));
  const rosters = new Map(rosterRows.map((r) => [String(r.team_id), r.data ?? {}]));
  const teams = await q<Array<{ id: string; name: string }>>(db.from("teams").select("id, name").eq("league_id", p.leagueId));
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "a team";
  const t = p.kind === "trade" ? (row as Trade) : null;
  const m = p.kind === "trade" ? null : (row as Move);
  const ids = t ? [...(t.offer_player_ids ?? []), ...(t.request_player_ids ?? [])] : [m!.add_player_id, m!.drop_player_id].filter((x): x is string => !!x);
  const players = await loadRosterPlayers(db, Number(league.season), [...ids, ...[...rosters.values()].flatMap((d) => ownedIdsOf(d))]);
  const name = (id: string) => {
    const pl = players.get(id);
    return pl ? `${pl.firstName} ${pl.lastName}` : id;
  };

  const plan = t
    ? planTradeReversal({ fromTeamId: t.from_team_id, toTeamId: t.to_team_id, offerIds: t.offer_player_ids ?? [], requestIds: t.request_player_ids ?? [] }, rosters, name, teamName)
    : planMoveReversal({ teamId: m!.team_id, addId: m!.add_player_id, dropId: m!.drop_player_id }, rosters, name, teamName);
  if (!plan.ok) return { ok: false, error: plan.error, status: 400 };

  // the position rules for every changed team
  const format = await loadSquadFormat(db, p.leagueId);
  for (const [teamId, nextIds] of plan.next) {
    const problem = rosterProblem(nextIds, players, activeIdsOf(rosters.get(teamId)), format);
    if (problem) return { ok: false, error: `${teamName(teamId)}: ${problem}, so this can't be reversed.`, status: 400 };
  }

  // mark it first (so it can't be reversed twice at once), then move the players
  const nowIso = new Date(now).toISOString();
  const marked = t
    ? await q<Array<{ id: string }>>(db.from("trade_offers").update({ status: "reversed", reversed_at: nowIso, reversed_by: p.username, accepted_at: t.accepted_at ?? t.updated_at }).eq("id", t.id).eq("status", t.status).select("id"))
    : await q<Array<{ id: string }>>(db.from(table).update({ status: "REVERSED", reversed_at_ms: now, reversed_by: p.username, updated_at_ms: now }).eq("id", m!.id).eq("status", m!.status).select("id"));
  if (!marked.length) return { ok: false, error: "That move changed just now; refresh and try again", status: 409 };

  for (const [teamId, nextIds] of plan.next) {
    const data = rosters.get(teamId) ?? {};
    await q(db.from("rosters").update({ data: { ...data, playerIds: nextIds, irIds: irIdsOf(data) }, updated_at: nowIso }).eq("league_id", p.leagueId).eq("team_id", teamId).select("team_id"));
  }

  // drop locks: the player given back is free to play for his team; the one taken away is locked
  if (plan.unlock.length) await q(db.from("drop_locks").delete().eq("league_id", p.leagueId).in("player_id", plan.unlock).select("player_id"));
  for (const id of plan.lock) {
    await q(db.from("drop_locks").delete().eq("league_id", p.leagueId).eq("player_id", id).select("player_id"));
    await q(db.from("drop_locks").insert({ league_id: p.leagueId, week: (row as { week?: number }).week ?? 0, player_id: id, locked_until_ms: now + REVERSE_LOCK_MS, dropped_by_team_id: m?.team_id ?? null, dropped_at_ms: now, reason: "REVERSED_BY_COMMISSIONER" }).select("player_id"));
  }

  try {
    await updateLineupsAfterRosterChange(db, p.leagueId, plan.next, now);
  } catch (e) {
    console.error("[reverse] lineup update failed:", e);
  }
  await cancelPendingTradesTouchingPlayers({ leagueId: p.leagueId, playerIds: plan.moved, reason: "PLAYER_MOVED_BY_COMMISSIONER_REVERSAL" });
  await cancelInvalidPendingTradesForTeams({ leagueId: p.leagueId, teamIds: [...plan.next.keys()], reason: "ROSTER_CHANGED_BY_COMMISSIONER_REVERSAL" });

  const message = t
    ? `The commissioner reversed the trade between ${teamName(t.from_team_id)} and ${teamName(t.to_team_id)}: ${(t.offer_player_ids ?? []).map(name).join(", ")} back to ${teamName(t.from_team_id)}, ${(t.request_player_ids ?? []).map(name).join(", ")} back to ${teamName(t.to_team_id)}.`
    : `The commissioner reversed ${teamName(m!.team_id)}'s ${p.kind === "claim" ? "waiver claim" : "free agent move"}: ${name(m!.add_player_id!)} goes back to the player pool${m!.drop_player_id ? `, ${name(m!.drop_player_id)} back to ${teamName(m!.team_id)}` : ""}.`;
  try {
    await postMessage(db, { leagueId: p.leagueId, channel: LEAGUE_CHANNEL, senderTeamId: null, kind: "system", body: message, meta: { reversed: { kind: p.kind, id: p.id } }, dedupeKey: `reversed:${p.kind}:${p.id}` });
  } catch (e) {
    console.error("[reverse] chat post failed:", e);
  }
  return { ok: true, message };
}
