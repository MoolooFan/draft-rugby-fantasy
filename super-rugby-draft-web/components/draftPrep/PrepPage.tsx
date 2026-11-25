"use client";
// components/draftPrep/PrepPage.tsx
// The frame for the Mock Draft page: the site's background, the
// white header card with the menu button and title, and the menu.
import React, { useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import { card, ink, line, muted, teal } from "@/lib/ui/theme";

export function PrepPage({
  title,
  subtitle,
  activeItem,
  headerExtra,
  children,
}: {
  title: string;
  subtitle?: string;
  activeItem: "Mock Draft";
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }} />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 12px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ ...card, borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: "calc(14px + env(safe-area-inset-top, 0px))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              style={{ background: "transparent", border: "none", padding: 0, color: "inherit", fontSize: 30, fontWeight: 700, lineHeight: "30px", cursor: "pointer" }}
            >
              ☰
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 2, fontSize: 12, fontWeight: 500, color: muted }}>{subtitle}</div> : null}
          {headerExtra}
        </div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>{children}</div>
      </div>
      <AppMenu open={menuOpen} onClose={() => setMenuOpen(false)} leagues={leagues} activeLeagueId={activeLeagueId ?? null} setActiveLeague={setActiveLeague} activeItem={activeItem} />
    </main>
  );
}

/** A row of tab buttons inside a white card. */
export function PrepTabs<T extends string>({ tabs, active, onChange }: { tabs: readonly T[]; active: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" style={{ display: "grid", gridTemplateColumns: `repeat(${tabs.length}, 1fr)`, gap: 4, background: "#eef2f6", borderRadius: 12, padding: 3 }}>
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === active}
          onClick={() => onChange(t)}
          style={{
            height: 32,
            border: "none",
            borderRadius: 9,
            background: t === active ? "white" : "transparent",
            boxShadow: t === active ? "0 1px 3px rgba(15,23,42,0.15)" : "none",
            color: t === active ? ink : muted,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            padding: "0 4px",
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/** Small round chip buttons (choices like "My default" / a league). */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 30,
        padding: "0 12px",
        borderRadius: 999,
        border: `1px solid ${active ? teal : line}`,
        background: active ? "rgba(13,148,136,0.1)" : "white",
        color: active ? teal : ink,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** − n + stepper. */
export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const btn: React.CSSProperties = { width: 30, height: 30, borderRadius: 999, border: `1px solid ${line}`, background: "white", color: ink, fontSize: 16, fontWeight: 700, cursor: "pointer", lineHeight: "26px" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button aria-label={`Fewer ${label}`} style={{ ...btn, opacity: value <= min ? 0.35 : 1 }} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <div style={{ minWidth: 22, textAlign: "center", fontSize: 15, fontWeight: 700 }} aria-live="polite">{value}</div>
      <button aria-label={`More ${label}`} style={{ ...btn, opacity: value >= max ? 0.35 : 1 }} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
