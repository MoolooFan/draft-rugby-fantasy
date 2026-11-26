"use client";
// components/draftRoom/Modals.tsx
// The Draft Room's pop-ups: "Draft the following player?" and the Draft Order.
import React from "react";
import type { Player } from "@/lib/draft/types";
import { positionsLabel } from "@/lib/players/positions";
import { JerseyTile, ModalOverlay } from "./ui";

export function DraftConfirmModal({ player, onCancel, onConfirm }: { player: Player; onCancel: () => void; onConfirm: () => void }) {
  const button: React.CSSProperties = { height: 34, borderRadius: 10, border: "none", color: "white", fontWeight: 500, fontSize: 14, cursor: "pointer" };
  return (
    <ModalOverlay onClose={onCancel}>
      <div style={{ borderRadius: 12, background: "rgba(255,255,255,0.92)", border: "1px solid rgba(0,0,0,0.12)", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", padding: 12, color: "#0f172a" }}>
        <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 10 }}>Draft the following player?</div>
        <div
          style={{
            borderRadius: 10,
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            padding: 10,
            display: "grid",
            gridTemplateColumns: "1fr 70px",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <JerseyTile teamCode={player.teamCode} size={40} />
            <div>
              <div style={{ fontWeight: 500, fontSize: 12 }}>
                {player.firstName[0]}. {player.lastName}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {player.teamCode} — {positionsLabel(player)}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.65 }}>Draft Rank</div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{player.draftRank}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
          <button onClick={onCancel} style={{ ...button, background: "#EF4444" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ ...button, background: "#10B981" }}>
            Confirm
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/** Round 1's order (Ethan, 25 Nov 2026), from "First Pick" before the draft. */
export function DraftOrderModal({
  teams,
  yourTeamId,
  preDraft,
  onClose,
}: {
  teams: Array<{ id: string; name: string; ownerName: string | null }>;
  yourTeamId: string;
  preDraft: boolean;
  onClose: () => void;
}) {
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ borderRadius: 14, background: "#ffffff", color: "#0f172a", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", padding: 14, maxHeight: "80svh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Draft Order</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline", color: "#0f172a" }}>
            Close
          </button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
          Round 1. The order snakes: the last team picks first in round 2, and so on.
          {preDraft ? " It's shuffled again when a team joins, until the commissioner sets it." : ""}
        </div>
        <div style={{ marginTop: 10, display: "grid" }}>
          {teams.map((t, i) => (
            <div key={t.id} style={{ display: "grid", gridTemplateColumns: "28px 1fr", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: t.id === yourTeamId ? 700 : 600 }}>
                  {t.name}
                  {t.id === yourTeamId ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: "#0d9488" }}>You</span> : null}
                </div>
                {t.ownerName ? <div style={{ fontSize: 11, opacity: 0.65 }}>{t.ownerName}</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalOverlay>
  );
}
