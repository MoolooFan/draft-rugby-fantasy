"use client";
// app/league/LeagueSettingsModal.tsx
// (moved out of page.tsx unchanged)
import React, { useEffect, useState } from "react";

import type { League, PlayoffFormat } from "@/lib/league/types";

import { ScoringEditor } from "@/components/ScoringEditor";
import { completeRules, STANDARD_SCORING, type ScoringRules } from "@/lib/scoring";

import { LeagueStoreActions, toDatetimeLocal, ModalOverlay, Field, inputStyle, selectStyle, parseDatetimeLocal, saveButton } from "./ui";

export function LeagueSettingsModal({
  league,
  isCreator,
  onClose,
  updateLeagueSettings,
  setDraftOrder,
}: {
  league: League;
  isCreator: boolean;
  onClose: () => void;
  updateLeagueSettings: LeagueStoreActions["updateLeagueSettings"];
  setDraftOrder: LeagueStoreActions["setDraftOrder"];
}) {

  const [name, setName] = useState(league.name);
  const [draftLocal, setDraftLocal] = useState(
league.draftDateTimeText || (league.draftAt ? toDatetimeLocal(league.draftAt) : "")
);
const [startRound, setStartRound] = useState<number>(league.startRound ?? 1);
  const [playoffs, setPlayoffs] = useState<PlayoffFormat>(league.playoffFormat);
const REAL_REGULAR_ROUNDS = league.realRegularSeasonRounds ?? 16;
const FANTASY_REGULAR_WEEKS_CAP = 16;
const computedRegularWeeks = Math.max(
1,
Math.min(FANTASY_REGULAR_WEEKS_CAP, REAL_REGULAR_ROUNDS - startRound + 1)
);

const selectedPlayoffWeeks =
playoffs === "final4" ? 2 :
playoffs === "final3" ? 2 :
playoffs === "final2" ? 1 :
0;

const computedSeasonWeeks = computedRegularWeeks + selectedPlayoffWeeks;

  const readOnly = !isCreator;
  // finals, scoring, bonus points and the draft order lock once the draft starts
  const draftStarted = league.draftStatus === "live" || league.draftStatus === "complete";
  const settingsLocked = readOnly || draftStarted;
  const [scoringSystem, setScoringSystem] = useState<"standard" | "alternate" | "custom">(league.scoringSystem ?? "standard");
  const [bonusPoints, setBonusPoints] = useState<boolean>(league.bonusPoints !== false);
  const [customRules, setCustomRules] = useState<ScoringRules>(() =>
    // Custom starts from the league's current values (e.g. Alternate), so switching keeps them
    completeRules((league.scoringCustom as Partial<ScoringRules> | null) ?? (league.scoringRules as Partial<ScoringRules> | undefined) ?? STANDARD_SCORING)
  );

  // Draft order (editable)
const [draftOrderIds, setDraftOrderIds] = useState<string[]>(() =>
league.teams.map((t) => t.id)
);

// If the active league changes while modal open, reset draft order list
useEffect(() => {
setDraftOrderIds(league.teams.map((t) => t.id));
}, [league.id, league.teams]);

function moveTeam(fromIdx: number, toIdx: number) {
setDraftOrderIds((prev) => {
  if (toIdx < 0 || toIdx >= prev.length) return prev;
  const next = [...prev];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
});
}

  return (
    <ModalOverlay onClose={() => onClose()}>
      <div
        style={{
          borderRadius: 14,
          background: "linear-gradient(to bottom, #0f172a, #2563eb)",
          padding: 14,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
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
            color: "white",
            fontSize: 20,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          ×
        </button>

        <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12 }}>League Settings</div>

        <Field label="Change League Name">
<input
  disabled={readOnly}
  value={name}
  onChange={(e) => setName(e.target.value)}
  style={inputStyle(readOnly)}
/>
</Field>

<Field label="Change Playoff Format">
<select
  disabled={settingsLocked}
  value={playoffs}
  onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)}
  style={selectStyle(settingsLocked)}
>
  <option value="none">None</option>
  <option value="final2">2 Teams (Final only)</option>
  <option value="final3">3 Teams (Qualifying Final)</option>
  <option value="final4">4 Teams (Semi + Final)</option>
  <option value="final6">6 Teams (Top 2 get a bye)</option>
</select>
</Field>

<Field label="Scoring System">
<select
  disabled={settingsLocked}
  value={scoringSystem}
  onChange={(e) => setScoringSystem(e.target.value as "standard" | "alternate" | "custom")}
  style={selectStyle(settingsLocked)}
>
  <option value="standard">Standard</option>
  <option value="alternate">Alternate</option>
  <option value="custom">Custom</option>
