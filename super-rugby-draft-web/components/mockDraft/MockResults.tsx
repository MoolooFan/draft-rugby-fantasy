"use client";
// components/mockDraft/MockResults.tsx
// A finished mock draft: your grade and where your team ranks, your team, every team's grade
// (tap one to see its players) and the full board.
import React, { useState } from "react";
import { PrepTabs } from "@/components/draftPrep/PrepPage";
import type { LinePlayer } from "@/components/draftPrep/PlayerLine";
import { yourPlace, type MockDraft } from "@/lib/draft/mock";
import type { DraftStrategy } from "@/lib/draft/strategy";
import { card, innerBox, ink, line, muted, primaryButton, secondaryButton, teal } from "@/lib/ui/theme";
import { BoardView, TeamView } from "./MockRoom";
import { ordinalSuffix } from "./MockSetup";

type P = LinePlayer & { id: string };
const TABS = ["My Team", "All Teams", "Board"] as const;
type Tab = (typeof TABS)[number];

const GRADE_TEXT: Record<string, string> = {
  "A+": "Brilliant draft",
  A: "Great draft",
  "B+": "Good draft",
  B: "Solid draft",
  "C+": "Okay draft",
  C: "Below average",
  D: "Tough draft",
};

export function MockResults({
  mock,
  byId,
  strategy,
  onOpen,
  onAgain,
  onSettings,
}: {
  mock: MockDraft;
  byId: Map<string, P>;
  strategy: DraftStrategy | null;
  onOpen: (p: P) => void;
  onAgain: () => void;
  onSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>("My Team");
  const [team, setTeam] = useState<number | null>(null);
  const grade = mock.result?.grades[mock.you] ?? "–";
  const place = yourPlace(mock);
  const ranked = mock.order
    .map((t) => Number(t))
    .sort((a, b) => (mock.result?.strengths[b] ?? 0) - (mock.result?.strengths[a] ?? 0));
  const missing = mock.picks.filter((id) => !byId.has(id)).length;

  return (
    <>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: "linear-gradient(to bottom right, rgb(13,148,136), rgb(16,185,129))", color: "white", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 800, flexShrink: 0 }}>
          {grade}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{GRADE_TEXT[grade] ?? "Draft done"}</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: muted, lineHeight: 1.4 }}>
            {place}
            {ordinalSuffix(place)} best team of {mock.order.length}, judged on Draft Rank, last season&apos;s points and how well your starting spots are filled.
          </div>
        </div>
      </div>

      <div style={{ ...card, display: "grid", gap: 10 }}>
        <PrepTabs tabs={TABS} active={tab} onChange={(t) => { setTab(t); setTeam(null); }} />
        {missing ? <div style={{ fontSize: 11, color: muted }}>{missing} player{missing === 1 ? " is" : "s are"} no longer in the player pool.</div> : null}
        {tab === "My Team" ? (
          <TeamView mock={mock} team={mock.you} byId={byId} strategy={strategy} onOpen={onOpen} />
        ) : tab === "Board" ? (
          <BoardView mock={mock} byId={byId} onOpen={onOpen} />
        ) : team != null ? (
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={() => setTeam(null)} style={{ justifySelf: "start", background: "transparent", border: "none", color: teal, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>‹ All teams</button>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{mock.teamNames[team]} · {mock.result?.grades[team]}</div>
            <TeamView mock={mock} team={team} byId={byId} strategy={strategy} onOpen={onOpen} />
          </div>
        ) : (
          <div style={{ ...innerBox, padding: 0 }}>
            {ranked.map((t, i) => (
              <button
                key={t}
                onClick={() => setTeam(t)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", border: "none", borderBottom: `1px solid ${line}`, background: t === mock.you ? "rgba(13,148,136,0.08)" : "transparent", cursor: "pointer", textAlign: "left", color: ink }}
              >
                <span style={{ width: 22, fontSize: 13, fontWeight: 700, color: muted }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: t === mock.you ? 800 : 600 }}>
                  {mock.teamNames[t]} <span style={{ fontSize: 11, color: muted, fontWeight: 500 }}>pick {mock.order.indexOf(String(t)) + 1}</span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 800, color: teal }}>{mock.result?.grades[t]}</span>
                <span style={{ color: muted }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...card, display: "grid", gap: 8 }}>
        <button style={primaryButton} onClick={onAgain}>Draft Again</button>
        <button style={secondaryButton} onClick={onSettings}>Change Settings</button>
      </div>
    </>
  );
}
