"use client";
// app/league/LeagueSettingsModal.tsx
// League Settings, in tabs (Ethan, 28 Nov 2026): General, Draft (time, the draft order lottery,
// the order), Scoring & Squad, Shield & Trades, Stakes. Save keeps every tab's changes; the
// lottery and the stakes save on their own.
import { SquadFormatFields } from "@/components/SquadFormatFields";
import { STANDARD_SQUAD, starterCount, type SquadFormat } from "@/lib/league/squad";
import { LeagueStakesSection } from "@/components/LeagueStakes";
import { ShieldRewardsFields } from "@/components/ShieldRewardsFields";
import { ShieldStartFields } from "@/components/ShieldStartFields";
import { BonusPointsFields } from "@/components/BonusPointsFields";
import { CommissionerHandover } from "@/components/CommissionerHandover";
import { cleanBonusRules, type BonusRules } from "@/lib/league/bonus";
import { DEFAULT_SHIELD_START, NO_SHIELD_REWARDS, type ShieldRewards, type ShieldStart } from "@/lib/league/shield";
import React, { useState } from "react";

import type { League, PlayoffFormat } from "@/lib/league/types";

import { ScoringEditor } from "@/components/ScoringEditor";
import { completeRules, STANDARD_SCORING, type ScoringRules } from "@/lib/scoring";

import { LotterySettings } from "./LotterySettings";
import { LeagueStoreActions, toDatetimeLocal, ModalOverlay, Field, PopupTabs, inputStyle, selectStyle, parseDatetimeLocal, saveButton } from "./ui";

