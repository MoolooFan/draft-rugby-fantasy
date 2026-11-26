"use client";
// app/league/JoinLeagueModal.tsx
// Join League pop-up: the join code, then your team name and picture (pre-filled when rejoining).
// Moved out of app/league/page.tsx.

import React, { useState } from "react";
import { useLeagueStore } from "@/lib/league/store";

import { TeamIconPicker } from "@/components/TeamIconPicker";
import { parseTeamIcon } from "@/lib/teams/icons";
import { ModalOverlay, inputStyle, saveButton } from "./ui";
import { TeamAvatar } from "@/components/TeamAvatar";
import { PictureCropper } from "@/components/PictureCropper";

export function JoinLeagueModal({ onClose }: { onClose: () => void }) {
  const joinLeagueByCode = useLeagueStore((s) => s.joinLeagueByCode);
  const refreshLeague = useLeagueStore((s) => s.refreshLeague);
  const [step, setStep] = useState<"code" | "team">("code");
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [leagueTitle, setLeagueTitle] = useState("");
  const [rejoining, setRejoining] = useState(false);
  // the picture: the one from last time, a new one (chosen here), or none
  const [pic, setPic] = useState<{ kind: "previous"; url: string } | { kind: "new"; blob: Blob; url: string } | { kind: "icon"; url: string } | { kind: "none" }>({ kind: "none" });
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findLeague() {
    setError(null);
    const clean = code.trim().toUpperCase();
    if (!clean) return setError("Enter a league code.");
    setBusy(true);
    try {
      const res = await fetch(`/api/leagues/preview?code=${encodeURIComponent(clean)}`, { cache: "no-store", credentials: "include" });
      const j = await res.json().catch(() => null);
      if (!j?.ok) return setError(j?.error ?? "Couldn't find that league.");
      setLeagueTitle(j.league?.name ?? "League");
      setRejoining(!!j.previous);
      setTeamName(j.previous?.name ?? "");
      setPic(j.previous?.pictureUrl ? { kind: "previous", url: j.previous.pictureUrl } : { kind: "none" });
      setStep("team");
    } catch {
      setError("Couldn't find that league.");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setError(null);
    if (teamName.trim().length < 2) return setError("Team name must be at least 2 characters.");
    setBusy(true);
    try {
      const res = await joinLeagueByCode({ code, teamName: teamName.trim(), keepPreviousPicture: pic.kind === "previous" });
      if (!res.ok) return setError(res.error);
      if (pic.kind === "new") {
        const form = new FormData();
        form.append("leagueId", res.leagueId);
        form.append("file", pic.blob, "team.jpg");
        await fetch("/api/teams/picture", { method: "POST", body: form, credentials: "include" }).catch(() => null);
      }
      if (pic.kind === "icon") {
        await fetch("/api/teams/picture", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ leagueId: res.leagueId, icon: parseTeamIcon(pic.url) }),
        }).catch(() => null);
      }
      refreshLeague(res.leagueId);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={() => !busy && onClose()}>
      <div
        style={{
          borderRadius: 14,
          background: "#ffffff",
          padding: 14,
          color: "#0f172a",
          boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
          position: "relative",
        }}
      >
        <button
          onClick={() => onClose()}
          aria-label="Close"
          style={{
            position: "absolute",
            right: 10,
            top: 10,
            background: "transparent",
            border: "none",
            color: "#64748b",
            fontSize: 20,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ×
        </button>

        {step === "code" ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Join League</div>
            <div style={{ display: "grid", gap: 10 }}>
              <input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && findLeague()}
                style={inputStyle()}
                placeholder="League Code"
                autoCapitalize="characters"
              />
              {error && <div style={{ marginTop: 4, color: "#FCA5A5", fontSize: 12, fontWeight: 600 }}>{error}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <button disabled={busy} onClick={findLeague} style={{ ...saveButton(), height: 36, padding: "0 18px", opacity: busy ? 0.7 : 1 }}>
                  {busy ? "Finding…" : "Next"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, paddingRight: 24 }}>Join {leagueTitle}</div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, marginBottom: 12 }}>
              {rejoining ? "Welcome back! Your team from last time is filled in - change anything you like." : "Choose your team name and picture."}
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <TeamAvatar pictureUrl={pic.kind === "none" ? null : pic.url} initials={teamName.trim().slice(0, 2) || "?"} size={56} />
                <div style={{ display: "grid", gap: 6, flex: 1, minWidth: 0 }}>
                  <label style={{ ...saveButton(), display: "grid", placeItems: "center", background: "#eef2f6", color: "#0f172a", border: "1px solid #cbd5e1" }}>
                    {pic.kind === "none" ? "Add Picture" : "Change Picture"}
                    <input
                      id="join-picture"
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) setCropFile(f);
                      }}
                    />
                  </label>
                  <button
                    onClick={() => setIconOpen(true)}
                    style={{ background: "transparent", border: "none", color: "#0d9488", fontSize: 11, fontWeight: 600, textDecoration: "underline", cursor: "pointer", justifySelf: "start", padding: 0 }}
                  >
                    Or choose an icon
                  </button>
                </div>
              </div>
              <input
                id="join-team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                style={inputStyle()}
                placeholder="Team Name"
              />
              {error && <div style={{ marginTop: 4, color: "#FCA5A5", fontSize: 12, fontWeight: 600 }}>{error}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <button
                  disabled={busy}
                  onClick={() => { setStep("code"); setError(null); }}
                  style={{ background: "transparent", border: "none", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  ‹ Back
                </button>
                <button disabled={busy} onClick={join} style={{ ...saveButton(), height: 36, padding: "0 18px", opacity: busy ? 0.7 : 1 }}>
                  {busy ? "Joining…" : "Join"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {cropFile ? (
        <PictureCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={(blob) => {
            setPic({ kind: "new", blob, url: URL.createObjectURL(blob) });
            setCropFile(null);
          }}
        />
      ) : null}
      {iconOpen ? (
        <TeamIconPicker
          current={pic.kind === "icon" ? pic.url : null}
          onCancel={() => setIconOpen(false)}
          onSave={(value) => {
            setPic({ kind: "icon", url: value });
            setIconOpen(false);
          }}
        />
      ) : null}
    </ModalOverlay>
  );
}
