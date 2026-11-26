"use client";
// components/mockDraft/MockSetup.tsx
// Mock Draft settings: how many teams, your pick, the squad, your pick clock and how fast the
// computer teams pick; plus a mock draft in progress to carry on, and the last 5 to look back at.
import React from "react";
import { Chip, Stepper } from "@/components/draftPrep/PrepPage";
import { MOCK_LIMITS, SPEED_LABEL, TIMER_OPTIONS, isFinished, yourPlace, type MockDraft, type MockSettings, type MockSpeed } from "@/lib/draft/mock";
import { rosterSize, squadSummary, type SquadFormat, STANDARD_SQUAD, TEN_SQUAD } from "@/lib/league/squad";
import { card, innerBox, ink, line, muted, primaryButton, secondaryButton, teal } from "@/lib/ui/theme";

const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: ink };
const sub: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: muted };
const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: `1px solid ${line}` };

export function MockSetup({
  settings,
  setSettings,
  leagueFormat,
  hasStrategy,
  live,
  history,
  onStart,
  onResume,
  onDiscardLive,
  onOpenHistory,
  onEditStrategy,
}: {
  settings: MockSettings;
  setSettings: (s: MockSettings) => void;
  /** the league's squad when the mock draft is for a league */
  leagueFormat: SquadFormat | null;
  hasStrategy: boolean;
  live: MockDraft | null;
  history: MockDraft[];
  onStart: () => void;
  onResume: () => void;
  onDiscardLive: () => void;
  onOpenHistory: (m: MockDraft) => void;
  /** opens Draft Strategy in the league's draft room (left out when there's no league still to draft) */
  onEditStrategy?: () => void;
}) {
  const set = (patch: Partial<MockSettings>) => setSettings({ ...settings, ...patch });
  const squads: Array<{ key: MockSettings["squad"]; text: string; format: SquadFormat }> = [
    { key: "standard", text: "Standard (15 + 5)", format: STANDARD_SQUAD },
    { key: "ten", text: "10 starters", format: TEN_SQUAD },
    ...(leagueFormat ? [{ key: "league" as const, text: `${settings.leagueName ?? "League"}'s squad`, format: leagueFormat }] : []),
  ];
  const chosen = squads.find((s) => s.key === settings.squad) ?? squads[0];
  const slot = Math.min(settings.slot, settings.teams);

  return (
    <>
      {live ? (
        <div style={{ ...card, display: "grid", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Mock draft in progress</div>
          <div style={sub}>
            {live.settings.teams} teams · {live.picks.length} picks made
          </div>
          <button style={primaryButton} onClick={onResume}>Carry On</button>
          <button style={{ ...secondaryButton, height: 32, fontSize: 12 }} onClick={onDiscardLive}>Throw It Away</button>
        </div>
      ) : null}

      <div style={{ ...card, display: "grid", gap: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Settings</div>
        <div style={sub}>Draft against computer teams. Nothing you pick here counts in any league.</div>

        <div style={row}>
          <div>
            <div style={label}>Teams</div>
            <div style={sub}>Including you</div>
          </div>
          <Stepper value={settings.teams} min={MOCK_LIMITS.minTeams} max={MOCK_LIMITS.maxTeams} onChange={(n) => set({ teams: n, slot: Math.min(settings.slot, n) })} label="teams" />
        </div>

        <div style={row}>
          <div>
            <div style={label}>Your pick</div>
            <div style={sub}>Your place in round 1 (snake order)</div>
          </div>
          <select
            aria-label="Your pick"
            value={slot}
            onChange={(e) => set({ slot: Number(e.target.value) })}
            style={{ height: 32, borderRadius: 10, border: `1px solid ${line}`, padding: "0 8px", fontSize: 13, fontWeight: 700, color: ink, background: "white" }}
          >
            <option value={0}>Random</option>
            {Array.from({ length: settings.teams }, (_, i) => (
              <option key={i + 1} value={i + 1}>Pick {i + 1}</option>
            ))}
          </select>
        </div>

        <div style={{ ...row, display: "grid", justifyContent: "stretch" }}>
          <div style={label}>Squad</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {squads.map((s) => (
              <Chip key={s.key} active={chosen.key === s.key} onClick={() => set({ squad: s.key })}>{s.text}</Chip>
            ))}
          </div>
          <div style={sub}>
            {squadSummary(chosen.format)} · {rosterSize(chosen.format)} rounds
          </div>
        </div>

        <div style={{ ...row, display: "grid", justifyContent: "stretch" }}>
          <div style={label}>Your pick clock</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TIMER_OPTIONS.map((t) => (
              <Chip key={t} active={settings.timer === t} onClick={() => set({ timer: t })}>{t ? `${t} sec` : "No clock"}</Chip>
            ))}
          </div>
          <div style={sub}>When it runs out your pick is made for you: your draft strategy, like auto-pick in a real draft.</div>
        </div>

        <div style={{ ...row, display: "grid", justifyContent: "stretch", borderBottom: "none" }}>
          <div style={label}>Computer teams pick</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(Object.keys(SPEED_LABEL) as MockSpeed[]).map((s) => (
              <Chip key={s} active={settings.speed === s} onClick={() => set({ speed: s })}>{SPEED_LABEL[s]}</Chip>
            ))}
          </div>
        </div>

        <div style={{ ...innerBox, padding: 10, display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 500, color: muted }}>
            {hasStrategy ? "Your draft strategy is used when you auto-pick: your targets, then your Overall Rankings." : onEditStrategy ? "No draft strategy yet. Set one up to practise it here." : "Draft strategies are set up in a league's Draft Room."}
          </div>
          {onEditStrategy ? (
            <button onClick={onEditStrategy} style={{ background: "transparent", border: "none", color: teal, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
              {hasStrategy ? "Edit" : "Set Up"}
            </button>
          ) : null}
        </div>

        <button style={primaryButton} onClick={onStart}>Start Mock Draft</button>
      </div>

      {history.length ? (
        <div style={{ ...card, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Your last mock drafts</div>
          <div style={sub}>The last {history.length === 1 ? "one is" : `${history.length} are`} kept on this device.</div>
          {history.filter(isFinished).map((m) => (
            <button
              key={m.id}
              onClick={() => onOpenHistory(m)}
              style={{ ...innerBox, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", textAlign: "left", cursor: "pointer" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(13,148,136,0.12)", color: teal, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 14 }}>
                {m.result?.grades[m.you] ?? "–"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {m.settings.teams} teams · pick {m.settings.slot} · {yourPlace(m)}
                  {ordinalSuffix(yourPlace(m))} best team
                </div>
                <div style={sub}>{new Date(m.finishedAt ?? m.startedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
              </div>
              <span style={{ color: muted, fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}
