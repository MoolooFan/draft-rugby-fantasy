// scripts/migrate-player-ids.ts
// One-off (plan item F1): switch every player id to the new clean style (lib/players/ids.ts),
// e.g. "D.McKenzie" -> "mckenda01", everywhere an id is stored: players, stats, photos,
// weekly statuses, and any league data (draft picks and queues, rosters incl. IR, lineups,
// results, waivers, free agency, trades, drop locks).
//
// Without --apply it only shows what it would change. Safe to run again: ids that are already
// new stay as they are.
//
// Run (from super-rugby-draft-web): npx tsx scripts/migrate-player-ids.ts            (dry run)
//                                   npx tsx scripts/migrate-player-ids.ts --apply
// Real project: add --live (it then says what to add to confirm).
import { scriptDb } from "./lib/db";
import { assignPlayerIds, type IdPlayer } from "../lib/players/ids";

const APPLY = process.argv.includes("--apply");
const { db } = scriptDb();

async function all<T>(table: string, select: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function main() {
  const players = await all<{ season: number; id: string; first_name: string; last_name: string; external_id: number | null; draft_rank: number | null }>(
    "players",
    "season, id, first_name, last_name, external_id, draft_rank"
  );
  const input: IdPlayer[] = players.map((p) => ({
    season: p.season,
    oldId: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    externalId: p.external_id,
    draftRank: p.draft_rank,
  }));
  const bySeason = assignPlayerIds(input);

  // old id (any case) -> new id, across seasons (the same old id must mean the same player)
  const map = new Map<string, string>();
  const conflicts: string[] = [];
  for (const p of players) {
    const next = bySeason.get(`${p.season}|${p.id.toLowerCase()}`)!;
    const prev = map.get(p.id.toLowerCase());
    if (prev && prev !== next) conflicts.push(`${p.id}: ${prev} / ${next}`);
    map.set(p.id.toLowerCase(), next);
  }
  if (conflicts.length) throw new Error(`The same old id is two different players in different seasons:\n${conflicts.join("\n")}`);

  const to = (x: unknown) => (typeof x === "string" ? map.get(x.toLowerCase()) ?? x : x);
  const changed = [...map].filter(([o, n]) => o !== n).length;
  console.log(`${players.length} player rows, ${map.size} players, ${changed} ids to change. Examples:`);
  for (const [o, n] of [...map].slice(0, 6)) console.log(`  ${o} -> ${n}`);

  const counts: Record<string, number> = {};
  const note = (t: string, n = 1) => (counts[t] = (counts[t] ?? 0) + n);

  async function update(table: string, match: Record<string, unknown>, patch: Record<string, unknown>) {
    note(table);
    if (!APPLY) return;
    let q = db.from(table).update(patch);
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
    const { error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  // --- players
  for (const p of players) {
    const n = to(p.id);
    if (n !== p.id) await update("players", { season: p.season, id: p.id }, { id: n });
  }

  // --- simple id columns
  const simple: Array<[string, string, string[]]> = [
    ["player_round_stats", "id", ["internal_player_id"]],
    ["player_images", "internal_player_id", ["internal_player_id"]],
    ["status_import_flags", "id", ["suggestion_player_id"]],
    ["drop_locks", "id", ["player_id"]],
    ["waiver_claims", "id", ["add_player_id", "drop_player_id"]],
    ["free_agent_transfers", "id", ["add_player_id", "drop_player_id"]],
    ["draft_picks", "id", ["player_id"]],
  ];
  for (const [table, key, cols] of simple) {
    const rows = await all<Record<string, unknown>>(table, [...new Set([key, ...cols])].join(", "));
    for (const r of rows) {
      const patch: Record<string, unknown> = {};
      for (const c of cols) if (r[c] != null && to(r[c]) !== r[c]) patch[c] = to(r[c]);
      if (Object.keys(patch).length) await update(table, { [key]: r[key] }, patch);
    }
  }

  // player_week_status / draft_queue: the id is part of the primary key
  for (const r of await all<{ season: number; week: number; player_id: string }>("player_week_status", "season, week, player_id")) {
    if (to(r.player_id) !== r.player_id) await update("player_week_status", r, { player_id: to(r.player_id) });
  }
  for (const r of await all<{ league_id: string; team_id: string; player_id: string }>("draft_queue", "league_id, team_id, player_id")) {
    if (to(r.player_id) !== r.player_id) await update("draft_queue", r, { player_id: to(r.player_id) });
  }

  // --- trades (arrays)
  for (const r of await all<{ id: string; offer_player_ids: string[]; request_player_ids: string[] }>("trade_offers", "id, offer_player_ids, request_player_ids")) {
    const offer = (r.offer_player_ids ?? []).map((x) => to(x) as string);
    const request = (r.request_player_ids ?? []).map((x) => to(x) as string);
    if (JSON.stringify(offer) !== JSON.stringify(r.offer_player_ids) || JSON.stringify(request) !== JSON.stringify(r.request_player_ids)) {
      await update("trade_offers", { id: r.id }, { offer_player_ids: offer, request_player_ids: request });
    }
  }

  // --- JSON: rosters, lineups, results
  const lineup = (l: unknown) => {
    if (!l || typeof l !== "object") return l;
    const out: Record<string, unknown> = {};
    for (const [slot, p] of Object.entries(l as Record<string, unknown>)) {
      out[slot] = p && typeof p === "object" && "id" in (p as object) ? { ...(p as object), id: to((p as { id: unknown }).id) } : p;
    }
    return out;
  };
  const keys = (o: unknown) =>
    o && typeof o === "object" ? Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [to(k) as string, v])) : o;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  for (const r of await all<{ league_id: string; team_id: string; data: Record<string, unknown> | null }>("rosters", "league_id, team_id, data")) {
    const d = r.data ?? {};
    const next = {
      ...d,
      ...(Array.isArray(d.playerIds) ? { playerIds: (d.playerIds as unknown[]).map(to) } : {}),
      ...(Array.isArray(d.irIds) ? { irIds: (d.irIds as unknown[]).map(to) } : {}),
    };
    if (!same(next, d)) await update("rosters", { league_id: r.league_id, team_id: r.team_id }, { data: next });
  }
  for (const r of await all<{ league_id: string; week: number; team_id: string; lineup: unknown; captain_id: string | null; vice_id: string | null }>(
    "team_selections",
    "league_id, week, team_id, lineup, captain_id, vice_id"
  )) {
    const patch = { lineup: lineup(r.lineup), captain_id: to(r.captain_id), vice_id: to(r.vice_id) };
    if (!same(patch, { lineup: r.lineup, captain_id: r.captain_id, vice_id: r.vice_id })) {
      await update("team_selections", { league_id: r.league_id, week: r.week, team_id: r.team_id }, patch);
    }
  }
  for (const r of await all<Record<string, unknown>>(
    "team_week_results",
    "league_id, week, team_id, picked_lineup, final_lineup, player_points, picked_captain_id, picked_vice_id, captain_used_id"
  )) {
    const patch = {
      picked_lineup: lineup(r.picked_lineup),
      final_lineup: lineup(r.final_lineup),
      player_points: keys(r.player_points),
      picked_captain_id: to(r.picked_captain_id),
      picked_vice_id: to(r.picked_vice_id),
      captain_used_id: to(r.captain_used_id),
    };
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, r[k]]));
    if (!same(patch, before)) await update("team_week_results", { league_id: r.league_id, week: r.week, team_id: r.team_id }, patch);
  }

  console.log(APPLY ? "Changed:" : "Would change (run again with --apply to do it):", counts);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