const SETTINGS_TABS = ["General", "Draft", "Scoring & Squad", "Shield & Trades", "Stakes"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

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
  const [bonusRules, setBonusRules] = useState<BonusRules>(league.bonusRules ?? cleanBonusRules(null, league.bonusPoints !== false));
  const [squadFormat, setSquadFormat] = useState<SquadFormat>(league.squadFormat ?? STANDARD_SQUAD);
  const [shieldEnabled, setShieldEnabled] = useState<boolean>(league.shieldEnabled !== false);
  const [shieldName, setShieldName] = useState<string>(league.shieldName ?? "The Shield");
  const [shieldRewards, setShieldRewards] = useState<ShieldRewards>(league.shieldRewards ?? NO_SHIELD_REWARDS);
  const [shieldStart, setShieldStart] = useState<ShieldStart>(league.shield?.start ?? DEFAULT_SHIELD_START);
  const shieldStartLocked = !!league.shield?.startLocked;
  // trades & waivers (can change any time)
  const [playoffWaiverFlip, setPlayoffWaiverFlip] = useState<boolean>(league.playoffWaiverFlip !== false);
  const [blockEliminatedTrades, setBlockEliminatedTrades] = useState<boolean>(league.blockEliminatedTrades === true);
  const [customRules, setCustomRules] = useState<ScoringRules>(() =>
    // Custom starts from the league's current values (e.g. Alternate), so switching keeps them
    completeRules((league.scoringCustom as Partial<ScoringRules> | null) ?? (league.scoringRules as Partial<ScoringRules> | undefined) ?? STANDARD_SCORING)
  );

  // Draft order (editable)
const [draftOrderIds, setDraftOrderIds] = useState<string[]>(() =>
league.teams.map((t) => t.id)
);

// If the active league (or its teams) changes while the pop-up is open, start the order again
// (set while drawing, not in an effect)
const teamsKey = `${league.id}:${league.teams.map((t) => t.id).join(",")}`;
const [orderFor, setOrderFor] = useState(teamsKey);
if (orderFor !== teamsKey) {
  setOrderFor(teamsKey);
  setDraftOrderIds(league.teams.map((t) => t.id));
}

function moveTeam(fromIdx: number, toIdx: number) {
setDraftOrderIds((prev) => {
  if (toIdx < 0 || toIdx >= prev.length) return prev;
  const next = [...prev];
  const [item] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, item);
  return next;
});
}

  // tabs (Ethan, 28 Nov 2026): one group of settings at a time
  const [tab, setTab] = useState<SettingsTab>("General");
  const check = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
      <input type="checkbox" disabled={readOnly} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
  const arrow = (disabled: boolean): React.CSSProperties => ({
    height: 28,
    width: 34,
    borderRadius: 10,
    border: "none",
    background: "#E2E8F0",
    color: "#0f172a",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });

  const save = () => {
    const draftAt = parseDatetimeLocal(draftLocal);
    updateLeagueSettings(league.id, {
      name,
      playoffFormat: playoffs,
      draftDateTimeText: draftLocal,
      draftAt,
      startRound,
      totalWeeks: computedSeasonWeeks, // includes finals weeks
      scoringSystem,
      ...(!draftStarted ? { bonusRules } : {}),
      // the squad (only a valid one: at least 5 starters)
      ...(!draftStarted && starterCount(squadFormat) >= 5 ? { squadFormat } : {}),
      shieldEnabled,
      shieldName,
      playoffWaiverFlip,
      blockEliminatedTrades,
      ...(!draftStarted ? { shieldRewards } : {}),
      ...(!shieldStartLocked ? { shieldStart } : {}),
      ...(scoringSystem === "custom" ? { scoringCustom: customRules } : {}),
    });
    // the order can only change before the draft (and only send it if it changed)
    if (!draftStarted && draftOrderIds.join("|") !== league.teams.map((t) => t.id).join("|")) {
      setDraftOrder(league.id, draftOrderIds);
    }
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
          style={{ position: "absolute", right: 10, top: 10, background: "transparent", border: "none", color: "#64748b", fontSize: 20, fontWeight: 700, cursor: "pointer" }}
        >
          ×
        </button>

        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>League Settings</div>
        <PopupTabs tabs={SETTINGS_TABS} value={tab} onChange={setTab} />
        {draftStarted && (tab === "Draft" || tab === "Scoring & Squad" || tab === "Shield & Trades") ? (
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 10 }}>Some settings are locked now the draft has started.</div>
        ) : null}

        <div style={{ display: "grid", gap: 14 }}>
          {tab === "General" ? (
            <>
              <Field label="League name">
                <input disabled={readOnly} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle(readOnly)} />
              </Field>
              <Field label="Start round (real Super Rugby round)">
                <input
                  disabled={readOnly}
                  type="number"
                  min={1}
                  max={REAL_REGULAR_ROUNDS}
                  value={startRound}
                  onChange={(e) => setStartRound(Number(e.target.value || 1))}
                  style={inputStyle(readOnly)}
                />
                <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                  {computedRegularWeeks} weeks + finals = {computedSeasonWeeks} weeks
                </div>
              </Field>
              <Field label="Finals">
                <select disabled={settingsLocked} value={playoffs} onChange={(e) => setPlayoffs(e.target.value as PlayoffFormat)} style={selectStyle(settingsLocked)}>
                  <option value="none">None</option>
                  <option value="final2">2 Teams (Final only)</option>
                  <option value="final3">3 Teams (Qualifying Final)</option>
                  <option value="final4">4 Teams (Semi + Final)</option>
                  <option value="final6">6 Teams (Top 2 get a bye)</option>
                </select>
              </Field>
              {/* hand the commissioner job to another member (Ethan, 23 Nov 2026) */}
              {!readOnly ? (
                <Field label="Commissioner">
                  <CommissionerHandover leagueId={league.id} teams={league.teams} myUsername={String(league.createdByUserId ?? "")} onDone={onClose} />
                </Field>
              ) : null}
            </>
          ) : null}

          {tab === "Draft" ? (
            <>
              <Field label="Draft date & time">
                <input disabled={readOnly} type="datetime-local" value={draftLocal} onChange={(e) => setDraftLocal(e.target.value)} style={inputStyle(readOnly)} />
              </Field>
              {/* the draft order lottery, before the draft (Ethan, 28 Nov 2026; saved straight away) */}
              {!draftStarted ? (
                <Field label="Draft order lottery">
                  <LotterySettings leagueId={league.id} isCommissioner={isCreator} draftAt={typeof league.draftAt === "number" ? league.draftAt : null} />
                </Field>
              ) : null}
              <Field label="Draft order">
                <div style={{ borderRadius: 10, overflow: "hidden", background: "#f6f8fa", color: "#0f172a", border: "1px solid #e5e9ef" }}>
                  {draftOrderIds.map((teamId, idx) => {
                    const t = league.teams.find((x) => x.id === teamId);
                    if (!t) return null;
                    const locked = readOnly || draftStarted;
                    const upDisabled = locked || idx === 0;
                    const downDisabled = locked || idx === draftOrderIds.length - 1;
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
                          fontWeight: 500,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ opacity: 0.7 }}>{idx + 1}</div>
                        <div>{t.name}</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button disabled={upDisabled} onClick={() => moveTeam(idx, idx - 1)} style={arrow(upDisabled)} aria-label="Move team up">
                            ▲
                          </button>
                          <button disabled={downDisabled} onClick={() => moveTeam(idx, idx + 1)} style={arrow(downDisabled)} aria-label="Move team down">
                            ▼
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Field>
            </>
          ) : null}

          {tab === "Scoring & Squad" ? (
            <>
              <Field label="Scoring">
                <select disabled={settingsLocked} value={scoringSystem} onChange={(e) => setScoringSystem(e.target.value as "standard" | "alternate" | "custom")} style={selectStyle(settingsLocked)}>
                  <option value="standard">Standard</option>
                  <option value="alternate">Alternate</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              {scoringSystem === "custom" ? (
                <div style={{ background: "#f6f8fa", border: "1px solid #e5e9ef", color: "#0f172a", borderRadius: 12, padding: 10 }}>
                  <ScoringEditor value={customRules} onChange={setCustomRules} readOnly={settingsLocked} />
                </div>
              ) : null}
              <Field label="Squad">
                <SquadFormatFields value={squadFormat} onChange={setSquadFormat} disabled={settingsLocked} teamCount={league.teams.length} />
              </Field>
              <Field label="Bonus points">
                <BonusPointsFields value={bonusRules} onChange={setBonusRules} disabled={settingsLocked} />
              </Field>
            </>
          ) : null}

          {tab === "Shield & Trades" ? (
            <>
              <Field label="The Shield">
                {check(shieldEnabled, setShieldEnabled, "Play for a Shield")}
                {shieldEnabled ? (
                  <>
                    <input aria-label="Shield name" disabled={readOnly} value={shieldName} onChange={(e) => setShieldName(e.target.value)} placeholder="The Shield" style={inputStyle(readOnly)} />
                    <ShieldStartFields
                      value={shieldStart}
                      onChange={setShieldStart}
                      teams={league.teams.map((t) => ({ id: t.id, name: t.name }))}
                      disabled={readOnly}
                      locked={shieldStartLocked}
                      carriedOver={!!league.shield?.carriedOver}
                    />
                    <ShieldRewardsFields value={shieldRewards} onChange={setShieldRewards} disabled={settingsLocked} />
                  </>
                ) : null}
              </Field>
              <Field label="Trades & waivers">
                {check(playoffWaiverFlip, setPlayoffWaiverFlip, "Flip the waiver order in the finals")}
                {check(blockEliminatedTrades, setBlockEliminatedTrades, "Eliminated teams can't trade")}
              </Field>
            </>
          ) : null}

          {tab === "Stakes" ? (
            <Field label="Rewards & punishments">
              <LeagueStakesSection leagueId={league.id} />
            </Field>
          ) : null}
        </div>

        {tab !== "Stakes" ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button
              disabled={readOnly}
              onClick={save}
              style={{ ...saveButton(), opacity: readOnly ? 0.45 : 1, cursor: readOnly ? "not-allowed" : "pointer" }}
            >
              Save
            </button>
          </div>
        ) : null}
      </div>
    </ModalOverlay>
  );
}
