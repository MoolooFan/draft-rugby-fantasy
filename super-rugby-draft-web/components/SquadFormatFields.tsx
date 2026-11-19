"use client";
// components/SquadFormatFields.tsx
// The league's squad (lib/league/squad.ts): Standard, or the commissioner's own starting slots
// (positions or groups like Tight five / Forward / Back), bench size and IR spots. On the
// create-league form and in League Settings (locked once the draft starts).
import React, { useState } from "react";
import {
  isStandardSquad,
  MAX_LEAGUE_TEAMS,
  rosterSize,
  SLOT_KINDS,
  SQUAD_LIMITS,
  STANDARD_SQUAD,
  starterCount,
  type SlotKind,
  type SquadFormat,
} from "@/lib/league/squad";
import { usePlayerPool } from "@/lib/players/pool";

const stepBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "#ffffff",
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: "22px",
  padding: 0,
  cursor: "pointer",
};

function Stepper({ value, onChange, min, max, disabled, label }: { value: number; onChange: (n: number) => void; min: number; max: number; disabled?: boolean; label: string }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} style={{ ...stepBtn, opacity: disabled || value <= min ? 0.4 : 1 }}>
        −
      </button>
      <span style={{ minWidth: 18, textAlign: "center", fontSize: 13, fontWeight: 700 }}>{value}</span>
      <button type="button" aria-label={`More ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} style={{ ...stepBtn, opacity: disabled || value >= max ? 0.4 : 1 }}>
        +
      </button>
    </div>
  );
}

export function SquadFormatFields({
  value,
  onChange,
  disabled,
  teamCount,
}: {
  value: SquadFormat;
  onChange: (v: SquadFormat) => void;
  disabled?: boolean;
  /** teams in the league now (League Settings); not known when creating */
  teamCount?: number;
}) {
  const pool = usePlayerPool();
  // "Custom" stays open even while its numbers match Standard
  const [mode, setMode] = useState<"standard" | "custom">(isStandardSquad(value) ? "standard" : "custom");
  const custom = mode === "custom";
  const starters = starterCount(value);
  const roster = rosterSize(value);
  const canAddStarter = starters < SQUAD_LIMITS.startersMax && roster < SQUAD_LIMITS.rosterMax;
  const setKind = (k: SlotKind, n: number) => onChange({ ...value, starters: { ...value.starters, [k]: n } });

  const teams = teamCount ?? MAX_LEAGUE_TEAMS;
  const drafted = teams * roster;
  const tight = pool.length > 0 && drafted > pool.length * 0.8;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        aria-label="Squad"
        disabled={disabled}
        value={custom ? "custom" : "standard"}
        onChange={(e) => {
          const next = e.target.value === "custom" ? "custom" : "standard";
          setMode(next);
          if (next === "standard") onChange(STANDARD_SQUAD);
        }}
        style={{ height: 34, borderRadius: 10, border: "1px solid rgba(0,0,0,0.18)", padding: "0 8px", fontSize: 13, fontWeight: 600, color: "#0f172a", background: disabled ? "#f1f5f9" : "#ffffff" }}
      >
        <option value="standard">Standard: 15 starters, 5 bench, 1 IR</option>
        <option value="custom">Custom squad</option>
      </select>

      {custom ? (
        <div style={{ display: "grid", gap: 6, background: "#ffffff", color: "#0f172a", borderRadius: 12, padding: 10, border: "1px solid #e5e9ef" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
            Starting spots. A group takes any player who can play one of its positions (Forward = PR, HO, LK, LF; Back = HB, FH, CE, OB).
          </div>
          {SLOT_KINDS.map((k) => {
            const n = value.starters[k.kind] ?? 0;
            return (
              <div key={k.kind} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{k.label}</div>
                  {k.positions.length > 1 ? <div style={{ fontSize: 10, color: "#64748b" }}>{k.positions.join(", ")}</div> : null}
                </div>
                <Stepper label={k.label} value={n} min={0} max={canAddStarter ? n + 1 : n} disabled={disabled} onChange={(v) => setKind(k.kind, v)} />
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid #e5e9ef", paddingTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Bench</div>
            <Stepper label="bench players" value={value.bench} min={0} max={Math.min(SQUAD_LIMITS.benchMax, value.bench + (roster < SQUAD_LIMITS.rosterMax ? 1 : 0))} disabled={disabled} onChange={(v) => onChange({ ...value, bench: v })} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>IR spots</div>
            <Stepper label="IR spots" value={value.ir} min={0} max={SQUAD_LIMITS.irMax} disabled={disabled} onChange={(v) => onChange({ ...value, ir: v })} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {starters} starters + {value.bench} bench = {roster} players per team{value.ir ? `, plus ${value.ir} IR` : ""}
          </div>
          {starters < SQUAD_LIMITS.startersMin ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>A team needs at least {SQUAD_LIMITS.startersMin} starters.</div>
          ) : null}
        </div>
      ) : null}

      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>
        Leagues can have up to {MAX_LEAGUE_TEAMS} teams.
        {pool.length ? ` ${teamCount ? `With ${teams} teams` : `With ${MAX_LEAGUE_TEAMS} teams`}, ${drafted} of the ${pool.length} players in the pool get drafted.` : ""}
      </div>
      {tight ? (
        <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>
          That&apos;s most of the player pool: free agents will be thin. Smaller squads suit bigger leagues.
        </div>
      ) : null}
    </div>
  );
}
