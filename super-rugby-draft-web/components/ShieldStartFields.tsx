"use client";
// components/ShieldStartFields.tsx
// How the Shield is first given out (lib/league/shield.ts, Ethan 20 Nov 2026): the top score in
// the first round, drawn at random once the draft finishes, or a team the commissioner picks. On
// the create-league form (no teams yet, so no picking) and in League Settings, where it locks
// once the league's first round kicks off.
import React from "react";
import type { ShieldStart, ShieldStartMethod } from "@/lib/league/shield";

const select: React.CSSProperties = {
  height: 30,
  borderRadius: 8,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "white",
  color: "#0f172a",
  fontSize: 12,
  fontWeight: 600,
  padding: "0 6px",
  maxWidth: "100%",
};
const note: React.CSSProperties = { fontSize: 11, fontWeight: 500, opacity: 0.75, lineHeight: 1.4 };

export function ShieldStartFields({
  value,
  onChange,
  teams,
  disabled,
  locked,
  carriedOver,
}: {
  value: ShieldStart;
  onChange: (v: ShieldStart) => void;
  /** the league's teams (League Settings); without them a team can't be picked */
  teams?: Array<{ id: string; name: string }>;
  disabled?: boolean;
  /** the first round has kicked off */
  locked?: boolean;
  /** a holder carried over from last season */
  carriedOver?: boolean;
}) {
  const off = disabled || locked;
  const options: Array<{ v: ShieldStartMethod; label: string }> = [
    { v: "top_score", label: "Top score in the first round" },
    { v: "random", label: "Drawn at random" },
    ...(teams ? [{ v: "chosen" as const, label: "Picked by the commissioner" }] : []),
  ];
  const drawn = value.method === "random" && value.teamId ? teams?.find((t) => t.id === value.teamId)?.name ?? null : null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, flexWrap: "wrap" }}>
        <span>First holder</span>
        <select
          aria-label="How the Shield is first given out"
          disabled={off}
          value={value.method}
          onChange={(e) => {
            const method = e.target.value as ShieldStartMethod;
            onChange({ method, teamId: method === "chosen" ? value.teamId ?? teams?.[0]?.id ?? null : method === "random" && value.method === "random" ? value.teamId : null });
          }}
          style={{ ...select, opacity: off ? 0.6 : 1 }}
        >
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {value.method === "chosen" && teams ? (
        <select
          aria-label="The team that starts with the Shield"
          disabled={off}
          value={value.teamId ?? ""}
          onChange={(e) => onChange({ method: "chosen", teamId: e.target.value || null })}
          style={{ ...select, opacity: off ? 0.6 : 1 }}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      ) : null}
      <div style={note}>
        {value.method === "top_score"
          ? "The highest score in the league's first round wins it."
          : value.method === "random"
            ? drawn
              ? `Drawn: ${drawn} starts the season with it.`
              : "Drawn at random once the draft finishes (posted in the league chat). The team holds it from round 1, so its first home game is its first defence."
            : "This team holds it from round 1, so its first home game is its first defence."}
        {carriedOver ? " This season's holder carried it over from last season, so this isn't used." : ""}
        {locked ? " Can't change now the first round has kicked off." : ""}
      </div>
    </div>
  );
}
