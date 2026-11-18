"use client";
// components/ShieldRewardsFields.tsx
// The commissioner's rewards for holding the Shield (lib/league/shield.ts), on the create-league
// form and in League Settings. Locked once the draft starts.
import React from "react";
import { MAX_SHIELD_LADDER_POINTS, type ShieldRewards } from "@/lib/league/shield";

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 };
const select: React.CSSProperties = {
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 600,
  padding: "0 6px",
};

export function ShieldRewardsFields({ value, onChange, disabled }: { value: ShieldRewards; onChange: (v: ShieldRewards) => void; disabled?: boolean }) {
  const set = <K extends keyof ShieldRewards>(k: K, v: ShieldRewards[K]) => onChange({ ...value, [k]: v });
  const points = (k: "defencePoints" | "winPoints", label: string) => (
    <label style={row}>
      <select aria-label={label} disabled={disabled} value={value[k]} onChange={(e) => set(k, Number(e.target.value))} style={{ ...select, opacity: disabled ? 0.6 : 1 }}>
        {Array.from({ length: MAX_SHIELD_LADDER_POINTS + 1 }, (_, n) => (
          <option key={n} value={n}>
            {n === 0 ? "No" : `+${n}`}
          </option>
        ))}
      </select>
      {label}
    </label>
  );
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8 }}>Rewards for holding it (locked once the draft starts)</div>
      <label style={row}>
        <input type="checkbox" disabled={disabled} checked={value.firstWaiverPick} onChange={(e) => set("firstWaiverPick", e.target.checked)} />
        First waiver pick each week (first round of claims only; then the usual order)
      </label>
      {points("defencePoints", "ladder points for each defence")}
      {points("winPoints", "ladder points for taking it off the holder")}
      <label style={row}>
        <input type="checkbox" disabled={disabled} checked={value.tieBreak} onChange={(e) => set("tieBreak", e.target.checked)} />
        Tie-breaker: level on ladder points, the holder ranks higher
      </label>
      <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>The holder keeps these while the Shield is switched off and during the finals.</div>
    </div>
  );
}
