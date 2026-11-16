"use client";
// components/BonusPointsFields.tsx
// The commissioner's bonus point settings (lib/league/bonus.ts): the winning and losing bonus,
// each on/off with its own margin. On the create-league form and in League Settings (locked
// once the draft starts).
import React from "react";
import { BONUS_MARGIN_MAX, type BonusRules } from "@/lib/league/bonus";

const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 800, flexWrap: "wrap" };
const num: React.CSSProperties = {
  width: 64,
  height: 28,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 800,
  padding: "0 6px",
};

export function BonusPointsFields({ value, onChange, disabled }: { value: BonusRules; onChange: (v: BonusRules) => void; disabled?: boolean }) {
  const set = (k: "win" | "lose", patch: Partial<BonusRules["win"]>) => onChange({ ...value, [k]: { ...value[k], ...patch } });
  const marginInput = (k: "win" | "lose", label: string) => (
    <input
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={k === "win" ? 1 : 0}
      max={BONUS_MARGIN_MAX}
      disabled={disabled || !value[k].on}
      value={value[k].margin}
      onChange={(e) => set(k, { margin: Math.max(k === "win" ? 1 : 0, Math.min(BONUS_MARGIN_MAX, Math.round(Number(e.target.value) || 0))) })}
      style={{ ...num, opacity: disabled || !value[k].on ? 0.55 : 1 }}
    />
  );
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={row}>
        <input type="checkbox" disabled={disabled} checked={value.win.on} onChange={(e) => set("win", { on: e.target.checked })} />
        Winning bonus: win by {marginInput("win", "Winning bonus margin")} or more, +1 ladder point
      </label>
      <label style={row}>
        <input type="checkbox" disabled={disabled} checked={value.lose.on} onChange={(e) => set("lose", { on: e.target.checked })} />
        Losing bonus: lose by {marginInput("lose", "Losing bonus margin")} or less, +1 ladder point
      </label>
    </div>
  );
}
