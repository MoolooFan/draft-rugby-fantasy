"use client";
// app/league/CreateLeagueModal.tsx
// Create League pop-up. One page in headed sections (Ethan, 28 Nov 2026): League (name, your
// team, finals), Draft (date and time, and an optional draft order lottery time), Scoring & Squad
// (scoring, squad, bonus points) and The Shield (its extra options folded away until opened).

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
import { LOTTERY_BEFORE_DRAFT_MS } from "@/lib/draft/lottery/sim";
import { toDatetimeLocal, ModalOverlay, Field, Section, inputStyle, selectStyle, parseDatetimeLocal, saveButton } from "./ui";

export function CreateLeagueModal({ onClose }: { onClose: () => void }) {
  const createLeague = useLeagueStore((s) => s.createLeague);
  const [name, setName] = useState("");
  const [teamName, setTeamName] = useState("");

  const [draftLocal, setDraftLocal] = useState(() => {
    // default: today + 1 hour
    const now = Date.now();
    return toDatetimeLocal(now + 60 * 60 * 1000);
  });
  // optional: when the draft order lottery runs (lib/draft/lottery)
  const [lotteryLocal, setLotteryLocal] = useState("");

  const [playoffs, setPlayoffs] = useState<PlayoffFormat>("final4");
  const [scoringSystem, setScoringSystem] = useState<"standard" | "alternate" | "custom">("standard");
  const [bonusRules, setBonusRules] = useState<BonusRules>(DEFAULT_BONUS_RULES);
  const [shieldEnabled, setShieldEnabled] = useState(true);
  const [shieldName, setShieldName] = useState("The Shield");
  const [shieldRewards, setShieldRewards] = useState<ShieldRewards>(NO_SHIELD_REWARDS);
  const [shieldStart, setShieldStart] = useState<ShieldStart>(DEFAULT_SHIELD_START);
  const [shieldMore, setShieldMore] = useState(false);
  const [squadFormat, setSquadFormat] = useState<SquadFormat>(STANDARD_SQUAD);
  const [customRules, setCustomRules] = useState<ScoringRules>(STANDARD_SCORING);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // the league was made but its lottery time couldn't be saved
  const [createdNote, setCreatedNote] = useState<string | null>(null);

  const create = async () => {
    const draftAt = parseDatetimeLocal(draftLocal);
    const lotteryAt = parseDatetimeLocal(lotteryLocal);
    if (lotteryAt != null) {
      if (lotteryAt < Date.now() + 60_000) return setError("Pick a lottery time at least a minute from now.");
      if (draftAt != null && lotteryAt > draftAt - LOTTERY_BEFORE_DRAFT_MS) return setError("The lottery has to be at least 5 minutes before the draft.");
    }
    setBusy(true);
    setError(null);
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
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    if (lotteryAt != null) {
      const r = await fetch("/api/draft/lottery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leagueId: res.leagueId, action: "schedule", at: lotteryAt }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setBusy(false);
        return setCreatedNote(`Your league is made, but the lottery time wasn't saved (${j?.error ?? "please try again"}). Set it in League Settings.`);
      }
    }
    setBusy(false);
    onClose();
  };

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

        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Create League</div>

        <div style={{ display: "grid", gap: 12 }}>
          <Section title="League">
            <Field label="League name">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle()} placeholder="e.g. Epstein Try League" />
            </Field>
            <Field label="Your team name">
              <input value={teamName} onChange={(e) => setTeamName(e.target.value)} style={inputStyle()} placeholder="e.g. Stoutman XV" />
            </Field>
            <Field label="Finals">
              <select value={playoffs} onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)} style={selectStyle()}>
                <option value="none">None</option>
                <option value="final2">2 Teams (Final only)</option>
                <option value="final3">3 Teams (Qualifying Final)</option>
                <option value="final4">4 Teams (Semi + Final)</option>
                <option value="final6">6 Teams (Top 2 get a bye)</option>
              </select>
            </Field>
          </Section>

          <Section title="Draft">
            <Field label="Draft date & time">
              <input type="datetime-local" aria-label="Draft date and time" value={draftLocal} onChange={(e) => setDraftLocal(e.target.value)} style={inputStyle()} />
            </Field>
            <Field label="Draft order lottery (optional)">
              <input type="datetime-local" aria-label="Draft order lottery date and time" value={lotteryLocal} onChange={(e) => setLotteryLocal(e.target.value)} style={inputStyle()} />
            </Field>
          </Section>

          <Section title="Scoring & Squad">
            <Field label="Scoring">
              <select value={scoringSystem} onChange={(e) => setScoringSystem(e.target.value as "standard" | "alternate" | "custom")} style={selectStyle()}>
                <option value="standard">Standard</option>
                <option value="alternate">Alternate</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            {scoringSystem === "custom" ? (
              <div style={{ background: "#ffffff", border: "1px solid #e5e9ef", color: "#0f172a", borderRadius: 12, padding: 10 }}>
                <ScoringEditor value={customRules} onChange={setCustomRules} />
              </div>
            ) : null}
            <Field label="Squad">
              <SquadFormatFields value={squadFormat} onChange={setSquadFormat} />
            </Field>
            <Field label="Bonus points">
              <BonusPointsFields value={bonusRules} onChange={setBonusRules} />
            </Field>
          </Section>

          <Section title="The Shield">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={shieldEnabled} onChange={(e) => setShieldEnabled(e.target.checked)} />
              Play for a Shield
            </label>
            {shieldEnabled ? (
              <>
                <Field label="Shield name">
                  <input aria-label="Shield name" value={shieldName} onChange={(e) => setShieldName(e.target.value)} placeholder="The Shield" style={inputStyle()} />
                </Field>
                <button
                  type="button"
                  onClick={() => setShieldMore((v) => !v)}
                  aria-expanded={shieldMore}
                  style={{ justifySelf: "start", border: "none", background: "transparent", padding: 0, fontSize: 12, fontWeight: 700, color: "#0d9488", cursor: "pointer" }}
                >
                  {shieldMore ? "Hide Shield options ▴" : "Shield options ▾"}
                </button>
                {shieldMore ? (
                  <>
                    <ShieldStartFields value={shieldStart} onChange={setShieldStart} />
                    <ShieldRewardsFields value={shieldRewards} onChange={setShieldRewards} />
                  </>
                ) : null}
              </>
            ) : null}
          </Section>

          {error ? <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 600 }}>{error}</div> : null}
          {createdNote ? <div style={{ color: "#b45309", fontSize: 12, fontWeight: 600 }}>{createdNote}</div> : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {createdNote ? (
              <button onClick={() => onClose()} style={{ ...saveButton(), height: 36, padding: "0 18px" }}>
                Done
              </button>
            ) : (
              <button disabled={busy} onClick={create} style={{ ...saveButton(), height: 36, padding: "0 18px", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Creating…" : "Create"}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
