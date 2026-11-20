"use client";
// components/transactions/TxHeader.tsx
// The top of the Transactions page: the white card (menu button, title), the deadline banner and
// the four tabs (with the red count of trade offers waiting for you). Moved out of
// app/transactions/page.tsx.
import React from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { roundLabel } from "@/lib/season";
import type { TabKey } from "./helpers";

const card35: React.CSSProperties = { ...themeCard, padding: undefined };

const tabBarStyle: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 10,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.18)",
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  height: 30,
  border: "none",
  background: active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)",
  color: "white",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
});

function Hamburger({ onOpenMenu }: { onOpenMenu: () => void }) {
    return (
      <button
        onClick={onOpenMenu}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "inherit",
          fontSize: 30,
          fontWeight: 700,
          lineHeight: "30px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }

export function TxHeaderCard({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
  <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Hamburger onOpenMenu={onOpenMenu} />
      <div style={{ flex: 1 }} />
    </div>

    <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>Transactions</div>
    
  </div>
  );
}

export function DeadlineBanner({ selectionWeek, deadlineLabel, deadlineText }: { selectionWeek: number; deadlineLabel: string; deadlineText: string }) {
    return (
      <div
        style={{
          marginTop: 10,
          borderRadius: 999,
          overflow: "hidden",
          boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            background: "#FACC15",
            color: "#0f172a",
            textAlign: "center",
            padding: "6px 12px",
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {roundLabel(selectionWeek)} • {deadlineLabel}
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.88)",
            color: "#0f172a",
            textAlign: "center",
            padding: "6px 12px",
            fontWeight: 500,
            fontSize: 11,
            borderTop: "1px solid rgba(15,23,42,0.12)",
          }}
        >
          {deadlineText}
        </div>
      </div>
    );
  }

export function TxTabs({ tab, onTab, pendingOffersCount }: { tab: TabKey; onTab: (t: TabKey) => void; pendingOffersCount: number }) {
  const tabs: TabKey[] = ["Player Pool", "Watchlist", "Pending Claims", "Transactions"];

  const badgeStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    padding: "0 5px",
    borderRadius: 999,
    background: "#EF4444",
    color: "white",
    fontSize: 10,
    fontWeight: 700,
    display: "grid",
    placeItems: "center",
    lineHeight: "16px",
    boxShadow: "0 6px 14px rgba(0,0,0,0.20)",
  };

  return (
    <div style={tabBarStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {tabs.map((t) => {
          const isActive = t === tab;
          const showBadge = t === "Transactions" && pendingOffersCount > 0;

          return (
            <button
              key={t}
              onClick={() => onTab(t)}
              style={{
                ...tabBtn(isActive),
                position: "relative", // ✅ required so badge anchors to the button
              }}
            >
              {t}

              {showBadge ? (
                <span style={badgeStyle}>
                  {pendingOffersCount > 99 ? "99+" : pendingOffersCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
