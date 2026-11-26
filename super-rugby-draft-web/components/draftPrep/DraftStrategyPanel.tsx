"use client";
// components/draftPrep/DraftStrategyPanel.tsx
// Draft Strategy (Ethan, 21 Nov 2026; redone 25 Nov 2026): plan your draft before it starts. Three
// tabs (components/draftPrep/StrategyTabs.tsx): Overall Rankings, Targets, Positional Rankings. Since 25 Nov 2026 it
// lives inside the draft room (it was its own page): it opens over the room and Back closes it.
// It edits the draft room's own copy of the strategy, so changes show in the room straight away.
// The draft watchlist (in the draft room) is separate and still comes first for auto-pick.
import React, { useEffect, useMemo, useState } from "react";
import { usePlayerPool } from "@/lib/players/pool";
import type { useDraftStrategy } from "@/lib/draft/useStrategy";
import { isEmptyStrategy } from "@/lib/draft/strategy";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { PrepTabs } from "@/components/draftPrep/PrepPage";
import { usePlayerView } from "@/components/draftPrep/strategyView";
import { OverallRankingsTab, PositionalRankingsTab, TargetsTab } from "@/components/draftPrep/StrategyTabs";
import type { LinePlayer } from "@/components/draftPrep/PlayerLine";
import { card, muted, primaryButton, secondaryButton, teal } from "@/lib/ui/theme";

const TABS = ["Overall Rankings", "Targets", "Positional Rankings"] as const;
type Tab = (typeof TABS)[number];

export function DraftStrategyPanel({
  strat,
  onClose,
  onMockDraft,
}: {
  /** the draft room's useDraftStrategy() */
  strat: ReturnType<typeof useDraftStrategy>;
  onClose: () => void;
  /** left out while the draft is on (no mock drafts then) */
  onMockDraft?: () => void;
}) {
  const { strategy, update, loaded, saving, error } = strat;
  const [tab, setTab] = useState<Tab>("Overall Rankings");
  const [open, setOpen] = useState<LinePlayer | null>(null);

  // the draft room behind doesn't scroll while this is open
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  const pool = usePlayerPool();
  const players: LinePlayer[] = useMemo(
    () =>
      pool
        .map((p) => ({ ...p, teamCode: normalizeTeamCode(p.teamCode), draftRank: p.draftRank ?? 9999 }))
        .sort((a, b) => (a.draftRank ?? 9999) - (b.draftRank ?? 9999)),
    [pool]
  );
  // one search / Filters / stat for all three tabs (components/draftPrep/strategyView.tsx)
  const view = usePlayerView(players);

  return (
    <div role="dialog" aria-modal="true" aria-label="Draft Strategy" style={{ position: "fixed", inset: 0, zIndex: 9000, overflowY: "auto", color: "white", background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }}>
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 12px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ ...card, borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: "calc(14px + env(safe-area-inset-top, 0px))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={onClose}
              aria-label="Back to the Draft Room"
              style={{ background: "transparent", border: "none", padding: 0, color: teal, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <span style={{ fontSize: 22, lineHeight: "22px" }}>‹</span> Draft Room
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={onClose}
              aria-label="Close"
              style={{ width: 32, height: 32, borderRadius: 999, border: "none", background: "#eef2f6", color: "#0f172a", fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: "32px" }}
            >
              ✕
            </button>
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>Draft Strategy</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: error ? "#dc2626" : teal, whiteSpace: "nowrap" }} aria-live="polite">
              {error ? "Not saved" : saving ? "Saving…" : loaded && !isEmptyStrategy(strategy) ? "Saved" : ""}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10, gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div style={{ ...card, display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr)" }}>
            <PrepTabs tabs={TABS} active={tab} onChange={setTab} />
            {!loaded ? (
              <div style={{ fontSize: 13, color: muted, padding: 10 }}>Loading…</div>
            ) : tab === "Overall Rankings" ? (
              <OverallRankingsTab strategy={strategy} update={update} players={players} view={view} onOpen={setOpen} />
            ) : tab === "Targets" ? (
              <TargetsTab strategy={strategy} update={update} players={players} view={view} onOpen={setOpen} />
            ) : (
              <PositionalRankingsTab strategy={strategy} update={update} players={players} view={view} onOpen={setOpen} />
            )}
          </div>

          <div style={{ ...card, display: "grid", gap: 8 }}>
            {onMockDraft ? (
              <>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Try it out</div>
                <button style={primaryButton} onClick={onMockDraft}>Start a Mock Draft</button>
              </>
            ) : null}
            <button style={onMockDraft ? secondaryButton : primaryButton} onClick={onClose}>Back to the Draft Room</button>
          </div>
        </div>
      </div>

      {open ? (
        <PlayerCardModal
          onClose={() => setOpen(null)}
          player={{ ...open, posName: open.posAbbrev, secondaryPosAbbrev: open.secondaryPosAbbrev ?? undefined }}
          teamLabel=""
          initialTab="Stats"
          hideActions
          actions={[]}
        />
      ) : null}
    </div>
  );
}
