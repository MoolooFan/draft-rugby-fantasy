"use client";
// app/league/ui.tsx
// (moved out of page.tsx unchanged)
import React from "react";

import { useLeagueStore } from "@/lib/league/store";

export type LeagueStoreActions = ReturnType<typeof useLeagueStore.getState>;

export function toDatetimeLocal(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Accepts "YYYY-MM-DDTHH:mm" from <input type="datetime-local" />
// Returns ms timestamp or null if invalid/empty
export function parseDatetimeLocal(value: string) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// ---- League settings pop-up and shared modal helpers ----
// These live outside LeaguePage so React keeps their state when the page
// re-renders (e.g. when it refreshes the league after you switch back to the tab).

export function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "92%",
          maxWidth: 420,
          // tall pop-ups (e.g. Custom scoring) scroll instead of running off the screen
          maxHeight: "90svh",
          overflowY: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.9 }}>{label}</div>
      {children}
    </div>
  );
}

export function inputStyle(disabled = false): React.CSSProperties {
return {
  width: "100%",
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 800,
  outline: "none",
  background: disabled ? "rgba(255,255,255,0.75)" : "#FFFFFF",
  color: "#0f172a",
  opacity: disabled ? 0.75 : 1,
};
}

export function selectStyle(disabled = false): React.CSSProperties {
return {
  width: "100%",
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.18)",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 800,
  outline: "none",
  background: disabled ? "rgba(255,255,255,0.75)" : "#FFFFFF",
  color: "#0f172a",
  opacity: disabled ? 0.75 : 1,
};
}

export function saveButton(): React.CSSProperties {
  return {
    height: 34,
    borderRadius: 999,
    padding: "0 18px",
    background: "#22C55E",
    border: "none",
    color: "white",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
  };
}
