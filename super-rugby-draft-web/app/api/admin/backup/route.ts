// app/api/admin/backup/route.ts — admin only. The nightly database backups (lib/backup/run.ts):
// GET              -> the saved backups, newest first, each with a download link (works for 10 minutes)
// POST { action: "run" } -> make today's backup now (replaces today's if there is one)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { BACKUP_BUCKET, BACKUP_HOUR_NZ, KEEP_DAYS, listBackups, runBackup } from "@/lib/backup/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireSiteAdmin();
    const files = await listBackups(supabaseAdmin);
    const links = files.length
      ? await supabaseAdmin.storage.from(BACKUP_BUCKET).createSignedUrls(files.map((f) => f.path), 600, { download: true })
      : { data: [], error: null };
    if (links.error) throw links.error;
    const url = new Map((links.data ?? []).map((l) => [l.path, l.signedUrl]));
    return NextResponse.json({
      ok: true,
      keepDays: KEEP_DAYS,
      hourNz: BACKUP_HOUR_NZ,
      files: files.map((f) => ({ ...f, url: url.get(f.path) ?? null })),
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSiteAdmin();
    const b = await req.json().catch(() => ({}));
    if (b?.action !== "run") return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true, result: await runBackup(supabaseAdmin) });
  } catch (e) {
    console.error("[admin/backup]", e);
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
