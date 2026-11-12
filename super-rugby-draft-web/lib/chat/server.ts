// lib/chat/server.ts (server only)
// Writing chat messages, including the automated posts (weekly league recap, trades, waiver and
// free agent reports, the shield). Automated posts never stop the thing that triggered them: a
// failure is logged and ignored. Rules and text: lib/chat/common.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAGUE_CHANNEL, dmChannel, freeAgentReportText, leagueRecapText, shieldReportText, tradeText, waiverReportText, type ChatKind } from "@/lib/chat/common";
import { getSeason, SEASONS, weekLabel } from "@/lib/season";
import { weeklyAwards } from "@/lib/league/weeklyAwards";
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";
import { loadShield } from "@/lib/league/shieldServer";

export async function postMessage(
  db: SupabaseClient,
  m: { leagueId: string; channel: string; senderTeamId: string | null; kind: ChatKind; body?: string | null; imageUrl?: string | null; meta?: Record<string, unknown>; dedupeKey?: string | null }
): Promise<void> {
  const { error } = await db.from("chat_messages").insert({
    league_id: m.leagueId,
    channel: m.channel,
    sender_team_id: m.senderTeamId,
    kind: m.kind,
    body: m.body ?? null,
    image_url: m.imageUrl ?? null,
    meta: m.meta ?? {},
    dedupe_key: m.dedupeKey ?? null,
  });
  // the same automated post twice: the dedupe key stops it (that's fine)
  if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
}

