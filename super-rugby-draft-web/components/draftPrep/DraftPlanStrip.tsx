"use client";
// components/draftPrep/DraftPlanStrip.tsx
// In the draft room, above the Player Pool: how many of your draft strategy's targets are still
// there (early / mid / late), a button that opens the Draft Strategy panel
// (components/draftPrep/DraftStrategyPanel.tsx). Before the draft, a separate Mock Draft button sits
// beside it (Ethan, 26 Nov 2026: outside the strategy box).
import React from "react";
import Link from "next/link";
import { isEmptyStrategy, TARGET_GROUPS, type DraftStrategy } from "@/lib/draft/strategy";
import { ink, muted, teal } from "@/lib/ui/theme";

export function DraftPlanStrip({
  strategy,
  draftedIds,
  leagueId,
  hideMockDraft = false,
  onEditStrategy,
}: {
  strategy: DraftStrategy | null;
  /** players already taken in this draft */
  draftedIds: Set<string>;
  leagueId: string | null;
  /** no Mock Draft button while the draft is on (Ethan, 25 Nov 2026) */
  hideMockDraft?: boolean;
  /** opens the Draft Strategy panel */
  onEditStrategy: () => void;
}) {
  const empty = isEmptyStrategy(strategy);
  const left = TARGET_GROUPS.map((g) => ({ ...g, all: strategy?.targets[g.key].length ?? 0, left: (strategy?.targets[g.key] ?? []).filter((id) => !draftedIds.has(id)).length })).filter((g) => g.all > 0);
  const link: React.CSSProperties = { color: teal, fontWeight: 700, fontSize: 11, textDecoration: "none", whiteSpace: "nowrap" };
  const box: React.CSSProperties = { background: "white", color: ink, borderRadius: 12, boxShadow: "0 4px 12px rgba(15,23,42,0.10)" };
  return (
    <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "stretch" }}>
    <div style={{ ...box, flex: 1, minWidth: 0, padding: "8px 10px", display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: empty ? 500 : 600, color: empty ? muted : ink, flex: 1 }}>
          {empty ? "Plan your picks with a draft strategy." : left.length ? "Your targets still available:" : "Your draft strategy is set."}
        </span>
        <button onClick={onEditStrategy} style={{ ...link, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}>
          {empty ? "Set Up Strategy" : "Edit Strategy"}
        </button>
      </div>
      {left.length ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {left.map((g) => (
            <span key={g.key} style={{ padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: g.left ? "rgba(13,148,136,0.12)" : "#eef2f6", color: g.left ? teal : muted }}>
              {g.short} {g.left}/{g.all}
            </span>
          ))}
        </div>
      ) : null}
    </div>
    {hideMockDraft ? null : (
      <Link
        href={leagueId ? `/mock-draft?leagueId=${encodeURIComponent(leagueId)}` : "/mock-draft"}
        style={{ ...box, ...link, fontSize: 12, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}
      >
        Mock Draft
      </Link>
    )}
    </div>
  );
}
