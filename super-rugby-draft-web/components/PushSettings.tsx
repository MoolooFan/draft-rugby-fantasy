"use client";
// components/PushSettings.tsx
// Turning phone push notifications on and off (plan item D1; Ethan, 26 Nov 2026): the Account
// page's panel (PushPanel) and a one-time card on the Dashboard (PushPromptCard) until you turn
// them on or tap "Not now". iPhones only allow notifications for a site added to the Home Screen
// (iOS 16.4+), and only after a tap, so in Safari it explains how to add it first.
// Sending is on the server (lib/notifications/push.ts); public/sw.js shows them on the phone.
import React, { useCallback, useEffect, useState } from "react";

export type PushState =
  | "loading"
  /** this browser can't do push at all */
  | "unsupported"
  /** iPhone / iPad in Safari: add to the Home Screen first */
  | "needs-home-screen"
  /** notifications were blocked for the site in the phone's settings */
  | "denied"
  | "off"
  | "on";

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The push key as the bytes the phone wants. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

let resynced = false;

export function usePush() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!supported()) return setState(isIos() && !isStandalone() ? "needs-home-screen" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const sub = await currentSubscription();
      if (sub && Notification.permission === "granted") {
        setState("on");
        // once a visit, make sure the server still has this phone (e.g. after signing in again)
        if (!resynced) {
          resynced = true;
          fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) }).catch(() => {});
        }
      } else setState("off");
    } catch {
      setState("off");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // asked first, straight from the tap (iPhones only allow it from a tap)
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push", { cache: "no-store" }).then((r) => r.json());
      if (!keyRes?.ok) throw new Error(keyRes?.error || "Couldn't reach the site");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(keyRes.publicKey) }));
      const saved = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), test: true }) }).then((r) => r.json());
      if (!saved?.ok) throw new Error(saved?.error || "Couldn't save it");
      resynced = true;
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, error, turnOn, turnOff };
}

const button: React.CSSProperties = {
  width: "100%",
  height: 40,
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(90deg, #0f172a, #1d4ed8)",
  color: "white",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
const plainButton: React.CSSProperties = { ...button, background: "rgba(15,23,42,0.08)", color: "#0f172a" };
const small: React.CSSProperties = { fontSize: 12, fontWeight: 500, lineHeight: 1.45, opacity: 0.85 };

/** How to add the site to an iPhone's Home Screen. */
export function HomeScreenSteps() {
  return (
    <ol style={{ ...small, margin: "6px 0 0", paddingLeft: 18, listStyle: "decimal" }}>
      <li>
        In Safari, tap the <b>Share</b> button (the square with an arrow pointing up).
      </li>
      <li>
        Tap <b>Add to Home Screen</b>, then <b>Add</b>.
      </li>
      <li>Open Draft Fantasy from its icon on your Home Screen and come back here.</li>
    </ol>
  );
}

/** Account page: turn notifications on / off on this phone. */
export function PushPanel() {
  const { state, busy, error, turnOn, turnOff } = usePush();
  return (
    <div style={{ marginBottom: 10 }}>
      {state === "loading" ? null : state === "on" ? (
        <>
          <div style={{ ...small, marginBottom: 8 }}>
            Notifications are <b>on</b> for this phone. Choose which ones below.
          </div>
          <button style={plainButton} disabled={busy} onClick={turnOff}>
            {busy ? "Turning off…" : "Turn off on this phone"}
          </button>
        </>
      ) : state === "off" ? (
        <>
          <div style={{ ...small, marginBottom: 8 }}>Get a notification on this phone for the things switched on below.</div>
          <button style={button} disabled={busy} onClick={turnOn}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </button>
        </>
      ) : state === "needs-home-screen" ? (
        <div style={small}>
          To get notifications on an iPhone, add Draft Fantasy to your Home Screen first:
          <HomeScreenSteps />
        </div>
      ) : state === "denied" ? (
        <div style={small}>
          Notifications are blocked for Draft Fantasy on this phone. To allow them: <b>Settings → Notifications → Draft Fantasy</b> → Allow Notifications, then come back here.
        </div>
      ) : (
        <div style={small}>This browser can&apos;t show notifications. On an iPhone, add Draft Fantasy to your Home Screen and open it from there.</div>
      )}
      {error ? <div style={{ ...small, color: "#b91c1c", marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}

const DISMISS_KEY = "sr-push-prompt-dismissed-v1";

/**
 * Dashboard: a one-time card until notifications are on or you tap "Not now". Only in the Home
 * Screen app (Ethan, 27 Nov 2026): not on a computer or in a phone's browser (notifications can
 * still be turned on from the Account page there).
 */
export function PushPromptCard({ cardStyle }: { cardStyle: React.CSSProperties }) {
  const { state, busy, error, turnOn } = usePush();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    let d = false;
    try {
      d = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage blocked: show it */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the device's saved choice, only readable in the browser
    setDismissed(d || !isStandalone());
  }, []);
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* fine */
    }
    setDismissed(true);
  };
  if (dismissed || state !== "off") return null;

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Get notifications</div>
      <div style={{ ...small, marginTop: 4 }}>
        Trade offers, waiver results, lineup reminders, the draft starting and chat, on your phone. You choose which on the Account page.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <button style={button} disabled={busy} onClick={turnOn}>
          {busy ? "Turning on…" : "Turn on"}
        </button>
        <button style={plainButton} onClick={dismiss}>
          Not now
        </button>
      </div>
      {error ? <div style={{ ...small, color: "#b91c1c", marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}
