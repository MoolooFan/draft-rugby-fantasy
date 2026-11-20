"use client";
// components/transactions/DropSelectModal.tsx
// The Transactions page's add / claim pop-up: the player you're signing and which of your
// players to replace (or none, if your squad has room). Split out of app/transactions/page.tsx
// (21 Nov 2026).
import React from "react";
import { JerseyTile, NO_DROP, type Player } from "@/components/transactions/helpers";
import { positionsLabel } from "@/lib/players/positions";
import { PlusMinusIcon } from "@/components/PlusMinusIcon";

export type DropSelectModalProps = {
  dropModalOpen: boolean;
  proposeMode: "WAIVER" | "FREE_AGENCY";
  proposedAddPlayer: Player | null;
  selectedDropPlayerId: string | null;
  setSelectedDropPlayerId: (id: string | null) => void;
  submittingProposedTransaction: boolean;
  droppableCandidates: Player[];
  yourRosterPlayers: Player[];
  hasFreePlace: boolean;
  fullTeamName: (teamCode: string) => string;
  closeDropModal: () => void;
  submitProposedTransaction: () => Promise<void>;
};

/** The add / claim pop-up: the player you're adding and which of yours to drop (or none if there's room). */
export function DropSelectModal({
  dropModalOpen, proposeMode, proposedAddPlayer, selectedDropPlayerId, setSelectedDropPlayerId, submittingProposedTransaction,
  droppableCandidates, yourRosterPlayers, hasFreePlace, fullTeamName, closeDropModal, submitProposedTransaction,
}: DropSelectModalProps) {
    if (!dropModalOpen || !proposedAddPlayer) return null;

    const confirmBg = proposeMode === "WAIVER" ? "#FACC15" : "#22C55E";
    const confirmText = submittingProposedTransaction
      ? "Processing..."
      : proposeMode === "WAIVER"
        ? "Submit Claim"
        : "Confirm";

    const confirmFg = proposeMode === "WAIVER" ? "#0f172a" : "white";

    const canConfirm = !!selectedDropPlayerId && !submittingProposedTransaction;

    return (
            <div
  onClick={() => {
    if (submittingProposedTransaction) return;
    closeDropModal();
  }}
  style={{
    position: "fixed",
    inset: 0,
    zIndex: 80,
    background: "rgba(0,0,0,0.72)", // darker overlay
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
    background: "#FFFFFF", // solid
    boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
    maxHeight: "78vh",
    display: "flex",
    flexDirection: "column",
    color: "#0f172a", // force readable text inside
  }}
>

{/* Top: signing */}
<div style={{ borderBottom: "1px solid rgba(15,23,42,0.12)" }}>
  {/* Dark label bar */}
  <div
    style={{
      padding: "10px 12px",
      background: "#0f172a",
      color: "white",
    }}
  >
    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.95 }}>
      You have requested to sign:
    </div>
  </div>

  {/* Light player row */}
  <div
    style={{
      padding: "12px 12px",
      background: "#FFFFFF",
      color: "#0f172a",
    }}
  >
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "34px 1fr",
        gap: 10,
        alignItems: "center",
      }}
    >
      <JerseyTile teamCode={proposedAddPlayer.teamCode} size={30} />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {proposedAddPlayer.firstName?.[0]}. {proposedAddPlayer.lastName}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.9 }}>
          {fullTeamName(proposedAddPlayer.teamCode)} — {positionsLabel(proposedAddPlayer)}

        </div>
      </div>
    </div>
  </div>
</div>

<style>{`
  .drop-scroll::-webkit-scrollbar { display: none; }
`}</style>

          {/* Middle: drop list (scrollable) */}
          <div
  style={{
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "#0f172a",
    color: "white",
  }}
>
  <div style={{ fontSize: 12, fontWeight: 700 }}>
    Which player would you like to replace?
  </div>
</div>

<div
  className="drop-scroll"
  style={{
    flex: 1,
    overflowY: "auto",
    scrollbarWidth: "none", // Firefox
    msOverflowStyle: "none", // IE/Edge legacy
  }}
>

            {hasFreePlace ? (
              <div
                style={{
                  padding: "10px 12px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center",
                  background: selectedDropPlayerId === NO_DROP ? "rgba(34,197,94,0.14)" : "transparent",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  No one - use your free place
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>You have {yourRosterPlayers.length} players (a player is in IR)</div>
                </div>
                <button
                  onClick={() => setSelectedDropPlayerId(NO_DROP)}
                  style={{
                    height: 32,
                    padding: "0 10px",
                    borderRadius: 10,
                    border: "none",
                    background: "rgba(34,197,94,0.9)",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {selectedDropPlayerId === NO_DROP ? "Selected" : "Select"}
                </button>
              </div>
            ) : null}
            {droppableCandidates.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, fontWeight: 600, opacity: 0.75 }}>
                No valid drop options found (position restrictions).
              </div>
            ) : (
              droppableCandidates.map((p) => {
                const selected = selectedDropPlayerId === p.id;
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: "10px 12px",
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      display: "grid",
                      gridTemplateColumns: "34px 1fr auto",
                      gap: 10,
                      alignItems: "center",
                      background: selected ? "rgba(239,68,68,0.12)" : "transparent",

                    }}
                  >
                    <JerseyTile teamCode={p.teamCode} size={28} />

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.firstName?.[0]}. {p.lastName}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>
                        {fullTeamName(p.teamCode)} — {positionsLabel(p)}

                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedDropPlayerId(p.id)}
                      aria-label="Select to drop"
                      style={{
                        width: selected ? 86 : 32,     // wider when selected
                        
                        height: 32,
                        borderRadius: 10,
                        border: "none",
                        background: selected ? "rgba(239,68,68,0.92)" : "rgba(239,68,68,0.85)",
                        color: "white",
                        fontWeight: 700,
                        fontSize: selected ? 11 : 20, // smaller text for “Dropping”
                        cursor: "pointer",
                        padding: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selected ? "Dropping" : <PlusMinusIcon kind="minus" size={15} />}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom: actions (always visible) */}
          <div
            style={{
              padding: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              background: "rgba(255,255,255,0.98)",
              borderTop: "1px solid rgba(0,0,0,0.10)",
            }}
          >
                        <button
              disabled={submittingProposedTransaction}
              onClick={() => {
                if (submittingProposedTransaction) return;
                closeDropModal();
              }}
              style={{
                height: 38,
                borderRadius: 12,
                border: "2px solid rgba(239,68,68,0.9)",
                background: "transparent",
                color: "rgba(239,68,68,0.95)",
                fontWeight: 700,
                cursor: submittingProposedTransaction ? "not-allowed" : "pointer",
                opacity: submittingProposedTransaction ? 0.55 : 1,
              }}
            >
              Cancel
            </button>

                        <button
              disabled={!canConfirm}
              onClick={submitProposedTransaction}
              style={{
                height: 38,
                borderRadius: 12,
                border: "none",
                background: canConfirm ? confirmBg : "rgba(0,0,0,0.20)",
                color: canConfirm ? confirmFg : "rgba(255,255,255,0.75)",
                fontWeight: 700,
                cursor: canConfirm ? "pointer" : "not-allowed",
                opacity: submittingProposedTransaction ? 0.9 : 1,
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  }
