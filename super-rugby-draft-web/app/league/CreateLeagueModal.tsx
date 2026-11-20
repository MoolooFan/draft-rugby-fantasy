"use client";
// app/league/CreateLeagueModal.tsx
// Create League pop-up: name, team, playoffs, scoring, squad, bonus points, the Shield, draft
// date and time. Moved out of app/league/page.tsx.

import { SquadFormatFields } from "@/components/SquadFormatFields";
import { STANDARD_SQUAD, type SquadFormat } from "@/lib/league/squad";
import React, { useState } from "react";
import { useLeagueStore } from "@/lib/league/store";
import type { PlayoffFormat } from "@/lib/league/types";

import { ScoringEditor } from "@/components/ScoringEditor";
import { STANDARD_SCORING, type ScoringRules } from "@/lib/scoring";

import { ShieldRewardsFields } from "@/components/ShieldRewardsFields";
import { ShieldStartFields } from "@/components/ShieldStartFields";
import { BonusPointsFields } from "@/components/BonusPointsFields";
import { DEFAULT_BONUS_RULES, type BonusRules } from "@/lib/league/bonus";
import { DEFAULT_SHIELD_START, NO_SHIELD_REWARDS, type ShieldRewards, type ShieldStart } from "@/lib/league/shield";
import { toDatetimeLocal, ModalOverlay, inputStyle, selectStyle, parseDatetimeLocal, saveButton } from "./ui";

export function CreateLeagueModal({ onClose }: { onClose: () => void }) {
  const createLeague = useLeagueStore((s) => s.createLeague);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");

  const [draftLocal, setDraftLocal] = useState(() => {
  // default: today + 1 hour
  const now = Date.now();
  return toDatetimeLocal(now + 60 * 60 * 1000);
});

  const [playoffs, setPlayoffs] = useState<PlayoffFormat>("final4");
  const [scoringSystem, setScoringSystem] = useState<"standard" | "alternate" | "custom">("standard");
  const [bonusRules, setBonusRules] = useState<BonusRules>(DEFAULT_BONUS_RULES);
  const [shieldEnabled, setShieldEnabled] = useState(true);
  const [shieldName, setShieldName] = useState("The Shield");
  const [shieldRewards, setShieldRewards] = useState<ShieldRewards>(NO_SHIELD_REWARDS);
  const [shieldStart, setShieldStart] = useState<ShieldStart>(DEFAULT_SHIELD_START);
  const [squadFormat, setSquadFormat] = useState<SquadFormat>(STANDARD_SQUAD);
  const [customRules, setCustomRules] = useState<ScoringRules>(STANDARD_SCORING);
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalOverlay onClose={() => onClose()}>
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

        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>Create League</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle()}
            placeholder="League Name"
          />

          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            style={inputStyle()}
            placeholder="Your Team Name"
          />

          <select
            value={playoffs}
            onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)}
            style={selectStyle()}
          >
            <option value="none">None</option>
            <option value="final2">2 Teams (Final only)</option>
            <option value="final3">3 Teams (Qualifying Final)</option>
            <option value="final4">4 Teams (Semi + Final)</option>
            <option value="final6">6 Teams (Top 2 get a bye)</option>
          </select>

          <select
            value={scoringSystem}
            onChange={(e) => setScoringSystem(e.target.value as "standard" | "alternate" | "custom")}
            style={selectStyle()}
          >
            <option value="standard">Scoring: Standard</option>
            <option value="alternate">Scoring: Alternate</option>
            <option value="custom">Scoring: Custom</option>
          </select>

          {scoringSystem === "custom" ? (
            <div style={{ background: "#f6f8fa", border: "1px solid #e5e9ef", color: "#0f172a", borderRadius: 12, padding: 10 }}>
              <ScoringEditor value={customRules} onChange={setCustomRules} />
            </div>
          ) : null}

          <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.9 }}>Squad</div>
          <SquadFormatFields value={squadFormat} onChange={setSquadFormat} />

          <BonusPointsFields value={bonusRules} onChange={setBonusRules} />

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
            <input type="checkbox" checked={shieldEnabled} onChange={(e) => setShieldEnabled(e.target.checked)} />
            The Shield (won by beating the holder away; defended at home)
          </label>
          {shieldEnabled ? (
            <input
              aria-label="Shield name"
              value={shieldName}
              onChange={(e) => setShieldName(e.target.value)}
              placeholder="The Shield"
              style={inputStyle()}
            />
          ) : null}
          {shieldEnabled ? <ShieldStartFields value={shieldStart} onChange={setShieldStart} /> : null}
          {shieldEnabled ? <ShieldRewardsFields value={shieldRewards} onChange={setShieldRewards} /> : null}

          <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.9 }}>Draft date &amp; time</div>
          <input
  type="datetime-local"
  aria-label="Draft date and time"
  value={draftLocal}
  onChange={(e) => setDraftLocal(e.target.value)}
  style={inputStyle()}
/>

          <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.85, lineHeight: "14px" }}>
            League Commissioner can change/set draft order in league settings prior to the draft
          </div>

          {error && <div style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button
              onClick={async () => {
  const draftAt = parseDatetimeLocal(draftLocal);

  const res = await createLeague({
    name,
    teamName,
    playoffFormat: playoffs,
    draftDateTimeText: draftLocal,
    draftAt,
    scoringSystem,
    bonusRules,
    shieldEnabled,
    shieldName,
    shieldRewards,
    shieldStart,
    squadFormat,
    ...(scoringSystem === "custom" ? { scoringCustom: customRules } : {}),
  });

  if (!res.ok) setError(res.error);
  else onClose();
}}
              style={{ ...saveButton(), height: 36, padding: "0 18px" }}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
