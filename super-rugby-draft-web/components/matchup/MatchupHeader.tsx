"use client";
// components/matchup/MatchupHeader.tsx
// The Matchup page's top card: menu, title, the matchup arrows ("Matchup 2 of 4"), the round
// arrows and "Back to Round N" when looking at an earlier round. Moved out of app/matchup/page.tsx.
import React from "react";
import { roundLabel } from "@/lib/season";
import { card as themeCard } from "@/lib/ui/theme";

const card35: React.CSSProperties = { ...themeCard, padding: undefined };

function Hamburger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
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

export function MatchupHeader({
  onOpenMenu,
  canGo,
  matchupIdx,
  matchupCount,
  onPrevMatchup,
  onNextMatchup,
  mounted,
  displayWeek,
  latestWeek,
  goWeek,
}: {
  onOpenMenu: () => void;
  canGo: boolean;
  matchupIdx: number;
  matchupCount: number;
  onPrevMatchup: () => void;
  onNextMatchup: () => void;
  mounted: boolean;
  displayWeek: number;
  latestWeek: number;
  goWeek: (w: number) => void;
}) {
  return (
        <div
  style={{
    ...card35,
    padding: 14,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    position: "relative",   // ✅ allows bottom-right positioning
    minHeight: 92,          // ✅ ensures space for arrows
  }}
>

          {/* Top row (just hamburger) */}
<div style={{ display: "flex", alignItems: "center" }}>
  <Hamburger onClick={onOpenMenu} />
</div>
{/* Large page title */}
<div
  style={{
    marginTop: 10,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: "20px",
  }}
>
  Match Up
</div>

{/* Matchup navigation – bottom right */}
<div
  style={{
    position: "absolute",
    right: 12,
    bottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 4,
  }}
>
  <div style={{ position: "relative", width: 22, height: 22 }}>
  {/* Invisible big hitbox (does NOT affect layout) */}
  <button
    disabled={!canGo}
    onClick={() =>
      onPrevMatchup()
    }
    aria-label="Previous matchup"
    style={{
      position: "absolute",
      inset: -12,            // ✅ controls hitbox size (bigger click area)
      border: "none",
      background: "transparent",
      padding: 0,
      margin: 0,
      cursor: canGo ? "pointer" : "not-allowed",
    }}
  />

  {/* Visible arrow (not clickable; click goes to invisible button) */}
  <div
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center",
      pointerEvents: "none",
      color: canGo ? "#0f172a" : "rgba(15,23,42,0.25)",
      fontSize: 22,
      fontWeight: 700,
      lineHeight: "22px",
    }}
  >
    ‹
  </div>
</div>

  <div
    style={{
      fontSize: 13,
      fontWeight: 700,
      color: "#0f172a",
      whiteSpace: "nowrap",
    }}
  >
    {canGo ? `Matchup ${matchupIdx + 1} of ${matchupCount}` : "Matchup"}
  </div>

  <div style={{ position: "relative", width: 22, height: 22 }}>
  <button
    disabled={!canGo}
    onClick={onNextMatchup}
    aria-label="Next matchup"
    style={{
      position: "absolute",
      inset: -12,
      border: "none",
      background: "transparent",
      padding: 0,
      margin: 0,
      cursor: canGo ? "pointer" : "not-allowed",
    }}
  />

  <div
    aria-hidden="true"
    style={{
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center",
      pointerEvents: "none",
      color: canGo ? "#0f172a" : "rgba(15,23,42,0.25)",
      fontSize: 22,
      fontWeight: 700,
      lineHeight: "22px",
    }}
  >
    ›
  </div>
</div>
</div>

<div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, minHeight: 24 }}>
  {mounted && displayWeek > 0 ? (
    <button
      onClick={() => goWeek(displayWeek - 1)}
      disabled={displayWeek <= 1}
      aria-label="Previous round"
      style={{ border: "none", background: "transparent", padding: "0 4px", fontSize: 22, fontWeight: 700, lineHeight: "22px", color: displayWeek <= 1 ? "rgba(15,23,42,0.25)" : "#0f172a", cursor: displayWeek <= 1 ? "default" : "pointer" }}
    >
      ‹
    </button>
  ) : null}
  <span style={{ fontSize: 16, fontWeight: 700, opacity: 0.95 }}>{!mounted ? "Loading…" : displayWeek <= 0 ? "Pre-season" : roundLabel(displayWeek)}</span>
  {mounted && displayWeek > 0 ? (
    <button
      onClick={() => goWeek(displayWeek + 1)}
      disabled={displayWeek >= latestWeek}
      aria-label="Next round"
      style={{ border: "none", background: "transparent", padding: "0 4px", fontSize: 22, fontWeight: 700, lineHeight: "22px", color: displayWeek >= latestWeek ? "rgba(15,23,42,0.25)" : "#0f172a", cursor: displayWeek >= latestWeek ? "default" : "pointer" }}
    >
      ›
    </button>
  ) : null}
</div>

{/* looking at an earlier round: a way straight back (top right of the card) */}
{mounted && displayWeek > 0 && displayWeek < latestWeek ? (
  <button
    onClick={() => goWeek(latestWeek)}
    style={{ position: "absolute", top: 18, right: 14, border: "1px solid #99f6e4", background: "#f0fdfa", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#0f766e", cursor: "pointer" }}
  >
    Back to {roundLabel(latestWeek)} ›
  </button>
) : null}

        </div>
  );
}
