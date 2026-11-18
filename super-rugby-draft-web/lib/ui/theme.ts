// lib/ui/theme.ts
// The site's look in one place (design refresh, Ethan, 18 Nov 2026: "C1" = the same layout and
// navy -> teal -> green gradient, with the Barlow font, lighter text and solid white cards).
// Pages use these instead of their own copies, so a colour or size changes everywhere at once.
import type React from "react";

export const ink = "#0f172a"; // main text
export const muted = "#64748b"; // secondary text
export const line = "#e5e9ef"; // borders / dividers inside cards
export const soft = "#f6f8fa"; // inner boxes inside white cards
export const teal = "#0d9488"; // links and highlights
export const amber = "#f59e0b";
export const violet = "#7c3aed";

/** Scoreboard-style numbers (scores, points, projections). */
export const num: React.CSSProperties = {
  fontFamily: "var(--font-barlow-condensed), var(--font-barlow), Arial, sans-serif",
  fontVariantNumeric: "tabular-nums",
};

/** The main white card every page uses (dark text inside). */
export const card: React.CSSProperties = {
  borderRadius: 16,
  background: "#ffffff",
  color: ink,
  padding: 14,
  boxShadow: "0 6px 20px rgba(15,23,42,0.12)",
};

/** A box inside a white card (rows, lists, fixtures). */
export const innerBox: React.CSSProperties = {
  borderRadius: 12,
  background: soft,
  border: `1px solid ${line}`,
  color: ink,
};

/** Card titles ("Upcoming Fixture", "Player of the Week"...). */
export const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: ink };

/** Main buttons (navy -> blue), and lighter secondary ones. */
export const primaryButton: React.CSSProperties = {
  height: 38,
  width: "100%",
  borderRadius: 999,
  background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
  color: "white",
  fontSize: 14,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
};
export const secondaryButton: React.CSSProperties = {
  height: 36,
  width: "100%",
  borderRadius: 999,
  background: "#eef2f6",
  color: ink,
  fontSize: 13,
  fontWeight: 600,
  border: `1px solid ${line}`,
  cursor: "pointer",
};
