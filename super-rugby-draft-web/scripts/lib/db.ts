// scripts/lib/db.ts
// Database connection for the one-off scripts (importing players, history, making an admin).
// - Normally: the LOCAL test database (keys in .env.development.local).
// - With --live: the real Supabase project (keys in .env.local). It shows which project it's
//   about to change and needs --confirm=<project address> so it can't be run on the wrong one.
import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function scriptDb(): { db: SupabaseClient; live: boolean; url: string } {
  const live = process.argv.includes("--live");
  // dev=true reads .env.development.local first (local test database); dev=false skips it
  loadEnvConfig(process.cwd(), !live);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the env file");
  const isLocal = /127\.0\.0\.1|localhost/.test(url);
  if (live) {
    if (isLocal) throw new Error("--live was given but the keys point at the local test database");
    const host = new URL(url).host;
    const confirm = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);
    if (confirm !== host) {
      throw new Error(`This will change the LIVE project ${host}. To go ahead, run it again with --confirm=${host}`);
    }
    console.log(`Using the LIVE project ${host}`);
  } else {
    if (!isLocal) throw new Error("Without --live this only runs on the local test database (check .env.development.local)");
    console.log("Using the local test database");
  }
  return { db: createClient(url, key, { auth: { persistSession: false } }), live, url };
}
