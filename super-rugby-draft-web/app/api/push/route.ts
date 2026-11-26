// app/api/push/route.ts
// Phone push notifications (lib/notifications/push.ts):
//   GET                              -> { ok, publicKey }  the site's key, for the phone to sign up with
//   POST { subscription }            -> saves this phone for you
//   POST { subscription, test: true } -> also sends it a test notification
//   DELETE { endpoint }              -> this phone stops getting them
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerProfile } from "@/lib/serverSession";
import { pushKeys, sendPush } from "@/lib/notifications/push";

const NO_STORE = { "Cache-Control": "private, no-store" };
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });

export async function GET() {
  try {
    const { publicKey } = await pushKeys(supabaseAdmin);
    return NextResponse.json({ ok: true, publicKey }, { headers: NO_STORE });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Couldn't load the push key", 500);
  }
}

export async function POST(req: Request) {
  const profile = await getServerProfile();
  if (!profile) return bad("Not signed in", 401);
  const body = await req.json().catch(() => ({}));
  const sub = body?.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined;
  const endpoint = String(sub?.endpoint ?? "");
  const p256dh = String(sub?.keys?.p256dh ?? "");
  const auth = String(sub?.keys?.auth ?? "");
  // push services only (Apple, Google, Mozilla, Microsoft all use https)
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) return bad("That isn't a push subscription");

  const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
    { endpoint, user_id: profile.username, p256dh, auth, user_agent: String(req.headers.get("user-agent") ?? "").slice(0, 300), created_at: new Date().toISOString() },
    { onConflict: "endpoint" }
  );
  if (error) return bad(error.message, 500);

  let test: { sent: number; failed: number } | null = null;
  if (body?.test) {
    test = await sendPush(supabaseAdmin, [profile.username], "test", {
      title: "Notifications are on",
      body: "You'll get the ones switched on below. You can change them any time on the Account page.",
      url: "/account",
      tag: "test",
    });
  }
  return NextResponse.json({ ok: true, test }, { headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const profile = await getServerProfile();
  if (!profile) return bad("Not signed in", 401);
  const body = await req.json().catch(() => ({}));
  const endpoint = String(body?.endpoint ?? "");
  if (!endpoint) return bad("Which phone?");
  const { error } = await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", profile.username);
  if (error) return bad(error.message, 500);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
