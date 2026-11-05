"use client";
// Edit a set of scoring values: points for every stat and for minutes played.
// Used for a league's Custom scoring (commissioner) and for Standard / Alternate (admin page).
// The captain's x2 is fixed and isn't editable. The admin version can also change the minutes
// mark, metres per point and which positions get scrum points.
import React from "react";
import type { EventStatKey, ScoringRules } from "@/lib/scoring";

export const STAT_LABELS: Record<EventStatKey, string> = {
  tries: "Try",
  tryAssists: "Try assist",
  lineBreaks: "Line break",
  lineBreakAssists: "Line break assist",
  defendersBeaten: "Defender beaten",
  metresGained: "Metres (per block of metres)",
  offloads: "Offload",
  tackles: "Tackle made",
  tacklesMissed: "Missed tackle",
  turnoversForced: "Turnover won",
  interceptions: "Interception",
  fiftyTwentyTwos: "Successful 50-22",
  penaltiesConceded: "Penalty conceded",
  errors: "Error",
  lineoutsWon: "Lineout won",
  lineoutSteals: "Lineout steal",
  lineoutErrors: "Lineout error",
  scrumsWon: "Scrum won",
  conversions: "Conversion",
  conversionsMissed: "Missed conversion",
  penaltyGoals: "Penalty goal",
  penaltyGoalsMissed: "Missed penalty goal",
  dropGoals: "Drop goal",
  dropGoalsMissed: "Missed drop goal",
  yellowCards: "Yellow card",
  redCards: "Red card",
};

/**
 * A box you type a number into (no up/down arrows; a decimal keypad on phones). While typing it
 * keeps exactly what you typed (so "-", "0." and "2.5" all work); the value is saved as you go.
 */
function NumberBox({
  value,
  onChange,
  disabled,
  wholeNumber,
  style,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  wholeNumber?: boolean;
  style: React.CSSProperties;
}) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState("");
  return (
    <input
      type="text"
      inputMode={wholeNumber ? "numeric" : "decimal"}
      disabled={disabled}
      value={editing ? text : String(Number.isFinite(value) ? value : 0)}
      onFocus={() => {
        setText(String(value));
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.-]/g, "");
        setText(t);
        const n = Number(t);
        if (t !== "" && t !== "-" && t !== "." && t !== "-." && Number.isFinite(n)) onChange(wholeNumber ? Math.round(n) : n);
      }}
      style={style}
    />
  );
}

export function ScoringEditor({
  value,
  onChange,
  readOnly = false,
  admin = false,
  inputStyle,
  labelStyle,
}: {
  value: ScoringRules;
  onChange: (next: ScoringRules) => void;
  readOnly?: boolean;
  /** Also edit the minutes mark, metres per point and scrum positions. */
  admin?: boolean;
  inputStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
}) {
  const box: React.CSSProperties = { width: 72, height: 30, borderRadius: 8, border: "1px solid rgba(0,0,0,0.15)", padding: "0 6px", fontSize: 13, fontWeight: 800, textAlign: "right", ...inputStyle };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 800, ...labelStyle };
  const row: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, padding: "3px 0" };
  const field = (text: string, v: number, set: (n: number) => void, step = 0.1) => (
    <label style={row} key={text}>
      <span style={label}>{text}</span>
      <NumberBox value={v} onChange={set} disabled={readOnly} wholeNumber={step === 1} style={box} />
    </label>
  );

  return (
    <div style={{ display: "grid", gap: 2 }}>
      {field("Appearance (got on the field)", value.minutesUpTo60, (n) => onChange({ ...value, minutesUpTo60: n }))}
      {field(`Instead, at ${value.minutesFullAt}+ minutes`, value.minutes61Plus, (n) => onChange({ ...value, minutes61Plus: n }))}
      {admin ? field("Minutes for the bigger minutes points", value.minutesFullAt, (n) => onChange({ ...value, minutesFullAt: Math.max(1, Math.round(n)) }), 1) : null}
      {admin ? field("Metres per metres point", value.metresPer, (n) => onChange({ ...value, metresPer: Math.max(1, Math.round(n)) }), 1) : null}
      {(Object.keys(STAT_LABELS) as EventStatKey[]).map((k) =>
        field(
          k === "metresGained" ? `Metres (per ${value.metresPer} m)` : k === "scrumsWon" ? `Scrum won (${value.scrumPositions.join(", ")} only)` : STAT_LABELS[k],
          value.perEvent[k],
          (n) => onChange({ ...value, perEvent: { ...value.perEvent, [k]: n } })
        )
      )}
      {admin ? (
        <div style={row}>
          <span style={label}>Scrum points go to</span>
          <select
            disabled={readOnly}
            value={value.scrumPositions.join(",")}
            onChange={(e) => onChange({ ...value, scrumPositions: e.target.value.split(",") })}
            style={{ ...box, width: 150, textAlign: "left" }}
          >
            <option value="PR,HO">Props and hookers</option>
            <option value="PR">Props only</option>
          </select>
        </div>
      ) : null}
      <div style={{ ...label, opacity: 0.7, marginTop: 4 }}>Captain scores double (fixed).</div>
    </div>
  );
}
