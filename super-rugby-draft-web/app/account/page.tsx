"use client";

// Account page (plan item E1): switch team, change password, notification settings, log out.

import React, { useEffect, useMemo, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { useRouter } from "next/navigation";

import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import { useRequireSession } from "@/lib/session/useRequireSession";
import { validateNewPassword } from "@/lib/auth/validate";
import { NOTIFICATION_TYPES, withDefaults, type NotificationKey, type NotificationSettings } from "@/lib/notifications/types";

type Me = { username: string; displayName: string; firstName: string | null; lastName: string | null };

export default function AccountPage() {
  useRequireSession();
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);

  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    fetch("/api/session/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok ? setMe(j) : null))
      .catch(() => {});
  }, []);

  // ---- styles (same as Team Details) ----
  const cardStyle: React.CSSProperties = { ...themeCard };
  const primaryButton: React.CSSProperties = {
    height: 38,
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
    color: "white",
    fontSize: 13,
    fontWeight: 700,
    border: "2px solid rgba(255,255,255,0.85)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    cursor: "pointer",
  };
  const dangerButton: React.CSSProperties = { ...primaryButton, background: "#EF4444", boxShadow: "none" };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 38,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.92)",
    outline: "none",
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 500,
    color: "#0f172a",
    boxSizing: "border-box",
  };
  const sectionTitle: React.CSSProperties = { fontWeight: 700, fontSize: 12, marginBottom: 8 };
  const note = (kind: "ok" | "err"): React.CSSProperties => ({
    marginTop: 10,
    borderRadius: 12,
    padding: "8px 12px",
    background: kind === "err" ? "rgba(239,68,68,0.22)" : "rgba(34,197,94,0.18)",
    border: kind === "err" ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(34,197,94,0.35)",
    fontSize: 12,
    fontWeight: 600,
  });

  // ---- switch team ----
  const myLeagues = useMemo(() => (leagues ?? []) as Array<{ id: string; name: string }>, [leagues]);

  // ---- change password ----
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function changePassword() {
    setPwMsg(null);
    if (!currentPw) return setPwMsg({ kind: "err", text: "Please enter your current password." });
    const v = validateNewPassword(newPw);
    if (!v.ok) return setPwMsg({ kind: "err", text: v.message });
    if (newPw !== confirmPw) return setPwMsg({ kind: "err", text: "The two new passwords don't match." });
    setPwBusy(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) return setPwMsg({ kind: "err", text: j?.error ?? "Couldn't change your password. Please try again." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg({ kind: "ok", text: "Password changed." });
    } catch {
      setPwMsg({ kind: "err", text: "Couldn't change your password. Please try again." });
    } finally {
      setPwBusy(false);
    }
  }

  // ---- notifications ----
  const [notif, setNotif] = useState<NotificationSettings | null>(null);
  const [notifMsg, setNotifMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => {
    fetch("/api/account/notifications", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => setNotif(withDefaults(j?.ok ? j.settings : {})))
      .catch(() => setNotif(withDefaults({})));
  }, []);

  async function toggle(key: NotificationKey) {
    if (!notif) return;
    const next = { ...notif, [key]: !notif[key] };
    setNotif(next); // show the change straight away
    setNotifMsg(null);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: next }),
      });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error);
      setNotif(withDefaults(j.settings));
    } catch {
      setNotif(notif); // put it back
      setNotifMsg({ kind: "err", text: "Couldn't save that. Please try again." });
    }
  }

  // ---- log out ----
  const [loggingOut, setLoggingOut] = useState(false);
  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/session/logout", { method: "POST" });
    } catch {}
    try {
      localStorage.removeItem("sr-user-profile-v1");
      localStorage.removeItem("sr-leagues-v3");
    } catch {}
    // Full page load so the whole app forgets the signed-in player.
    window.location.assign("/");
  }

  const fullName = [me?.firstName, me?.lastName].filter(Boolean).join(" ");

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
          <div style={{ flex: 1 }} />
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 22 }}>Account</div>
            {me ? (
              <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
                {fullName ? `${fullName} · ` : ""}
                {me.displayName}
              </div>
            ) : null}
          </div>

          {/* Switch team */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Your team</div>
            {myLeagues.length ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.9, marginBottom: 8 }}>
                  Pick which league and team you&apos;re looking at.
                </div>
                <select
                  id="account-league"
                  value={activeLeagueId ?? ""}
                  onChange={(e) => setActiveLeague(e.target.value)}
                  style={{ ...inputStyle, appearance: "auto" }}
                >
                  {myLeagues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9, marginBottom: 10 }}>You haven&apos;t joined a league yet.</div>
                <button style={primaryButton} onClick={() => router.push("/league")}>
                  Join or create a league
                </button>
              </>
            )}
          </div>

          {/* Change password */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Change password</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input id="pw-current" type="password" autoComplete="current-password" placeholder="Current password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} style={inputStyle} />
              <input id="pw-new" type="password" autoComplete="new-password" placeholder="New password (at least 8 characters)" value={newPw} onChange={(e) => setNewPw(e.target.value)} style={inputStyle} />
              <input id="pw-confirm" type="password" autoComplete="new-password" placeholder="New password again" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} style={inputStyle} />
            </div>
            <button onClick={changePassword} disabled={pwBusy} style={{ ...primaryButton, marginTop: 10, opacity: pwBusy ? 0.7 : 1 }}>
              {pwBusy ? "Changing…" : "Change password"}
            </button>
            {pwMsg ? <div style={note(pwMsg.kind)}>{pwMsg.text}</div> : null}
          </div>

          {/* Notifications */}
          <div style={cardStyle}>
            <div style={sectionTitle}>Notifications</div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.9, marginBottom: 8 }}>
              Choose which notifications you get. Notifications aren&apos;t switched on for the site yet; your choices are saved for when they are.
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {NOTIFICATION_TYPES.map((t) => {
                const on = notif ? notif[t.key] : true;
                return (
                  <button
                    key={t.key}
                    role="switch"
                    aria-checked={on}
                    disabled={!notif}
                    onClick={() => toggle(t.key)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: 10,
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "none",
                      background: "rgba(255,255,255,0.85)",
                      color: "#0f172a",
                      cursor: notif ? "pointer" : "default",
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{t.label}</span>
                      <span style={{ display: "block", fontSize: 11, fontWeight: 500, opacity: 0.7 }}>{t.hint}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      style={{ width: 40, height: 22, borderRadius: 999, background: on ? "#22C55E" : "rgba(15,23,42,0.25)", position: "relative", transition: "background 0.15s" }}
                    >
                      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 999, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.15s" }} />
                    </span>
                  </button>
                );
              })}
            </div>
            {notifMsg ? <div style={note(notifMsg.kind)}>{notifMsg.text}</div> : null}
          </div>

          {/* Log out */}
          <div style={cardStyle}>
            <button onClick={handleLogout} disabled={loggingOut} style={{ ...dangerButton, opacity: loggingOut ? 0.7 : 1 }}>
              {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues as any}
        activeLeagueId={activeLeagueId as any}
        setActiveLeague={setActiveLeague as any}
        activeItem="Account"
      />
    </main>
  );
}
