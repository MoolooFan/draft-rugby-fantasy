// app/api/chat/messages/route.ts
// GET ?leagueId&channel[&after=ISO]: a conversation's messages (the latest 100, or newer than
// `after`), oldest first, and marks it read. POST { leagueId, channel, body?, imageUrl? }: send.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { chatContext } from "@/lib/chat/access";
import { canUseChannel } from "@/lib/chat/common";
import { postMessage } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

const MAX_TEXT = 1000;

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const leagueId = String(q.get("leagueId") ?? "").trim();
    const channel = String(q.get("channel") ?? "").trim();
    const after = String(q.get("after") ?? "").trim();
    if (!leagueId || !channel) return NextResponse.json({ ok: false, error: "Missing leagueId/channel" }, { status: 400 });
    const ctx = await chatContext(leagueId);
    if (!canUseChannel(channel, ctx.teamId, ctx.teamIds)) return NextResponse.json({ ok: false, error: "Not your conversation" }, { status: 403 });

    let query = supabaseAdmin
      .from("chat_messages")
      .select("id, channel, sender_team_id, kind, body, image_url, meta, created_at")
      .eq("league_id", leagueId)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(100);
    if (after) query = query.gt("created_at", after);
    const { data, error } = await query;
    if (error) throw error;

    // opening a conversation reads it
    await supabaseAdmin.from("chat_reads").upsert({ team_id: ctx.teamId, channel, last_read_at: new Date().toISOString() }, { onConflict: "team_id,channel" });

    return NextResponse.json({ ok: true, myTeamId: ctx.teamId, messages: (data ?? []).reverse() });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const leagueId = String(b?.leagueId ?? "").trim();
    const channel = String(b?.channel ?? "").trim();
    const body = String(b?.body ?? "").trim().slice(0, MAX_TEXT);
    const imageUrl = String(b?.imageUrl ?? "").trim();
    if (!leagueId || !channel) return NextResponse.json({ ok: false, error: "Missing leagueId/channel" }, { status: 400 });
    if (!body && !imageUrl) return NextResponse.json({ ok: false, error: "Write a message or add a picture" }, { status: 400 });
    const ctx = await chatContext(leagueId);
    if (!canUseChannel(channel, ctx.teamId, ctx.teamIds)) return NextResponse.json({ ok: false, error: "Not your conversation" }, { status: 403 });
    // only pictures uploaded through the site (chat-images bucket)
    if (imageUrl && !imageUrl.includes("/storage/v1/object/public/chat-images/")) {
      return NextResponse.json({ ok: false, error: "That picture can't be sent" }, { status: 400 });
    }
    await postMessage(supabaseAdmin, { leagueId, channel, senderTeamId: ctx.teamId, kind: imageUrl ? "image" : "text", body: body || null, imageUrl: imageUrl || null });
    await supabaseAdmin.from("chat_reads").upsert({ team_id: ctx.teamId, channel, last_read_at: new Date().toISOString() }, { onConflict: "team_id,channel" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