</select>
</Field>

{scoringSystem === "custom" ? (
  <Field label="Custom Points">
    <div style={{ background: "rgba(255,255,255,0.92)", color: "#0f172a", borderRadius: 12, padding: 10 }}>
      <ScoringEditor value={customRules} onChange={setCustomRules} readOnly={settingsLocked} />
    </div>
  </Field>
) : null}

<Field label="Bonus Points">
<label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
  <input type="checkbox" disabled={settingsLocked} checked={bonusPoints} onChange={(e) => setBonusPoints(e.target.checked)} />
  Win by 140+ or lose by 40 or less: +1 ladder point
</label>
</Field>

{draftStarted ? (
  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
    Finals, scoring, bonus points and the draft order are locked now the draft has started.
  </div>
) : null}

<Field label="Start Round (Real Super Rugby Round)">
<input
  disabled={readOnly}
  type="number"
  min={1}
  max={REAL_REGULAR_ROUNDS}
  value={startRound}
  onChange={(e) => setStartRound(Number(e.target.value || 1))}
  style={inputStyle(readOnly)}
/>
  <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, marginTop: 6 }}>
  Fantasy regular season weeks: {computedRegularWeeks} (of {REAL_REGULAR_ROUNDS})<br/>
  Total season weeks (incl finals): {computedSeasonWeeks}
</div>
</Field>

<Field label="Change Draft Date & Time">
<input
  disabled={readOnly}
  type="datetime-local"
  value={draftLocal}
  onChange={(e) => setDraftLocal(e.target.value)}
  style={inputStyle(readOnly)}
/>
</Field>

        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 900, opacity: 0.9 }}>
          Draft Order
        </div>

        <div
          style={{
            marginTop: 8,
            borderRadius: 10,
            overflow: "hidden",
            background: "rgba(255,255,255,0.92)",
            color: "#0f172a",
            border: "1px solid rgba(0,0,0,0.10)",
          }}
        >
          {draftOrderIds.map((teamId, idx) => {
const t = league.teams.find((x) => x.id === teamId);
if (!t) return null;

const upDisabled = readOnly || idx === 0;
const downDisabled = readOnly || idx === draftOrderIds.length - 1;

return (
  <div
    key={t.id}
    style={{
      display: "grid",
      gridTemplateColumns: "26px 1fr auto",
      gap: 10,
      padding: "10px 10px",
      borderTop: idx === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
      fontSize: 12,
      fontWeight: 700,
      alignItems: "center",
    }}
  >
    <div style={{ opacity: 0.7 }}>{idx + 1}</div>

    <div>{t.name}</div>

    {/* Up/Down controls */}
    <div style={{ display: "flex", gap: 8 }}>
      <button
        disabled={upDisabled}
        onClick={() => moveTeam(idx, idx - 1)}
        style={{
          height: 28,
          width: 34,
          borderRadius: 10,
          border: "none",
          background: "#E2E8F0",
          color: "#0f172a",
          fontWeight: 900,
          cursor: upDisabled ? "not-allowed" : "pointer",
          opacity: upDisabled ? 0.45 : 1,
        }}
        aria-label="Move team up"
      >
        ▲
      </button>

      <button
        disabled={downDisabled}
        onClick={() => moveTeam(idx, idx + 1)}
        style={{
          height: 28,
          width: 34,
          borderRadius: 10,
          border: "none",
          background: "#E2E8F0",
          color: "#0f172a",
          fontWeight: 900,
          cursor: downDisabled ? "not-allowed" : "pointer",
          opacity: downDisabled ? 0.45 : 1,
        }}
        aria-label="Move team down"
      >
        ▼
      </button>
    </div>
  </div>
);
})}

        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button
            disabled={readOnly}
            onClick={() => {
              const draftAt = parseDatetimeLocal(draftLocal);

updateLeagueSettings(league.id, {
name,
playoffFormat: playoffs,
draftDateTimeText: draftLocal,
draftAt,
startRound,
totalWeeks: computedSeasonWeeks, // ✅ IMPORTANT: includes finals weeks
scoringSystem,
bonusPoints,
...(scoringSystem === "custom" ? { scoringCustom: customRules } : {}),
});

              // the order can only change before the draft (and only send it if it changed)
              if (!draftStarted && draftOrderIds.join("|") !== league.teams.map((t) => t.id).join("|")) {
                setDraftOrder(league.id, draftOrderIds);
              }

              onClose();
            }}
            style={{
              ...saveButton(),
              opacity: readOnly ? 0.45 : 1,
              cursor: readOnly ? "not-allowed" : "pointer",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
