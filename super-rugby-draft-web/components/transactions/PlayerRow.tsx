"use client";
// components/transactions/PlayerRow.tsx
// One player in the Transactions page's Player Pool / Watchlist. Split out of
// app/transactions/page.tsx (21 Nov 2026); the page passes in what the row needs.
import React from "react";
import type { League } from "@/lib/league/types";
import type { InfoMode } from "@/components/transactions/playerMetrics";
import { JerseyTile, type Player } from "@/components/transactions/helpers";
import { StarButton, TxActionButton } from "@/components/transactions/bits";
import { positionsLabel } from "@/lib/players/positions";
import { StatusTag } from "@/components/StatusTag";
import { TX_COL_W, txRightWidth } from "@/components/transactions/PlayerListBox";

export type PlayerRowProps = {
  p: Player;
  yourDraftTeamId: string | null;
  activeLeague: League | null;
  ownerByPlayerId: Map<string, string>;
  lockedUnownedSet: Set<string>;
  watchlist: Record<string, boolean>;
  toggleWatchlist: (playerId: string) => void | Promise<void>;
  windowMode: "WAIVERS" | "FREE_AGENCY";
  tradeWindowOpen: boolean;
  enableTrades: boolean;
  infoMode: InfoMode;
  metricValue: (p: Player, mode: InfoMode) => string;
  teamLabel: (teamCode: string) => string;
  isAddCoolingDown: (playerId: string) => boolean;
  guardedAdd: (playerId: string, fn: () => void, cooldownMs?: number) => void;
  openDropModal: (addPlayer: Player) => void;
  goToTradeProposal: (partnerTeamId: string, requestPlayerId: string) => void;
  /** open the player card */
  openPlayer: (p: Player) => void;
  /** computers: the picked columns (in place of the single number) */
  columnModes?: InfoMode[];
};

/** One player in the Transactions page's Player Pool / Watchlist: jersey, name, status, the chosen number, watch star and the add / claim / trade button. */
export function PlayerRow({
  p, yourDraftTeamId, activeLeague, ownerByPlayerId, lockedUnownedSet, watchlist, toggleWatchlist, windowMode, tradeWindowOpen,
  enableTrades, infoMode, metricValue, teamLabel, isAddCoolingDown, guardedAdd, openDropModal, goToTradeProposal, openPlayer, columnModes,
}: PlayerRowProps) {
  const ENABLE_TRADES = enableTrades;
  // Ownership
  const ownerTeamId = ownerByPlayerId.get(p.id) ?? null;
  const isOwned = !!ownerTeamId;
  const isOwnedByYou = isOwned && ownerTeamId === yourDraftTeamId;

 const isTradeable = ENABLE_TRADES && isOwned && !isOwnedByYou && tradeWindowOpen;

  const locked = lockedUnownedSet.has(p.id);
  const coolingDown = isAddCoolingDown(p.id);
  const enabled = !isOwned && !locked && !coolingDown;

  const isStar = !!watchlist[p.id];

let btnLabel = "+";
let btnBg = windowMode === "WAIVERS" ? "#FACC15" : "#22C55E";
let btnFg: string = "white";

// Unowned disabled states (locked / cooldown)
if (!isOwned && !enabled) {
  btnBg = "rgba(15,23,42,0.25)";
  btnFg = "white";
}

// Owned by you
if (isOwnedByYou) {
  btnLabel = "ME";
  btnBg = "rgba(148,163,184,0.75)";
  btnFg = "white";
}

// Owned by someone else (DESIGN: always show trade icon)
if (isOwned && !isOwnedByYou) {
  btnLabel = "↔";
  btnBg = "#2563EB";
  btnFg = "white";
}

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `minmax(0, 1fr) ${txRightWidth(columnModes?.length)}px`,
        gap: 10,
        alignItems: "center",
        padding: "10px 10px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div
        onClick={() => openPlayer(p)}

        style={{
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <JerseyTile teamCode={p.teamCode} size={32} />

          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.firstName?.[0]}. {p.lastName}
              </div>
              <StatusTag player={p} />
            </div>

            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {teamLabel(p.teamCode)}

              {" — "}
              {positionsLabel(p)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {columnModes ? (
          columnModes.map((m) => (
            <div key={m} style={{ fontSize: 12, fontWeight: m === infoMode ? 700 : 500, width: TX_COL_W, textAlign: "center", color: m === infoMode ? "#0f172a" : "#334155" }}>
              {metricValue(p, m)}
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, fontWeight: 700, width: 40, textAlign: "center" }}>{metricValue(p, infoMode)}</div>
        )}

        <StarButton active={isStar} onClick={() => toggleWatchlist(p.id)} />

<TxActionButton
  enabled={isTradeable ? true : enabled}
  label={btnLabel}
  bg={btnBg}
  fg={btnFg}
  onClick={() => {
    // Trade (owned by someone else)
    if (isTradeable) {
      if (!ownerTeamId) return;
      goToTradeProposal(ownerTeamId, p.id);
      return;
    }

    // Owned by you (ME) -> do nothing
    if (isOwnedByYou) return;

    // Locked unowned player -> do nothing
    if (locked) return;

    // Add/Claim (unowned)
    guardedAdd(p.id, () => {
      if (!activeLeague?.id || !yourDraftTeamId) return;
      openDropModal(p);
    });
  }}
/>

      </div>
    </div>
  );
}
