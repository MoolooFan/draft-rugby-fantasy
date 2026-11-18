"use client";
// components/TeamIconPicker.tsx
// Pick a default team picture instead of uploading one (lib/teams/icons.ts): a boot, posts, a ball
// or a jersey (number 1-23), in any colour. Used on Team Details and when joining a league.
import React, { useState } from "react";
import { TeamAvatar } from "@/components/TeamAvatar";
import { parseTeamIcon, TEAM_ICON_COLOURS, TEAM_ICON_KINDS, teamIconValue, type TeamIconKind } from "@/lib/teams/icons";

export function TeamIconPicker({
  current,
  busy,
  onCancel,
  onSave,
}: {
  /** the team's picture now (an icon is opened as it is) */
  current?: string | null;
  busy?: boolean;
  onCancel: () => void;
  /** the value to save as the team's picture */
  onSave: (value: string) => void;
}) {
  const start = parseTeamIcon(current);
  const [kind, setKind] = useState<TeamIconKind>(start?.kind ?? "jersey");
  const [colour, setColour] = useState<string>(start?.colour ?? "#3b82f6");
  const [number, setNumber] = useState<number>(start?.number ?? 10);
  const value = teamIconValue({ kind, colour, number });
  const preview = (k: TeamIconKind) => teamIconValue({ kind: k, colour, number });

  return (
    <div
      onClick={() => !busy && onCancel()}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-label="Choose an icon"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, borderRadius: 18, background: "white", color: "#0f172a", padding: 14, display: "grid", gap: 12 }}
      >
        <div style={{ fontWeight: 700, fontSize: 15 }}>Choose an icon</div>

        <div style={{ display: "grid", placeItems: "center" }}>
          <TeamAvatar pictureUrl={value} initials="?" size={96} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {TEAM_ICON_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              aria-pressed={kind === k.kind}
              style={{
                display: "grid",
                justifyItems: "center",
                gap: 4,
                padding: "8px 0",
                borderRadius: 12,
                border: kind === k.kind ? "2px solid rgb(29,78,216)" : "2px solid rgba(15,23,42,0.1)",
                background: kind === k.kind ? "rgba(29,78,216,0.08)" : "white",
                cursor: "pointer",
                color: "#0f172a",
              }}
            >
              <TeamAvatar pictureUrl={preview(k.kind)} initials="?" size={40} />
              <span style={{ fontSize: 11, fontWeight: 700 }}>{k.label}</span>
            </button>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 6 }}>Colour</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {TEAM_ICON_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                aria-label={`Colour ${c}`}
                aria-pressed={colour === c}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: c,
                  border: "2px solid white",
                  boxShadow: colour === c ? "0 0 0 2px rgb(29,78,216)" : "0 0 0 1px rgba(15,23,42,0.25)",
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            ))}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700 }}>
              <input type="color" value={colour} onChange={(e) => setColour(e.target.value.toLowerCase())} aria-label="Your own colour" style={{ width: 32, height: 28, padding: 0, border: "none", background: "transparent" }} />
              Other
            </label>
          </div>
        </div>

        {kind === "jersey" ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
            Jersey number
            <select
              value={number}
              onChange={(e) => setNumber(Number(e.target.value))}
              style={{ height: 32, borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", padding: "0 8px", fontSize: 13, fontWeight: 600, color: "#0f172a", background: "white" }}
            >
              {Array.from({ length: 23 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{ flex: 1, height: 38, borderRadius: 999, border: "1px solid rgba(15,23,42,0.2)", background: "white", color: "#0f172a", fontWeight: 700, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => value && onSave(value)}
            disabled={busy || !value}
            style={{ flex: 1, height: 38, borderRadius: 999, border: "none", background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))", color: "white", fontWeight: 700, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
          >
            {busy ? "Saving…" : "Use this icon"}
          </button>
        </div>
      </div>
    </div>
  );
}
