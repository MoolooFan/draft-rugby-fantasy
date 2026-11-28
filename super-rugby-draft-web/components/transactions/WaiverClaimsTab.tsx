"use client";
// components/transactions/WaiverClaimsTab.tsx
// The Transactions page's "Pending Claims" tab: your waiver claims for the round in priority
// order (drag to reorder, cancel). Split out of app/transactions/page.tsx (21 Nov 2026).
// The whole line drags, like the Draft Strategy lists (press and hold on a phone; Ethan, 28 Nov
// 2026), and the new order shows straight away while it saves.
import React, { useState } from "react";
import { DragList } from "@/components/draftPrep/strategyView";
import { useTransactionsStore } from "@/lib/transactions/store";
import { roundLabel } from "@/lib/season";
import type { League } from "@/lib/league/types";
import { JerseyTile, listBox, shortName, type Player } from "@/components/transactions/helpers";

export type WaiverClaimsTabProps = {
  activeLeague: League | null;
  yourDraftTeamId: string | null;
  allPlayers: Player[];
  claimsWeek: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yourClaims: any[];
  refreshTransactionsForLeague: (leagueId: string) => Promise<void>;
};

/** The Pending Claims tab: your waiver claims for the round, in priority order (drag to reorder). */
export function WaiverClaimsTab({ activeLeague, yourDraftTeamId, allPlayers, claimsWeek, yourClaims, refreshTransactionsForLeague }: WaiverClaimsTabProps) {
  // the order just dragged to, shown straight away until the saved order comes back
  const [moved, setMoved] = useState<string[] | null>(null);

    if (!activeLeague?.id || !yourDraftTeamId) {
      return <div style={{ ...listBox, padding: 12, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>No league/team selected.</div>;
    }

  // --- Reorder support (priority) ---
  const persistPriorities = (orderedClaimIds: string[]) => {
    // Update store priorities if possible (Zustand pattern)
    const tx: any = useTransactionsStore.getState?.();
    const setClaimPriority =
      tx?.setClaimPriority ||
      tx?.updateClaimPriority ||
      tx?.reorderClaims ||
      null;

    // Preferred: a store method exists
    if (typeof setClaimPriority === "function") {
      // Try the most likely signatures safely
      try {
        // Signature A: setClaimPriority(claimId, priority)
        orderedClaimIds.forEach((id, idx) => setClaimPriority(id, idx + 1));
        return;
      } catch {}
      try {
        // Signature B: reorderClaims({ leagueId, week, teamId, orderedIds })
        setClaimPriority({
          leagueId: activeLeague.id,
          week: claimsWeek,
          teamId: yourDraftTeamId,
          orderedIds: orderedClaimIds,
        });
        return;
      } catch {}
    }

    // Fallback: directly mutate claims array (works if your store is vanilla Zustand with setState)
    if (typeof (useTransactionsStore as any).setState === "function") {
      (useTransactionsStore as any).setState((s: any) => {
        const next = (s.claims ?? []).map((c: any) => {
          if (c.leagueId !== activeLeague.id) return c;
          if (c.week !== claimsWeek) return c;
          if (c.teamId !== yourDraftTeamId) return c;
          const idx = orderedClaimIds.indexOf(c.id);
          if (idx === -1) return c;
          return { ...c, priority: idx + 1 };
        });
        return { claims: next };
      });
    }
  };
  const serverIds = yourClaims.map((c: any) => String(c.id));
  const shownIds = moved && moved.length === serverIds.length && serverIds.every((id) => moved.includes(id)) ? moved : serverIds;
  const claimById = new Map(yourClaims.map((c: any) => [String(c.id), c]));

  const onMove = async (fromId: string, toId: string) => {
    const next = shownIds.slice();
    const from = next.indexOf(fromId);
    const to = next.indexOf(toId);
    if (from === -1 || to === -1) return;
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setMoved(next); // shows straight away
    persistPriorities(next);
    await fetch(`/api/waivers/claims/reorder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leagueId: activeLeague.id, week: claimsWeek, orderedIds: next }),
    });
    // reload from the server so the page matches what's saved
    await refreshTransactionsForLeague(activeLeague.id);
    setMoved(null);
  };

    return (
      <>
        <div style={{ ...listBox }}>
          <div style={{ padding: "10px 10px", fontSize: 14, fontWeight: 700 }}>
            Your {roundLabel(claimsWeek)} Claims

            <div style={{ marginTop: 4, fontSize: 10, fontWeight: 600, opacity: 0.65 }}>Drag a claim to change the order</div>

          </div>
<div
  style={{
    padding: "6px 14px",
    borderTop: "1px solid rgba(0,0,0,0.08)",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    fontSize: 10,
    fontWeight: 700,
    opacity: 0.7,
    display: "grid",
    gridTemplateColumns: "44px 1fr auto",
    gap: 10,
    alignItems: "center",
  }}
>
  <div>Priority</div>
  <div />
  <div />
</div>

          {yourClaims.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>No pending claims</div>
          ) : (
            <DragList ids={shownIds} onMove={(id, overId) => void onMove(id, overId)}>
              {(id) => {
                const c = claimById.get(id);
                if (!c) return null;
                const idx = shownIds.indexOf(id);
                const addP = allPlayers.find((x) => x.id === c.addPlayerId) ?? null;
                const dropP = allPlayers.find((x) => x.id === c.dropPlayerId) ?? null;
                return (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      display: "grid",
                      gridTemplateColumns: "44px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      cursor: "grab",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1, opacity: 0.45 }}>
                        ⋮⋮
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 13, width: 18, textAlign: "center" }}>{idx + 1}</div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {addP ? <JerseyTile teamCode={addP.teamCode} size={22} /> : null}
                        <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {addP ? shortName(addP) : c.addPlayerId}
                        </div>
                      </div>
                      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, opacity: 0.65 }}>OUT: {dropP ? shortName(dropP) : (c.dropPlayerId ?? "—")}</div>
                    </div>

                    <button
                      onClick={async () => {
                        if (!activeLeague?.id) return;
                        await fetch(`/api/waivers/claims?id=${encodeURIComponent(c.id)}`, { method: "DELETE" });
                        await refreshTransactionsForLeague(activeLeague.id);
                      }}
                      style={{
                        height: 28,
                        padding: "0 12px",
                        borderRadius: 999,
                        border: "none",
                        background: "rgba(239,68,68,0.92)",
                        color: "white",
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                );
              }}
            </DragList>
          )}
        </div>
        
      </>
    );
  }
