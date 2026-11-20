"use client";
// components/transactions/ConfirmAcceptTradeModal.tsx
// The Transactions page's "accept this trade?" pop-up. Split out of app/transactions/page.tsx
// (21 Nov 2026).
import React from "react";
import { JerseyTile, shortName, type Player } from "@/components/transactions/helpers";

export type ConfirmAcceptTradeModalProps = {
  confirmOpen: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmTrade: any | null;
  allPlayers: Player[];
  closeConfirm: () => void;
  confirmAcceptTrade: () => void;
};

/** "Accept this trade?": the players you get and give, before the trade goes through. */
export function ConfirmAcceptTradeModal({ confirmOpen, confirmTrade, allPlayers, closeConfirm, confirmAcceptTrade }: ConfirmAcceptTradeModalProps) {
  if (!confirmOpen || !confirmTrade) return null;

  // helpers already exist in file: shortName(), jersey, etc.
  const offerIds: string[] = confirmTrade.offerPlayerIds ?? [];
  const requestIds: string[] = confirmTrade.requestPlayerIds ?? [];

  const offerPlayers = offerIds
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter(Boolean) as any[];

  const requestPlayers = requestIds
    .map((id) => allPlayers.find((p) => p.id === id))
    .filter(Boolean) as any[];

  return (
    <div
      onClick={closeConfirm}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.72)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          borderRadius: 18,
          overflow: "hidden",
          background: "#fff",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          color: "#0f172a",
        }}
      >
        <div style={{ padding: 12, background: "#0f172a", color: "white" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Confirm Trade</div>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>
            This will swap the selected players immediately.
          </div>
        </div>

        <div style={{ padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>You receive</div>
          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
            {offerPlayers.length ? (
              offerPlayers.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <JerseyTile teamCode={p.teamCode} size={22} />
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{shortName(p)}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>—</div>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 12 }}>You send</div>
          <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
            {requestPlayers.length ? (
              requestPlayers.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <JerseyTile teamCode={p.teamCode} size={22} />
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{shortName(p)}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>—</div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            borderTop: "1px solid rgba(15,23,42,0.12)",
            background: "rgba(255,255,255,0.98)",
          }}
        >
          <button
            onClick={closeConfirm}
            style={{
              height: 38,
              borderRadius: 12,
              border: "2px solid rgba(239,68,68,0.9)",
              background: "transparent",
              color: "rgba(239,68,68,0.95)",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>

          <button
            onClick={confirmAcceptTrade}
            style={{
              height: 38,
              borderRadius: 12,
              border: "none",
              background: "rgba(34,197,94,0.95)",
              color: "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
