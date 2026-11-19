// lib/backup/run.ts (server only)
// Nightly backups (Ethan, 19 Nov 2026): every table in the database's public schema (leagues,
// teams, rosters, lineups, results, history, players, stats, chat, ...) copied into one gzipped
// JSON file, daily/YYYY-MM-DD.json.gz in the private "backups" bucket. The scheduler runs it at
// about 3am NZ time (app/api/cron/tick); the Admin page can run it now and download any of them.
// The last KEEP_DAYS days are kept. Logins (Supabase's own auth tables) aren't included.
import { gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BACKUP_BUCKET = "backups";
export const KEEP_DAYS = 30;
const PAGE = 2000;
/** NZ hour the nightly backup runs (the first scheduler call in that hour, or the next hour if missed). */
export const BACKUP_HOUR_NZ = 3;

export type BackupFile = { name: string; path: string; bytes: number | null; createdAt: string | null };
export type BackupResult = { path: string; tables: number; rows: number; bytes: number; removed: string[] };

/** "2026-11-20" and the hour, in NZ time. */
export function nzDateHour(ms: number): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function listBackups(db: SupabaseClient): Promise<BackupFile[]> {
  const { data, error } = await db.storage.from(BACKUP_BUCKET).list("daily", { limit: 200, sortBy: { column: "name", order: "desc" } });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.name.endsWith(".json.gz"))
    .map((f) => ({
      name: f.name,
      path: `daily/${f.name}`,
      bytes: (f.metadata as { size?: number } | null)?.size ?? null,
      createdAt: f.created_at ?? null,
    }));
}

/** Copies every table into today's (NZ date) backup file, then removes files older than KEEP_DAYS. */
export async function runBackup(db: SupabaseClient, nowMs: number = Date.now()): Promise<BackupResult> {
  const { data: names, error } = await db.rpc("backup_table_names");
  if (error) throw error;
  const tables: Record<string, unknown[]> = {};
  let rows = 0;
  for (const t of (names ?? []) as string[]) {
    const all: unknown[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: e } = await db.rpc("backup_table_rows", { t, page_offset: offset, page_size: PAGE });
      if (e) throw new Error(`${t}: ${e.message}`);
      const page = (data ?? []) as unknown[];
      all.push(...page);
      if (page.length < PAGE) break;
    }
    tables[t] = all;
    rows += all.length;
  }
  const { date } = nzDateHour(nowMs);
  const body = gzipSync(Buffer.from(JSON.stringify({ madeAt: new Date(nowMs).toISOString(), tables })));
  const path = `daily/${date}.json.gz`;
  const { error: upErr } = await db.storage.from(BACKUP_BUCKET).upload(path, body, { contentType: "application/gzip", upsert: true });
  if (upErr) throw upErr;

  // keep the last KEEP_DAYS days
  const cutoff = nzDateHour(nowMs - KEEP_DAYS * 24 * 3600 * 1000).date;
  const old = (await listBackups(db)).filter((f) => f.name.slice(0, 10) < cutoff).map((f) => f.path);
  if (old.length) await db.storage.from(BACKUP_BUCKET).remove(old);
  return { path, tables: Object.keys(tables).length, rows, bytes: body.length, removed: old };
}

/** For the scheduler: run tonight's backup if it's backup time and there isn't one for today yet. */
export async function backupIfDue(db: SupabaseClient, nowMs: number): Promise<BackupResult | null> {
  const { date, hour } = nzDateHour(nowMs);
  if (hour !== BACKUP_HOUR_NZ && hour !== BACKUP_HOUR_NZ + 1) return null;
  const { data, error } = await db.storage.from(BACKUP_BUCKET).list("daily", { search: `${date}.json.gz` });
  if (error) throw error;
  if ((data ?? []).some((f) => f.name === `${date}.json.gz`)) return null;
  return runBackup(db, nowMs);
}