/** An automated post that must never break the caller. */
async function safely(what: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[chat] ${what} failed:`, e);
  }
}

async function names(db: SupabaseClient, season: number, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await db.from("players").select("id, first_name, last_name").eq("season", season).in("id", unique.slice(i, i + 200));
    for (const p of data ?? []) out.set(p.id, `${p.first_name} ${p.last_name}`);
  }
  return out;
}

async function leagueBasics(db: SupabaseClient, leagueId: string) {
  const [{ data: lg }, { data: teams }] = await Promise.all([
    db.from("leagues").select("season").eq("id", leagueId).maybeSingle(),
    db.from("teams").select("id, name").eq("league_id", leagueId),
  ]);
  const season = Number(lg?.season);
  const teamName = (id: string | null | undefined) => (teams ?? []).find((t) => t.id === id)?.name ?? "A team";
  const roundName = (w: number) => (SEASONS[season] ? weekLabel(getSeason(season), w) : `Round ${w}`);
  return { season, teams: teams ?? [], teamName, roundName };
}

// ---- trades

/** A trade offer: a card in the two teams' direct messages. */
export async function postTradeOffer(db: SupabaseClient, t: { id: string; league_id: string; from_team_id: string; to_team_id: string; offer_player_ids: string[]; request_player_ids: string[]; note?: string | null }) {
  await safely("trade offer", async () => {
    const { season } = await leagueBasics(db, t.league_id);
    const n = await names(db, season, [...t.offer_player_ids, ...t.request_player_ids]);
    await postMessage(db, {
      leagueId: t.league_id,
      channel: dmChannel(t.from_team_id, t.to_team_id),
      senderTeamId: t.from_team_id,
      kind: "trade",
      body: t.note ?? null,
      meta: {
        tradeId: t.id,
        fromTeamId: t.from_team_id,
        toTeamId: t.to_team_id,
        offer: t.offer_player_ids.map((id) => ({ id, name: n.get(id) ?? id })),
        request: t.request_player_ids.map((id) => ({ id, name: n.get(id) ?? id })),
      },
      dedupeKey: `trade-offer:${t.id}`,
    });
  });
}

/** A trade answered: a note in the DM; accepted ones are also posted in the league chat. */
export async function postTradeResult(db: SupabaseClient, tradeId: string, result: "accepted" | "declined") {
  await safely("trade result", async () => {
    const { data: t } = await db.from("trade_offers").select("*").eq("id", tradeId).maybeSingle();
    if (!t) return;
    const { season, teamName } = await leagueBasics(db, t.league_id);
    await postMessage(db, {
      leagueId: t.league_id,
      channel: dmChannel(t.from_team_id, t.to_team_id),
      senderTeamId: null,
      kind: "system",
      body: result === "accepted" ? `${teamName(t.to_team_id)} accepted the trade.` : `${teamName(t.to_team_id)} declined the trade.`,
      meta: { tradeId },
      dedupeKey: `trade-${result}-dm:${tradeId}`,
    });
    if (result !== "accepted") return;
    const n = await names(db, season, [...(t.offer_player_ids ?? []), ...(t.request_player_ids ?? [])]);
    await postMessage(db, {
      leagueId: t.league_id,
      channel: LEAGUE_CHANNEL,
      senderTeamId: null,
      kind: "system",
      body: tradeText(
        { teamName: teamName(t.from_team_id), gets: (t.request_player_ids ?? []).map((id: string) => n.get(id) ?? id) },
        { teamName: teamName(t.to_team_id), gets: (t.offer_player_ids ?? []).map((id: string) => n.get(id) ?? id) }
      ),
      meta: { tradeId },
      dedupeKey: `trade-accepted:${tradeId}`,
    });
  });
}

// ---- waivers and free agents

export async function postWaiverReport(db: SupabaseClient, leagueId: string, week: number) {
  await safely("waiver report", async () => {
    const { season, teamName, roundName } = await leagueBasics(db, leagueId);
    const { data: claims } = await db.from("waiver_claims").select("team_id, add_player_id, drop_player_id, status, priority").eq("league_id", leagueId).eq("week", week);
    const ok = (claims ?? []).filter((c) => String(c.status).toUpperCase() === "PROCESSED");
    const n = await names(db, season, ok.flatMap((c) => [c.add_player_id, c.drop_player_id]));
    const text = waiverReportText(roundName(week), ok.map((c) => ({ teamName: teamName(c.team_id), added: n.get(c.add_player_id) ?? c.add_player_id, dropped: c.drop_player_id ? n.get(c.drop_player_id) ?? c.drop_player_id : null })));
    if (text) await postMessage(db, { leagueId, channel: LEAGUE_CHANNEL, senderTeamId: null, kind: "system", body: text, dedupeKey: `waivers:${week}` });
  });
}

export async function postFreeAgentReport(db: SupabaseClient, leagueId: string, week: number) {
  await safely("free agent report", async () => {
    const { season, teamName, roundName } = await leagueBasics(db, leagueId);
    const { data: moves } = await db.from("free_agent_transfers").select("team_id, add_player_id, drop_player_id, status, created_at_ms").eq("league_id", leagueId).eq("week", week).order("created_at_ms");
    const ok = (moves ?? []).filter((m) => String(m.status ?? "PROCESSED").toUpperCase() === "PROCESSED");
    const n = await names(db, season, ok.flatMap((m) => [m.add_player_id, m.drop_player_id]));
    const text = freeAgentReportText(roundName(week), ok.map((m) => ({
      teamName: teamName(m.team_id),
      added: m.add_player_id ? n.get(m.add_player_id) ?? m.add_player_id : null,
      dropped: m.drop_player_id ? n.get(m.drop_player_id) ?? m.drop_player_id : null,
    })));
    if (text) await postMessage(db, { leagueId, channel: LEAGUE_CHANNEL, senderTeamId: null, kind: "system", body: text, dedupeKey: `free-agents:${week}` });
  });
}

// ---- after a round is finalised: the league's recap, and the shield

export async function postRoundPosts(db: SupabaseClient, leagueId: string, week: number) {
  await safely("league recap", async () => {
    const { season, teamName, roundName } = await leagueBasics(db, leagueId);
    const [{ data: matchups }, { data: results }] = await Promise.all([
      db.from("league_matchups").select("kind, status, label, weeks, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus").eq("league_id", leagueId),
      db.from("team_week_results").select("team_id, week, score, player_points").eq("league_id", leagueId),
    ]);
    const thisWeek = (matchups ?? []).filter((m) => (m.weeks ?? []).map(Number).includes(week));
    const wk = (results ?? []).filter((r) => Number(r.week) === week);
    const awards = weeklyAwards(wk.map((r) => ({ week, teamId: r.team_id, score: Number(r.score) }))).latest;
    let top: { id: string; points: number; teamId: string } | null = null;
    for (const r of wk) for (const [id, p] of Object.entries((r.player_points as Record<string, number>) ?? {})) {
      if (!top || Number(p) > top.points) top = { id, points: Number(p), teamId: r.team_id };
    }
    const n = top ? await names(db, season, [top.id]) : new Map<string, string>();
    const regular = (matchups ?? []).filter((m) => m.kind === "regular") as LadderMatchup[];
    const ladder = thisWeek.every((m) => m.kind === "regular") ? buildLadder([...new Set((results ?? []).map((r) => r.team_id))], regular).slice(0, 3).map((r) => teamName(r.teamId)) : [];
    const text = leagueRecapText({
      roundName: roundName(week),
      games: thisWeek.map((m) => ({ home: teamName(m.home_team_id), away: m.away_team_id ? teamName(m.away_team_id) : null, homeScore: m.home_score, awayScore: m.away_score, label: m.kind === "regular" ? null : m.label })),
      crown: awards ? { teams: awards.crown.map(teamName), score: awards.top } : null,
      spoon: awards ? { teams: awards.spoon.map(teamName), score: awards.bottom } : null,
      topPlayer: top ? { name: n.get(top.id) ?? top.id, points: Math.round(top.points), teamName: teamName(top.teamId) } : null,
      ladderTop: ladder,
    });
    await postMessage(db, { leagueId, channel: LEAGUE_CHANNEL, senderTeamId: null, kind: "system", body: text, meta: { recapWeek: week }, dedupeKey: `recap:${week}` });
  });
  await safely("shield report", async () => {
    const s = await loadShield(db, leagueId);
    const e = s.events.find((x) => x.week === week);
    if (!s.enabled || !e) return;
    const { teamName } = await leagueBasics(db, leagueId);
    const reign = s.reigns.find((r) => r.teamId === e.holderTeamId || r.teamName === teamName(e.holderTeamId));
    await postMessage(db, {
      leagueId,
      channel: LEAGUE_CHANNEL,
      senderTeamId: null,
      kind: "system",
      body: shieldReportText(s.name, { kind: e.kind, holder: teamName(e.holderTeamId), other: e.otherTeamId ? teamName(e.otherTeamId) : null, homeScore: e.homeScore, awayScore: e.awayScore, defences: reign?.defences ?? 0 }),
      dedupeKey: `shield:${week}`,
    });
  });
}
