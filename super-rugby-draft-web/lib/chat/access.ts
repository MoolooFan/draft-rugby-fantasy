// lib/chat/access.ts (server only)
// Who you are in a league's chat, which conversations you can see, and your unread messages
// (counting only what your notification settings haven't muted).
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam } from "@/lib/league/serverAuth";
import { getServerProfile } from "@/lib/serverSession";
import { LEAGUE_CHANNEL, dmChannel, muteKeyFor, type ChatKind } from "@/lib/chat/common";
import { withDefaults, type NotificationSettings } from "@/lib/notifications/types";

export type ChatTeam = { id: string; name: string; pictureUrl: string | null; initials: string | null; ownerName: string | null };

export async function chatContext(leagueId: string) {
  const { teamId } = await requireLeagueTeam(leagueId);
  const profile = await getServerProfile();
  const [{ data: teams, error }, { data: user }] = await Promise.all([
    supabaseAdmin.from("teams").select("id, name, picture_url, initials, owner_name").eq("league_id", leagueId),
    supabaseAdmin.from("users").select("notification_settings").eq("auth_user_id", profile?.authUserId ?? "").maybeSingle(),
  ]);
  if (error) throw error;
  const list: ChatTeam[] = (teams ?? []).map((t) => ({ id: t.id, name: t.name, pictureUrl: t.picture_url ?? null, initials: t.initials ?? null, ownerName: t.owner_name ?? null }));
  const channels = [LEAGUE_CHANNEL, ...list.filter((t) => t.id !== teamId).map((t) => dmChannel(teamId, t.id))];
  const settings: NotificationSettings = withDefaults(user?.notification_settings);
  return { teamId, teams: list, teamIds: list.map((t) => t.id), channels, settings };
}

export type ChatRow = {
  id: string;
  channel: string;
  sender_team_id: string | null;
  kind: ChatKind;
  body: string | null;
  image_url: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

/** Your unread messages per conversation (muted kinds don't count), and the newest one. */
export async function unreadFor(leagueId: string, ctx: Awaited<ReturnType<typeof chatContext>>) {
  const [{ data: reads }, { data: rows }] = await Promise.all([
    supabaseAdmin.from("chat_reads").select("channel, last_read_at").eq("team_id", ctx.teamId),
    supabaseAdmin
      .from("chat_messages")
      .select("id, channel, sender_team_id, kind, body, image_url, meta, created_at")
      .eq("league_id", leagueId)
      .in("channel", ctx.channels)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const lastRead = new Map((reads ?? []).map((r) => [r.channel, Date.parse(r.last_read_at)]));
  const byChannel: Record<string, number> = {};
  let newest: ChatRow | null = null;
  for (const m of (rows ?? []) as ChatRow[]) {
    if (m.sender_team_id === ctx.teamId) continue;
    if (Date.parse(m.created_at) <= (lastRead.get(m.channel) ?? 0)) continue;
    if (!ctx.settings[muteKeyFor(m)]) continue;
    byChannel[m.channel] = (byChannel[m.channel] ?? 0) + 1;
    if (!newest) newest = m;
  }
  return { byChannel, total: Object.values(byChannel).reduce((a, b) => a + b, 0), newest };
}
