// lib/notifications/events.ts (server only)
// What each push notification says and who gets it (plan item D1, agreed 11 Nov; Ethan, 26 Nov
// 2026). Called where the thing happens: chat messages (lib/chat/server.ts postMessage), trades,
// waivers. The timed ones (lineup reminder, draft starting) are in lib/notifications/reminders.ts.
// Every function here swallows its own errors: a notification never stops the action.
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEAGUE_CHANNEL, tradeText, type ChatKind } from "@/lib/chat/common";
import { leagueBasics, names } from "@/lib/chat/server";
import { leagueUsers, sendPush, usersForTeams } from "@/lib/notifications/push";

const safe = async (what: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    console.error(`[push] ${what}:`, e);
  }
};

const short = (text: string, max = 140) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "nothing");

/**
 * A chat message: people's messages to the DM's other team (chat_dm) or the rest of the league
 * (chat_league); the site's own league posts (recap, Shield, waiver and free agent reports, ...)
 * to everyone (chat_auto). Trade cards and trade notes aren't sent here: the trade notifications
 * cover them.
 */
export async function pushChatMessage(
  db: SupabaseClient,
  m: { leagueId: string; channel: string; senderTeamId: string | null; kind: ChatKind; body?: string | null; imageUrl?: string | null; meta?: Record<string, unknown> }
) {
  await safe("chat", async () => {
    const people = m.kind === "text" || m.kind === "image";
    const leaguePost = m.kind === "system" && m.channel === LEAGUE_CHANNEL && !m.senderTeamId && !m.meta?.tradeId;
    if (!people && !leaguePost) return;
    const { teamName } = await leagueBasics(db, m.leagueId);
    const { data: lg } = await db.from("leagues").select("name").eq("id", m.leagueId).maybeSingle();
    const leagueName = String(lg?.name ?? "League");
    const what = m.body ? short(m.body) : m.imageUrl ? "Sent a picture" : "";
    const url = `/chat?c=${encodeURIComponent(m.channel)}`;

    if (leaguePost) {
      await sendPush(db, await leagueUsers(db, m.leagueId), "chat_auto", { title: leagueName, body: what, url, tag: `chat:${m.leagueId}:auto` });
    } else if (m.channel === LEAGUE_CHANNEL) {
      await sendPush(db, await leagueUsers(db, m.leagueId, [m.senderTeamId]), "chat_league", {
        title: `${teamName(m.senderTeamId)} in ${leagueName}`,
        body: what,
        url,
        tag: `chat:${m.leagueId}:league`,
      });
    } else if (m.channel.startsWith("dm:")) {
      const other = m.channel.split(":").slice(1).find((id) => id !== m.senderTeamId);
      if (!other) return;
      await sendPush(db, await usersForTeams(db, [other]), "chat_dm", { title: teamName(m.senderTeamId), body: what, url, tag: `chat:${m.channel}` });
    }
  });
}

type Trade = { id: string; league_id: string; from_team_id: string; to_team_id: string; offer_player_ids?: string[] | null; request_player_ids?: string[] | null };

/** A trade offer, to the team it's offered to. */
export async function pushTradeOffer(db: SupabaseClient, t: Trade) {
  await safe("trade offer", async () => {
    const { season, teamName } = await leagueBasics(db, t.league_id);
    const offer = t.offer_player_ids ?? [];
    const request = t.request_player_ids ?? [];
    const n = await names(db, season, [...offer, ...request]);
    const nm = (ids: string[]) => list(ids.map((id) => n.get(id) ?? id));
    await sendPush(db, await usersForTeams(db, [t.to_team_id]), "trade_offer", {
      title: `Trade offer from ${teamName(t.from_team_id)}`,
      body: short(`They offer ${nm(offer)} for ${nm(request)}.`),
      url: "/transactions",
      tag: `trade:${t.id}`,
    });
  });
}

/** A trade answered: the team that offered it; an accepted one also to the rest of the league. */
export async function pushTradeResult(db: SupabaseClient, tradeId: string, result: "accepted" | "declined") {
  await safe("trade result", async () => {
    const { data: t } = await db.from("trade_offers").select("id, league_id, from_team_id, to_team_id, offer_player_ids, request_player_ids").eq("id", tradeId).maybeSingle();
    if (!t) return;
    const { season, teamName } = await leagueBasics(db, t.league_id);
    await sendPush(db, await usersForTeams(db, [t.from_team_id]), "trade_result", {
      title: result === "accepted" ? "Trade accepted" : "Trade declined",
      body: `${teamName(t.to_team_id)} ${result} your trade.`,
      url: "/transactions",
      tag: `trade:${t.id}`,
    });
    if (result !== "accepted") return;
    const n = await names(db, season, [...(t.offer_player_ids ?? []), ...(t.request_player_ids ?? [])]);
    const { data: lg } = await db.from("leagues").select("name").eq("id", t.league_id).maybeSingle();
    await sendPush(db, await leagueUsers(db, t.league_id, [t.from_team_id, t.to_team_id]), "league_trade", {
      title: `Trade in ${lg?.name ?? "your league"}`,
      body: short(
        tradeText(
          { teamName: teamName(t.from_team_id), gets: (t.request_player_ids ?? []).map((id: string) => n.get(id) ?? id) },
          { teamName: teamName(t.to_team_id), gets: (t.offer_player_ids ?? []).map((id: string) => n.get(id) ?? id) }
        ).replace(/^Trade done: /, "")
      ),
      url: "/transactions",
      tag: `trade:${t.id}`,
    });
  });
}

/** Waivers have run: each team that had claims in that run hears how they went. */
export async function pushWaiverResults(db: SupabaseClient, leagueId: string, week: number) {
  await safe("waivers", async () => {
    const { season } = await leagueBasics(db, leagueId);
    const { data: claims } = await db.from("waiver_claims").select("team_id, add_player_id, drop_player_id, status").eq("league_id", leagueId).eq("week", week);
    const rows = claims ?? [];
    if (!rows.length) return;
    const n = await names(db, season, rows.flatMap((c) => [c.add_player_id, c.drop_player_id]));
    const byTeam = new Map<string, typeof rows>();
    for (const c of rows) byTeam.set(c.team_id, [...(byTeam.get(c.team_id) ?? []), c]);
    for (const [teamId, mine] of byTeam) {
      const got = mine.filter((c) => String(c.status).toUpperCase() === "PROCESSED");
      const missed = mine.filter((c) => String(c.status).toUpperCase() === "FAILED");
      if (!got.length && !missed.length) continue;
      const parts: string[] = [];
      if (got.length) parts.push(`You got ${list(got.map((c) => `${n.get(c.add_player_id) ?? c.add_player_id}${c.drop_player_id ? ` (dropped ${n.get(c.drop_player_id) ?? c.drop_player_id})` : ""}`))}.`);
      if (missed.length) parts.push(`Missed out on ${list(missed.map((c) => n.get(c.add_player_id) ?? c.add_player_id))}.`);
      await sendPush(db, await usersForTeams(db, [teamId]), "waivers", {
        title: got.length ? "Waiver claims processed" : "Waivers: no luck this time",
        body: short(parts.join(" "), 180),
        url: "/transactions",
        tag: `waivers:${leagueId}:${week}`,
      });
    }
  });
}
