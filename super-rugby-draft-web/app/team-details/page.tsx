"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppMenu } from "@/components/AppMenu";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PictureCropper } from "@/components/PictureCropper";
import { WeeklyRecapModal } from "@/components/WeeklyRecapModal";
import { SeasonRecapModal } from "@/components/SeasonRecapModal";
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

  // ---- recaps to view again (Ethan, Nov 2026): this season's rounds, and every season ----
  const [recaps, setRecaps] = useState<{ forLeague: string; weeks: Array<{ week: number; label: string }>; seasons: Array<{ leagueId: string; season: number }> } | null>(null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [openSeason, setOpenSeason] = useState<string | null>(null);
  useEffect(() => {
    if (!activeLeagueId) return;
    let cancelled = false;
    fetch(`/api/recap/list?leagueId=${encodeURIComponent(activeLeagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok) setRecaps({ forLeague: activeLeagueId, weeks: j.weeks ?? [], seasons: j.seasons ?? [] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeLeagueId]);
  const recapChip: React.CSSProperties = {
    height: 30,
    padding: "0 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.6)",
    background: "rgba(255,255,255,0.12)",
    color: "white",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  };

  // ---- team picture (E5) ----
  const myTeam: any = useMemo(() => {
    const teams = Array.isArray(activeLeague?.teams) ? activeLeague.teams : [];
    return yourTeamId ? teams.find((t: any) => String(t.id) === String(yourTeamId)) ?? null : null;
  }, [activeLeague?.teams, yourTeamId]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [picBusy, setPicBusy] = useState(false);
  const [picMsg, setPicMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function uploadPicture(jpeg: Blob) {
    if (!activeLeagueId) return;
    setPicBusy(true);
    setPicMsg(null);
    try {
      const form = new FormData();
      form.append("leagueId", activeLeagueId);
      form.append("file", jpeg, "team.jpg");
      const res = await fetch("/api/teams/picture", { method: "POST", body: form, credentials: "include" });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Couldn't save the picture");
      setCropFile(null);
      setPicMsg({ kind: "ok", text: "Team picture updated." });
      refreshLeague(activeLeagueId);
    } catch (e: any) {
      setPicMsg({ kind: "err", text: e?.message ?? "Couldn't save the picture" });
    } finally {
      setPicBusy(false);
    }
  }

  async function removePicture() {
    if (!activeLeagueId) return;
    setPicBusy(true);
    setPicMsg(null);
    try {
      const res = await fetch(`/api/teams/picture?leagueId=${encodeURIComponent(activeLeagueId)}`, { method: "DELETE", credentials: "include" });
      const j = await res.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error ?? "Couldn't remove the picture");
      setPicMsg({ kind: "ok", text: "Team picture removed." });
      refreshLeague(activeLeagueId);
    } catch (e: any) {
      setPicMsg({ kind: "err", text: e?.message ?? "Couldn't remove the picture" });
    } finally {
      setPicBusy(false);
    }
  }

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
        {/* Top row: menu */}
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
              Your team&apos;s picture and name
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
            <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 10 }}>Team Picture</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <TeamAvatar pictureUrl={myTeam?.pictureUrl} initials={myTeam?.userInitials ?? myTeam?.initials} size={72} stars={myTeam?.stars} />
              <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 8 }}>
                <label style={{ ...primaryButton, display: "grid", placeItems: "center", opacity: picBusy || !yourTeamId ? 0.7 : 1 }}>
                  {myTeam?.pictureUrl ? "Change picture" : "Upload picture"}
                  <input
                    id="team-picture-file"
                    type="file"
                    accept="image/*"
                    disabled={picBusy || !yourTeamId}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = ""; // so choosing the same file again still works
                      if (f) setCropFile(f);
                    }}
                  />
                </label>
                {myTeam?.pictureUrl ? (
                  <button
                    onClick={removePicture}
                    disabled={picBusy}
                    style={{ height: 30, borderRadius: 999, border: "2px solid rgba(255,255,255,0.85)", background: "transparent", color: "white", fontSize: 12, fontWeight: 900, cursor: "pointer" }}
                  >
                    Remove picture
                  </button>
                ) : null}
              </div>
            </div>
            {picMsg ? (
              <div
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  padding: "8px 12px",
                  background: picMsg.kind === "err" ? "rgba(239,68,68,0.22)" : "rgba(34,197,94,0.18)",
                  border: picMsg.kind === "err" ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(34,197,94,0.35)",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {picMsg.text}
              </div>
            ) : null}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>Recaps</div>
            {!recaps ? (
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Loading…</div>
            ) : !recaps.seasons.length && !recaps.weeks.length ? (
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Your recaps will be here after the first round is finished.</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {recaps.seasons.length ? (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.75, marginBottom: 6 }}>Seasons</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {recaps.seasons.map((s) => (
                        <button key={s.leagueId} onClick={() => setOpenSeason(s.leagueId)} style={recapChip}>
                          {s.season} season
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {recaps.weeks.length ? (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.75, marginBottom: 6 }}>This season</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {[...recaps.weeks].reverse().map((w) => (
                        <button key={w.week} onClick={() => setOpenWeek(w.week)} style={recapChip}>
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
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
        </div>
      </div>

      {cropFile ? <PictureCropper file={cropFile} busy={picBusy} onCancel={() => setCropFile(null)} onDone={uploadPicture} /> : null}
      {openWeek ? <WeeklyRecapModal leagueId={activeLeagueId} week={openWeek} onClose={() => setOpenWeek(null)} /> : null}
      {openSeason ? <SeasonRecapModal leagueId={openSeason} open onClose={() => setOpenSeason(null)} /> : null}

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