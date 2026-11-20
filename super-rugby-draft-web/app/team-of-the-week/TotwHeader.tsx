"use client";
// app/team-of-the-week/TotwHeader.tsx
// The Team of the Week top card: title, Close, the round picker (‹ Round 8 ›) and the team's
// total points. Moved out of page.tsx.
import React from "react";
import { roundLabel } from "@/lib/season";

const headerCard: React.CSSProperties = {
  borderRadius: 16,
  background: "#ffffff",
  color: "#0f172a",
  boxShadow: "0 6px 20px rgba(15,23,42,0.12)",
  padding: 12,
};

const weekBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 10,
  border: "1px solid #d5dce4",
  background: "#eef2f6",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
  display: "grid",
  placeItems: "center",
};

export function TotwHeader({
  week,
  maxFantasyWeek,
  totalPoints,
  onPrev,
  onNext,
  onClose,
}: {
  week: number;
  maxFantasyWeek: number;
  totalPoints: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
  <div style={headerCard}>
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ fontWeight: 700, fontSize: 26, opacity: 0.9 }}>Team of the Week</div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          border: "1px solid #d5dce4",
          background: "#eef2f6",
          color: "#0f172a",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        ✕
      </button>
    </div>

    <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
      <button
        style={{ ...weekBtn, opacity: week <= 1 ? 0.35 : 1, cursor: week <= 1 ? "default" : "pointer" }}
        onClick={onPrev}
        disabled={week <= 1}
        aria-label="Previous week"
      >
        ‹
      </button>

      <div style={{ fontWeight: 700, fontSize: 12 }}>{roundLabel(week)}</div>

      <button
        style={{
          ...weekBtn,
          opacity: week >= maxFantasyWeek ? 0.35 : 1,
          cursor: week >= maxFantasyWeek ? "default" : "pointer",
        }}
        onClick={onNext}
        disabled={week >= maxFantasyWeek}
        aria-label="Next week"
      >
        ›
      </button>
    </div>

    <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          minWidth: 90,
          textAlign: "center",
          padding: "10px 14px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.85)",
          color: "#0f172a",
          fontWeight: 700,
          fontSize: 26,
          boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
        }}
      >
        {totalPoints}
      </div>
    </div>
  </div>
  );
}
