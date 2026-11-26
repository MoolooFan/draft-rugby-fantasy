"use client";
// components/draftRoom/ui.tsx
// Small pieces the Draft Room (app/draft-room/page.tsx) is built from: shared styles, the jersey,
// the Draft / watchlist buttons, the menu button, the pop-up frame, a player's name line and the
// clock helpers. Split out of the page on 26 Nov 2026 (it had grown to 1,450 lines).
import React, { useEffect, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { TEAM_OPTIONS } from "@/lib/constants";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { positionsLabel } from "@/lib/players/positions";
import type { Player } from "@/lib/draft/types";
import { WatchEyeIcon } from "@/components/WatchEyeIcon";
import { jerseySrcForTeamCode } from "@/components/dashboard/helpers";

// -------- styles --------
export const headerCard: React.CSSProperties = { ...themeCard, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 };

export const listBox: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};

export const inputWrap: React.CSSProperties = {
  background: "rgba(255,255,255,0.92)",
  borderRadius: 10,
  padding: "8px 10px",
  boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
};

/** the yellow "latest pick" pill */
export const latestPickPill: React.CSSProperties = {
  marginTop: 10,
  background: "#FACC15",
  color: "#0f172a",
  borderRadius: 999,
  padding: "7px 12px",
  fontSize: 11,
  fontWeight: 500,
  boxShadow: "0 10px 18px rgba(0,0,0,0.16)",
  textAlign: "center",
};

// -------- clock --------
/** Redraws the component every `ms` and gives the time now. */
export function useNowTick(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function pad2(n: number) {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s;
}

export function formatMMSS(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
}

// -------- pieces --------
/** "CRU" -> "Crusaders" (the team list still says MOP for Moana; players have MOA). */
export function teamLabel(teamCode: string) {
  const code = normalizeTeamCode(teamCode);
  return TEAM_OPTIONS.find((t) => normalizeTeamCode(t.value) === code)?.label ?? teamCode;
}

/** A Super Rugby team's jersey (the angled one where there is one). */
export function JerseyTile({ teamCode, size = 34 }: { teamCode: string; size?: number }) {
  return (
    <img
      src={jerseySrcForTeamCode(teamCode, "angle")}
      alt=""
      style={{ width: size, height: size, borderRadius: 10, objectFit: "contain", display: "block" }}
      draggable={false}
    />
  );
}

/** Jersey, "J. Smith" (plus any tags after it) and "Team — positions" underneath. */
export function PlayerInfo({ player, tags }: { player: Player; tags?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <JerseyTile teamCode={player.teamCode} size={32} />
      <div>
        <div style={{ fontWeight: 500, fontSize: 12 }}>
          {player.firstName?.[0] ?? "?"}. {player.lastName ?? ""}
          {tags}
        </div>
        <div style={{ fontSize: 10, opacity: 0.7 }}>
          {teamLabel(player.teamCode)}
          {" — "}
          {positionsLabel(player)}
        </div>
      </div>
    </div>
  );
}

export function DraftButton({ enabled, onClick, label = "Draft" }: { enabled: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      disabled={!enabled}
      onClick={onClick}
      style={{
        height: 28,
        width: 64,
        borderRadius: 10,
        border: "none",
        background: enabled ? "#6366F1" : "rgba(0,0,0,0.25)",
        color: "white",
        fontWeight: 700,
        fontSize: 12,
        cursor: enabled ? "pointer" : "not-allowed",
        opacity: enabled ? 1 : 0.55,
      }}
    >
      {label}
    </button>
  );
}

export function WatchButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
      style={{
        width: 32,
        height: 28,
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.10)",
        background: active ? "rgba(250,204,21,0.25)" : "rgba(0,0,0,0.05)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        color: "#0f172a",
        fontSize: 16,
        fontWeight: 700,
      }}
    >
      <WatchEyeIcon active={active} />
    </button>
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={onClick}
        aria-label="Open menu"
        style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
      >
        ☰
      </button>
    </div>
  );
}

/** A dimmed screen with a box in the middle; tapping outside closes it. */
export function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: "92%", maxWidth: 520 }}>{children}</div>
    </div>
  );
}
