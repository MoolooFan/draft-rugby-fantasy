"use client";
// components/draftPrep/DraftPlanStrip.tsx
// In the draft room, above the Player Pool: your draft strategy's plan for your next pick's
// round, how you're tracking against your position targets, and links to Draft Strategy and
// Mock Draft.
import React from "react";
import Link from "next/link";
import { isEmptyStrategy, planForRound, planLabel, targetProgress, type DraftStrategy } from "@/lib/draft/strategy";
import { ink, muted, teal } from "@/lib/ui/theme";

export function DraftPlanStrip({
  strategy,
  round,
  roster,
  leagueId,
}: {
  strategy: DraftStrategy | null;
  /** the round of your next pick */
  round: number;
  roster: Array<{ posAbbrev?: string | null }>;
  leagueId: string | null;
}) {
  const empty = isEmptyStrategy(strategy);
  const plan = planForRound(strategy, round);
  const targets = targetProgress(roster, strategy).filter((t) => t.want > 0);
  const link: React.CSSProperties = { color: teal, fontWeight: 700, fontSize: 11, textDecoration: "none", whiteSpace: "nowrap" };
  return (
    <div style={{ background: "white", color: ink, borderRadius: 12, padding: "8px 10px", marginTop: 10, display: "grid", gap: 6, boxShadow: "0 4px 12px rgba(15,23,42,0.10)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {empty ? (
          <span style={{ fontSize: 12, fontWeight: 500, color: muted, flex: 1 }}>Plan your picks with a draft strategy.</span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
            Your plan, round {round}:{" "}
            <span style={{ padding: "1px 8px", borderRadius: 999, background: plan ? "rgba(13,148,136,0.12)" : "#eef2f6", color: plan ? teal : muted, fontWeight: 700 }}>{planLabel(plan)}</span>
          </span>
        )}
        <Link href="/draft-strategy" style={link}>{empty ? "Set Up Strategy" : "Edit Strategy"}</Link>
        <Link href={leagueId ? `/mock-draft?leagueId=${encodeURIComponent(leagueId)}` : "/mock-draft"} style={link}>Mock Draft</Link>
      </div>
      {targets.length ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {targets.map((t) => (
            <span key={t.pos} style={{ padding: "1px 7px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: t.have >= t.want ? "rgba(13,148,136,0.12)" : "#eef2f6", color: t.have >= t.want ? teal : ink }}>
              {t.pos} {t.have}/{t.want}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
