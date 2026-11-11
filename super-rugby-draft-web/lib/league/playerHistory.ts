// lib/league/playerHistory.ts
// A player's moves in one league, newest first (player card > Transactions tab, plan item C3):
// drafted (round and pick), added as a free agent (and who was dropped), dropped (e.g. to make
// room for a player coming back from IR), claimed on waivers, traded. Moves in and out of IR
// aren't listed. Pure code: the route (app/api/players/history) loads the rows.

export type HistoryEvent =
  | { kind: "drafted"; atMs: number; teamId: string; round: number; pick: number }
  | { kind: "added"; atMs: number; teamId: string; droppedId: string | null }
  | { kind: "dropped"; atMs: number; teamId: string; forId: string | null }
  | { kind: "claimed"; atMs: number; teamId: string; droppedId: string | null }
  | { kind: "traded"; atMs: number; fromTeamId: string; toTeamId: string };

type Pick = { team_id: string; pick_number: number; round: number; created_at: string | null };
type Transfer = { team_id: string; add_player_id: string | null; drop_player_id: string | null; status: string; created_at_ms: number | null };
type Claim = { team_id: string; add_player_id: string; drop_player_id: string | null; status: string; processed_at_ms: number | null; updated_at_ms: number | null };
type Trade = { from_team_id: string; to_team_id: string; offer_player_ids: string[] | null; request_player_ids: string[] | null; status: string; updated_at: string | null };

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

export function playerHistory(
  playerId: string,
  rows: { picks: Pick[]; transfers: Transfer[]; claims: Claim[]; trades: Trade[] }
): HistoryEvent[] {
  const out: HistoryEvent[] = [];
  for (const p of rows.picks) out.push({ kind: "drafted", atMs: ms(p.created_at), teamId: p.team_id, round: p.round, pick: p.pick_number });

  for (const t of rows.transfers) {
    if (String(t.status).toUpperCase() !== "PROCESSED") continue;
    const at = Number(t.created_at_ms) || 0;
    if (t.add_player_id === playerId) out.push({ kind: "added", atMs: at, teamId: t.team_id, droppedId: t.drop_player_id });
    else if (t.drop_player_id === playerId) out.push({ kind: "dropped", atMs: at, teamId: t.team_id, forId: t.add_player_id });
  }

  for (const c of rows.claims) {
    if (String(c.status).toUpperCase() !== "PROCESSED") continue;
    const at = Number(c.processed_at_ms ?? c.updated_at_ms) || 0;
    if (c.add_player_id === playerId) out.push({ kind: "claimed", atMs: at, teamId: c.team_id, droppedId: c.drop_player_id });
    else if (c.drop_player_id === playerId) out.push({ kind: "dropped", atMs: at, teamId: c.team_id, forId: c.add_player_id });
  }

  for (const t of rows.trades) {
    if (String(t.status).toLowerCase() !== "accepted") continue;
    const at = ms(t.updated_at);
    if ((t.offer_player_ids ?? []).includes(playerId)) out.push({ kind: "traded", atMs: at, fromTeamId: t.from_team_id, toTeamId: t.to_team_id });
    else if ((t.request_player_ids ?? []).includes(playerId)) out.push({ kind: "traded", atMs: at, fromTeamId: t.to_team_id, toTeamId: t.from_team_id });
  }

  return out.sort((a, b) => b.atMs - a.atMs);
}
