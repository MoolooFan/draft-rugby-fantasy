// lib/notifications/push.ts (server only)
// Phone push notifications (plan item D1; Ethan, 26 Nov 2026). People turn them on per phone on
// the Account page (or the Dashboard card): the phone gives us a "subscription" which is saved in
// push_subscriptions. Here we send to people, only for the types they have switched on
// (lib/notifications/types.ts). A notification never breaks whatever triggered it: failures are
// logged and ignored. iPhones need the site added to the Home Screen (iOS 16.4+).
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { withDefaults, type NotificationKey } from "@/lib/notifications/types";

export type PushMessage = {
  title: string;
  body: string;
  /** the page to open when it's tapped (e.g. "/transactions") */
  url?: string;
  /** a newer notification with the same tag replaces the older one on the phone */
  tag?: string;
};

// The push keys identify the site to Apple / Google's push services. Contact = the site itself.
const SUBJECT = "https://sr-draft-fantasy.vercel.app";

let keysCache: { publicKey: string; privateKey: string } | null = null;

/** The site's push keys, made the first time they're needed (push_keys). */
export async function pushKeys(db: SupabaseClient): Promise<{ publicKey: string; privateKey: string }> {
  if (keysCache) return keysCache;
  const read = async () => {
    const { data, error } = await db.from("push_keys").select("public_key, private_key").eq("id", 1).maybeSingle();
    if (error) throw error;
    return data ? { publicKey: data.public_key as string, privateKey: data.private_key as string } : null;
  };
  let keys = await read();
  if (!keys) {
    const made = webpush.generateVAPIDKeys();
    // two servers at once: the first one's keys win (on conflict, nothing is written)
    await db.from("push_keys").upsert({ id: 1, public_key: made.publicKey, private_key: made.privateKey }, { onConflict: "id", ignoreDuplicates: true });
    keys = await read();
  }
  if (!keys) throw new Error("Couldn't make the push keys");
  keysCache = keys;
  return keys;
}

/** The people (users.username_norm) who have each team. */
export async function usersForTeams(db: SupabaseClient, teamIds: string[]): Promise<string[]> {
  const ids = [...new Set(teamIds.filter(Boolean))];
  if (!ids.length) return [];
  const { data } = await db.from("teams").select("user_id").in("id", ids);
  return [...new Set((data ?? []).map((t) => String(t.user_id ?? "")).filter(Boolean))];
}

/** Everyone in a league except the given teams. */
export async function leagueUsers(db: SupabaseClient, leagueId: string, exceptTeamIds: Array<string | null | undefined> = []): Promise<string[]> {
  const skip = new Set(exceptTeamIds.filter(Boolean) as string[]);
  const { data } = await db.from("teams").select("id, user_id").eq("league_id", leagueId);
  return [...new Set((data ?? []).filter((t) => !skip.has(t.id)).map((t) => String(t.user_id ?? "")).filter(Boolean))];
}

type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };

/** Send to these people's phones, if they have this type switched on ("test" always goes). */
export async function sendPush(db: SupabaseClient, userIds: string[], type: NotificationKey | "test", msg: PushMessage): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  try {
    let users = [...new Set(userIds.filter(Boolean))];
    if (!users.length) return out;
    if (type !== "test") {
      const { data } = await db.from("users").select("username_norm, notification_settings").in("username_norm", users);
      const on = new Set((data ?? []).filter((u) => withDefaults(u.notification_settings)[type]).map((u) => String(u.username_norm)));
      users = users.filter((u) => on.has(u));
      if (!users.length) return out;
    }
    const { data: subs, error } = await db.from("push_subscriptions").select("endpoint, user_id, p256dh, auth").in("user_id", users);
    if (error) throw error;
    if (!subs?.length) return out;

    const keys = await pushKeys(db);
    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url ?? "/dashboard", tag: msg.tag ?? type });
    const ok: string[] = [];
    const gone: string[] = [];
    await Promise.all(
      (subs as Sub[]).map(async (s) => {
        try {
          // web-push encrypts and signs it; it's sent with fetch (web-push's own sender hung
          // on some networks when tested, 26 Nov 2026)
          const req = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            vapidDetails: { subject: SUBJECT, publicKey: keys.publicKey, privateKey: keys.privateKey },
            TTL: 6 * 3600, // a phone that's off for longer than this doesn't get old news
          });
          const res = await fetch(req.endpoint, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.body ? new Uint8Array(req.body) : undefined,
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) {
            ok.push(s.endpoint);
            out.sent++;
          } else {
            out.failed++;
            // 404 / 410: the phone turned them off or the app was removed
            if (res.status === 404 || res.status === 410) gone.push(s.endpoint);
            else console.error("[push] send failed:", res.status, (await res.text().catch(() => "")).slice(0, 200));
          }
        } catch (e) {
          out.failed++;
          console.error("[push] send failed:", e);
        }
      })
    );
    if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);
    if (ok.length) await db.from("push_subscriptions").update({ last_ok_at: new Date().toISOString() }).in("endpoint", ok);
  } catch (e) {
    console.error("[push] failed:", e);
  }
  return out;
}

/**
 * Run `send` only the first time this key is seen (push_sent), so the 5-minute job never sends the
 * same reminder twice. Returns false if it was already sent.
 */
export async function sendOnce(db: SupabaseClient, key: string, send: () => Promise<unknown>): Promise<boolean> {
  const { error } = await db.from("push_sent").insert({ key });
  if (error) {
    if (String(error.message).toLowerCase().includes("duplicate") || (error as { code?: string }).code === "23505") return false;
    console.error("[push] sendOnce:", error.message);
    return false;
  }
  await send();
  return true;
}
