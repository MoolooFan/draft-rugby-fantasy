// app/api/admin/taunt-art/route.ts — admin only. Try taunt pictures (lib/chat/tauntArt.ts).
// GET [?playerId] -> every picture (or one player's) + team colours (+ that player's skin tone).
// POST form { file, playerId? } -> upload a picture (no playerId = a generic one).
// POST json { action: "toggle", id, active } | { action: "delete", id } |
//   { action: "colours", colours: { CODE: { jersey, trim } } } | { action: "skin", playerId, tone }.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { DEFAULT_TEAM_COLOURS, isHexColour, teamColours } from "@/lib/chat/tauntArt";
import { loadSkinTones, loadTauntArt, loadTeamColours, TAUNT_ART_BUCKET } from "@/lib/chat/tauntArtServer";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/webp": "webp" };

const fail = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });

export async function GET(req: Request) {
  try {
    await requireSiteAdmin();
    const playerId = String(new URL(req.url).searchParams.get("playerId") ?? "").trim();
    const [all, saved] = await Promise.all([loadTauntArt(supabaseAdmin), loadTeamColours(supabaseAdmin)]);
    const colours = Object.fromEntries(Object.keys(DEFAULT_TEAM_COLOURS).map((c) => [c, teamColours(c, saved)]));
    if (playerId) {
      const tones = await loadSkinTones(supabaseAdmin, [playerId]);
      return NextResponse.json({ ok: true, arts: all.filter((a) => a.player_id === playerId), colours, skinTone: tones.get(playerId) ?? null });
    }
    return NextResponse.json({ ok: true, arts: all, colours });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSiteAdmin();
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const playerId = String(form.get("playerId") ?? "").trim() || null;
      if (!(file instanceof Blob)) return fail("Choose a picture");
      const ext = TYPES[file.type];
      if (!ext) return fail("Please use a PNG or WebP picture with a see-through background");
      if (file.size > MAX_BYTES) return fail("That picture is too big (4 MB max)");
      const path = `${playerId ?? "generic"}/${Date.now()}.${ext}`;
      const { error } = await supabaseAdmin.storage
        .from(TAUNT_ART_BUCKET)
        .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: "31536000" });
      if (error) throw error;
      const url = supabaseAdmin.storage.from(TAUNT_ART_BUCKET).getPublicUrl(path).data.publicUrl;
      const { error: insErr } = await supabaseAdmin.from("taunt_art").insert({ player_id: playerId, url, path });
      if (insErr) throw insErr;
      return NextResponse.json({ ok: true, url });
    }

    const b = await req.json().catch(() => ({}));
    if (b?.action === "toggle") {
      const { error } = await supabaseAdmin.from("taunt_art").update({ active: b?.active !== false }).eq("id", String(b?.id ?? ""));
      if (error) throw error;
    } else if (b?.action === "delete") {
      const { data: row } = await supabaseAdmin.from("taunt_art").select("path").eq("id", String(b?.id ?? "")).maybeSingle();
      if (!row) return fail("Picture not found");
      await supabaseAdmin.storage.from(TAUNT_ART_BUCKET).remove([row.path]);
      const { error } = await supabaseAdmin.from("taunt_art").delete().eq("id", String(b.id));
      if (error) throw error;
    } else if (b?.action === "colours") {
      const rows = Object.entries((b?.colours ?? {}) as Record<string, { jersey?: unknown; trim?: unknown }>)
        .filter(([code]) => code in DEFAULT_TEAM_COLOURS)
        .map(([code, c]) => ({ team_code: code, jersey: c?.jersey, trim_colour: c?.trim, updated_at: new Date().toISOString() }));
      if (!rows.length || rows.some((r) => !isHexColour(r.jersey) || !isHexColour(r.trim_colour))) return fail("Colours must look like #1a2b3c");
      const { error } = await supabaseAdmin.from("team_colours").upsert(rows, { onConflict: "team_code" });
      if (error) throw error;
    } else if (b?.action === "skin") {
      const playerId = String(b?.playerId ?? "").trim();
      const tone = b?.tone == null || b?.tone === "" ? null : Number(b.tone);
      if (!playerId || (tone != null && ![1, 2, 3, 4].includes(tone))) return fail("Pick a skin tone");
      const { error } = await supabaseAdmin.from("player_looks").upsert({ player_id: playerId, skin_tone: tone, updated_at: new Date().toISOString() }, { onConflict: "player_id" });
      if (error) throw error;
    } else {
      return fail("Unknown action");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
