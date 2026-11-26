"use client";
// components/dashboard/DashboardHeader.tsx
// The Dashboard's top: the menu button and the deadline banner (waivers / team selection; none
// before the draft).
// Moved out of app/dashboard/page.tsx.
import React from "react";

export function DashboardHeader({ onOpenMenu, bannerTitle, bannerTime }: { onOpenMenu: () => void; bannerTitle: string | null; bannerTime: string }) {
  return (
      <>

        {/* Hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <button
    onClick={onOpenMenu}
    aria-label="Open menu"
    style={{
      background: "transparent",
      border: "none",
      padding: 0,
      margin: 0,
      color: "inherit",
      fontSize: 36,
      fontWeight: 700,
      lineHeight: "36px",
      cursor: "pointer",
    }}
  >
    ☰
  </button>

  <div style={{ flex: 1 }} />
</div>

        {/* Deadline banner */}
        {bannerTitle == null ? null : <div
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
              fontWeight: 600,
              fontSize: 11,
            }}
          >
            {bannerTitle}
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
            {bannerTime}
          </div>
        </div>}
      </>
  );
}
