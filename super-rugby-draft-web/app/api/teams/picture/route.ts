// POST   /api/teams/picture  (form data: leagueId, file)  -> sets your team's picture
// DELETE /api/teams/picture?leagueId=...                  -> removes it (back to initials)
// The browser crops and shrinks the photo first (a 256 x 256 JPEG); this checks it and stores it
// in the public "team-pictures" bucket. Only your own team, in a league you're in.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";

const BUCKET = "team-pictures";
const MAX_BYTES = 1024 * 1024; // 1 MB (the browser sends about 30 KB)
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The file path inside the bucket, from a public URL we made earlier. */
function pathFromUrl(url: string | null | undefined): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const i = String(url ?? "").indexOf(marker);
  return i >= 0 ? decodeURIComponent(String(url).slice(i + marker.length).split("?")[0]) : null;
}

async function removeOld(url: string | null | undefined) {
  const path = pathFromUrl(url);
  if (!path) return;
  // Pictures can be shared with a team in a restarted league (E8), so only delete if no team uses it.
  const { count } = await supabaseAdmin.from("teams").select("id", { count: "exact", head: true }).eq("picture_url", url);
  if ((count ?? 0) > 0) return;
  await supabaseAdmin.storage.from(BUCKET).remove([path]);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const leagueId = String(form.get("leagueId") ?? "").trim();
    const file = form.get("file");
    if (!leagueId || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Missing picture" }, { status: 400 });
    }
    const ext = TYPES[file.type];
    if (!ext) return NextResponse.json({ ok: false, error: "Please choose a JPEG, PNG or WebP picture" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That picture is too big (1 MB max)" }, { status: 400 });

    const { teamId } = await requireLeagueTeam(leagueId);

    const { data: team, error: tErr } = await supabaseAdmin.from("teams").select("picture_url").eq("id", teamId).maybeSingle();
    if (tErr) throw tErr;

    const path = `${leagueId}/${teamId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false, cacheControl: "31536000" });
    if (upErr) throw upErr;
    const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    const { error: saveErr } = await supabaseAdmin.from("teams").update({ picture_url: url }).eq("id", teamId);
    if (saveErr) throw saveErr;
    await removeOld(team?.picture_url).catch((e) => console.error("[teams/picture] old picture not removed:", e));

    return NextResponse.json({ ok: true, pictureUrl: url });
  } catch (e: unknown) {
    console.error("[teams/picture][POST]", e);
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const { data: team, error: tErr } = await supabaseAdmin.from("teams").select("picture_url").eq("id", teamId).maybeSingle();
    if (tErr) throw tErr;
    const { error } = await supabaseAdmin.from("teams").update({ picture_url: null }).eq("id", teamId);
    if (error) throw error;
    await removeOld(team?.picture_url).catch((e) => console.error("[teams/picture] old picture not removed:", e));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
