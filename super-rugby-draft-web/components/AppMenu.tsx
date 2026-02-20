"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { League } from "@/lib/league/types";

type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Fixtures"
  | "Team Details";

export function AppMenu({
  open,
  onClose,
  leagues,
  activeLeagueId,
  setActiveLeague,
  activeItem,
}: {
  open: boolean;
  onClose: () => void;
  leagues: League[];
  activeLeagueId: string | null;
  setActiveLeague: (id: string) => void;
  activeItem: ActiveMenu;
}) {
  const router = useRouter();
  if (!open) return null;

  function onMenuSelect(item: ActiveMenu) {
    onClose();

    if (item === "Dashboard") router.replace("/dashboard");
    if (item === "League") router.push("/league");
    if (item === "Draft Room") router.push("/draft-room");

        // Pages
    if (item === "Transactions") router.push("/transactions");
    if (item === "Matchup") router.push("/matchup");
    if (item === "Team Selection") router.push("/team-selection");
    if (item === "Fixtures") router.push("/fixtures");
    if (item === "Team Details") router.push("/team-details");

  }

  const items: ActiveMenu[] = [
    "Dashboard",
    "Matchup",
    "Team Selection",
    "Transactions",
    "League",
    "Draft Room",
    "Fixtures",
    "Team Details",
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100svh",
          width: "78%",
          maxWidth: 320,
          padding: 16,
          paddingBottom: `calc(16px + env(safe-area-inset-bottom))`,
          background:
            "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          color: "white",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontStyle: "italic", fontSize: 16 }}>
            Draft Fantasy 2026
          </div>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              fontSize: 22,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* Items */}
        <div style={{ marginTop: 18, display: "grid", gap: 6 }}>
          {items.map((it) => {
            const isActive = it === activeItem;

            return (
              <button
                key={it}
                onClick={() => onMenuSelect(it)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: isActive ? "rgba(255,255,255,0.25)" : "transparent",
                  border: "none",
                  color: "white",
                  fontSize: 14,
                  fontWeight: isActive ? 800 : 600,
                  cursor: "pointer",
                }}
              >
                {it}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Swap League */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8, opacity: 0.95 }}>
            Swap League
          </div>

          <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 10, padding: "8px 10px" }}>
            <select
              value={activeLeagueId ?? ""}
              onChange={(e) => setActiveLeague(e.target.value)}
              style={{
                width: "100%",
                height: 34,
                borderRadius: 8,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </aside>
    </div>
  );
}
