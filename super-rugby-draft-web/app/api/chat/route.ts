// app/api/chat/route.ts
// Your conversations in a league (members only): the league chat and a direct message with each
// other team, each with its latest message and unread count. ?unreadOnly=1: just the unread
// total and the newest unread message (for the menu badge and the message banner).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { chatContext, unreadFor, type ChatRow } from "@/lib/chat/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const leagueId = String(q.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const ctx = await chatContext(leagueId);
    const unread = await unreadFor(leagueId, ctx);
    if (q.get("unreadOnly")) {
      return NextResponse.json({ ok: true, myTeamId: ctx.teamId, total: unread.total, newest: unread.newest, teams: ctx.teams });
    }
    // the latest message in each conversation
    const latest: Record<string, ChatRow> = {};
    for (const ch of ctx.channels) {
      const { data } = await supabaseAdmin
        .from("chat_messages")
        .select("id, channel, sender_team_id, kind, body, image_url, meta, created_at")
        .eq("league_id", leagueId)
        .eq("channel", ch)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]) latest[ch] = data[0] as ChatRow;
    }
    return NextResponse.json({ ok: true, myTeamId: ctx.teamId, teams: ctx.teams, channels: ctx.channels, latest, unread: unread.byChannel });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
