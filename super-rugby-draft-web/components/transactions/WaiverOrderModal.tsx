"use client";
// components/transactions/WaiverOrderModal.tsx
// The full waiver order, opened from "Your waiver priority" on the Transactions tab (Ethan,
// 28 Nov 2026). If the league gives the Shield holder the first pick, that comes first: the
// holder picks first in round 1 of the claims, then the usual order.
import React from "react";
import { ShieldIcon } from "@/components/AwardIcons";
import { ink, muted } from "@/lib/ui/theme";

export function WaiverOrderModal({
  rows,
  teams,
  yourTeamId,
  shieldTeamId,
  flipped,
  onClose,
}: {
  /** the order, rank 1 first */
  rows: Array<{ teamId: string; rank: number }>;
  teams: Array<{ id: string; name: string }>;
  yourTeamId: string | null;
  /** the Shield holder, when the league gives them the first pick */
  shieldTeamId: string | null;
  /** a finals week with the order flipped */
  flipped: boolean;
  onClose: () => void;
}) {
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "—";
  const ordered = [...rows].sort((a, b) => a.rank - b.rank);
  const line = (mine: boolean): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: "28px 1fr",
    alignItems: "center",
    gap: 8,
    padding: "9px 10px",
    borderRadius: 10,
    background: mine ? "#ecfdf5" : "#f6f8fa",
    border: `1px solid ${mine ? "#a7f3d0" : "#e5e9ef"}`,
    fontSize: 13,
    fontWeight: mine ? 700 : 600,
  });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        role="dialog"
        aria-label="Waiver order"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, maxHeight: "86svh", overflowY: "auto", background: "#ffffff", color: ink, borderRadius: 18, padding: 14, display: "grid", gap: 8, boxShadow: "0 20px 50px rgba(15,23,42,0.35)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Waiver Order</div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, fontWeight: 700, color: muted, cursor: "pointer" }}>
            ×
          </button>
        </div>
        {flipped ? <div style={{ fontSize: 12, color: muted }}>Finals: the order is flipped, so the top seed picks first.</div> : null}

        {shieldTeamId ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: muted, marginTop: 4 }}>First pick</div>
            <div style={line(shieldTeamId === yourTeamId)}>
              <ShieldIcon size={22} title="Shield holder" />
              <div>
                {nameOf(shieldTeamId)}
                <div style={{ fontSize: 11, fontWeight: 500, color: muted }}>Shield holder: first claim in round 1</div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: muted, marginTop: 6 }}>Then</div>
          </>
        ) : null}

        {ordered.length ? (
          ordered.map((r) => (
            <div key={r.teamId} style={line(r.teamId === yourTeamId)}>
              <div style={{ color: muted, fontWeight: 700 }}>{r.rank}</div>
              <div>{nameOf(r.teamId)}</div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 13, color: muted }}>The waiver order isn&apos;t set yet.</div>
        )}
      </div>
    </div>
  );
}
