"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import { getActiveUsername } from "@/lib/session";

type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Fixtures"
  | "Team Details";

export default function TeamDetailsPage() {
  const router = useRouter();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>("Team Details");

  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const refreshLeague = useLeagueStore((s) => s.refreshLeague);

  const activeLeague = useMemo(() => {
    return (leagues ?? []).find((l: any) => l.id === activeLeagueId) ?? null;
  }, [leagues, activeLeagueId]);

  const userId = useMemo(() => getActiveUsername(), []);

  const norm = (s: any) => String(s ?? "").trim().toLowerCase();

  // find YOUR teamId inside activeLeague.teams
  const yourTeamId = useMemo(() => {
    const teams = Array.isArray(activeLeague?.teams) ? activeLeague.teams : [];
    if (!teams.length) return null;

    if (userId) {
      const me = norm(userId);
      const hit =
        teams.find((t: any) => norm(t?.userId) === me) ??
        teams.find((t: any) => norm(t?.owner_username) === me) ??
        null;

      if (hit?.id) return String(hit.id);
    }

    return teams[0]?.id ? String(teams[0].id) : null;
  }, [activeLeague?.teams, userId]);

  // form state
  const [teamName, setTeamName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  // route protection
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/session/me", { cache: "no-store" });
        if (!me.ok && !cancelled) router.replace("/");
      } catch {
        if (!cancelled) router.replace("/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // prefill team name from league store
  useEffect(() => {
    const teams = Array.isArray(activeLeague?.teams) ? activeLeague.teams : [];
    const mine = yourTeamId ? teams.find((t: any) => String(t.id) === String(yourTeamId)) : null;
    if (mine?.name) setTeamName(String(mine.name));
  }, [activeLeague?.teams, yourTeamId]);

  // styles (match dashboard vibe)
  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    padding: 14,
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const primaryButton: React.CSSProperties = {
    height: 38,
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
    color: "white",
    fontSize: 13,
    fontWeight: 900,
    border: "2px solid rgba(255,255,255,0.85)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    cursor: "pointer",
  };

  const dangerButton: React.CSSProperties = {
    height: 38,
    width: "100%",
    borderRadius: 999,
    background: "#EF4444",
    color: "white",
    fontSize: 13,
    fontWeight: 900,
    border: "2px solid rgba(255,255,255,0.85)",
    cursor: "pointer",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 38,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.92)",
    outline: "none",
    padding: "0 12px",
    fontSize: 13,
    fontWeight: 700,
    color: "#0f172a",
  };

  async function saveTeamName() {
    setMsg(null);
    setErr(null);

    if (!activeLeagueId) return setErr("No active league.");
    if (!yourTeamId) return setErr("Could not determine your team.");

    const next = String(teamName ?? "").trim();
    if (next.length < 2) return setErr("Team name must be at least 2 characters.");

    setSaving(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          teamId: yourTeamId,
          leagueId: activeLeagueId,
          name: next,
          // initials: (optional) omit so it doesn't overwrite
        }),
      });

      const j = await res.json().catch(() => null);

      if (!res.ok || !j?.ok) {
        throw new Error(j?.error ?? "Failed to update team name");
      }

      setMsg("Team name updated.");
      refreshLeague(activeLeagueId); // pull new name into the app
    } catch (e: any) {
      setErr(e?.message ?? "Failed to update team name");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    setMsg(null);
    setErr(null);
    setLoggingOut(true);

    try {
      await fetch("/api/session/logout", { method: "POST" });
    } catch {}

    try {
      localStorage.removeItem("sr-user-profile-v1");
      localStorage.removeItem("sr-leagues-v3");
    } catch {}

    router.replace("/");
  }

  function onMenuSelect(item: ActiveMenu) {
    setActiveMenu(item);
    setMenuOpen(false);

    if (item === "Dashboard") router.replace("/dashboard");
    if (item === "League") router.push("/league");
    if (item === "Draft Room") router.push("/draft-room");
    if (item === "Team Details") router.push("/team-details");
  }

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background:
            "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Top row: menu + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <button
    onClick={() => setMenuOpen(true)}
    aria-label="Open menu"
    style={{
      background: "transparent",
      border: "none",
      padding: 0,
      margin: 0,
      color: "white",
      fontSize: 36,
      fontWeight: 900,
      lineHeight: "36px",
      cursor: "pointer",
    }}
  >
    ☰
  </button>

  <div style={{ flex: 1 }} />
</div>

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: 22 }}>Team Details</div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
              Change your team name
            </div>

            {(msg || err) ? (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: err ? "rgba(239,68,68,0.22)" : "rgba(34,197,94,0.18)",
                  border: err
                    ? "1px solid rgba(239,68,68,0.45)"
                    : "1px solid rgba(34,197,94,0.35)",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {err ? err : msg}
              </div>
            ) : null}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>Team Name</div>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Enter team name"
              style={inputStyle}
            />

            <button
              onClick={saveTeamName}
              disabled={saving}
              style={{ ...primaryButton, marginTop: 10, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save Team Name"}
            </button>
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>Session</div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{ ...dangerButton, opacity: loggingOut ? 0.7 : 1 }}
            >
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
        activeItem="Team Details"
      />
    </main>
  );
}