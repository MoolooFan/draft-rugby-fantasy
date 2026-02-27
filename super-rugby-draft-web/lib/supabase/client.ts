// lib/supabase/client.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/** Browser-only Supabase client (safe to use in "use client" files) */
export function supabaseBrowser() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  // ✅ url + anonKey are now `string` in this scope
  _client = createClient(url, anonKey);
  return _client;
}

/** Back-compat alias (some files may import `supabase`) */
export const supabase = supabaseBrowser();