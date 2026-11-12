// app/api/chat/image/route.ts
// Upload a picture to send in chat (form: leagueId, file). Saved in the public "chat-images"
// bucket; returns its address for POST /api/chat/messages. League members only.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

export const dynamic = "force-dynamic";

const BUCKET = "chat-images";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const leagueId = String(form.get("leagueId") ?? "").trim();
    const file = form.get("file");
    if (!leagueId || !(file instanceof Blob)) return NextResponse.json({ ok: false, error: "Missing picture" }, { status: 400 });
    const ext = TYPES[file.type];
    if (!ext) return NextResponse.json({ ok: false, error: "Please choose a JPEG, PNG, WebP or GIF picture" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That picture is too big (2 MB max)" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const path = `${leagueId}/${teamId}-${Date.now()}.${ext}`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (error) throw error;
    return NextResponse.json({ ok: true, url: supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
