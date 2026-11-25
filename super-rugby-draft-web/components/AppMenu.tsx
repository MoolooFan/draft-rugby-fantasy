"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { League } from "@/lib/league/types";
import { currentSeasonYear } from "@/lib/season";
import { getActiveUserProfile } from "@/lib/session";
import { useChatUnread } from "@/lib/chat/store";
import { ChatIcon } from "@/components/ChatIcon";

type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Draft Strategy"
  | "Mock Draft"
  | "Fixtures"
  | "Team Details"
  | "Stats Hub"
  | "Account"
  | "Admin";

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
  const unread = useChatUnread((s) => s.unread);
  if (!open) return null;

  function onMenuSelect(item: ActiveMenu) {
    onClose();

    if (item === "Dashboard") router.replace("/dashboard");
    if (item === "League") router.push("/league");
    if (item === "Draft Room") router.push("/draft-room");
    if (item === "Draft Strategy") router.push("/draft-strategy");
    if (item === "Mock Draft") router.push("/mock-draft");

        // Pages
    if (item === "Transactions") router.push("/transactions");
    if (item === "Matchup") router.push("/matchup");
    if (item === "Team Selection") router.push("/team-selection");
    if (item === "Fixtures") router.push("/fixtures");
    if (item === "Team Details") router.push("/team-details");
    if (item === "Stats Hub") router.push("/stats-hub");
    if (item === "Account") router.push("/account");
    if (item === "Admin") router.push("/admin");

  }

  // No league joined yet: only the pages that work without one (plan item E2). The Stats Hub
  // (was the no-league Player Pool) is for everyone (16 Nov 2026). Draft Strategy and Mock Draft
  // work with or without a league (21 Nov 2026).
  const hasLeague = (leagues ?? []).length > 0;
  const items: ActiveMenu[] = [
    ...((hasLeague
      ? ["Dashboard", "Matchup", "Team Selection", "Transactions", "Stats Hub", "League", "Draft Room", "Draft Strategy", "Mock Draft", "Fixtures", "Team Details", "Account"]
      : ["Dashboard", "League", "Draft Strategy", "Mock Draft", "Fixtures", "Stats Hub", "Account"]) as ActiveMenu[]),
    // only for the site admin (the server checks again on the admin page)
    ...(getActiveUserProfile()?.isSiteAdmin ? (["Admin"] as ActiveMenu[]) : []),
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
          bottom: 0,
          width: "78%",
          maxWidth: 320,
          padding: 16,
          paddingTop: `calc(16px + max(0px, calc(env(safe-area-inset-top, 0px) - 10px)))`,
          paddingBottom: `calc(16px + env(safe-area-inset-bottom, 0px))`,
          background:
            "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto", // 14 items: scrolls on short phones
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600, fontStyle: "italic", fontSize: 16, flex: 1 }}>
            Draft Fantasy {currentSeasonYear()}
          </div>
          {hasLeague ? (
            <button
              onClick={() => {
                onClose();
                router.push("/chat");
              }}
              aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
              style={{
                position: "relative",
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.45)",
                background: "rgba(255,255,255,0.14)",
                color: "white",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <ChatIcon size={18} color="white" />
              {unread ? (
                <span
                  style={{
                    position: "absolute",
                    top: -5,
                    right: -5,
                    minWidth: 17,
                    height: 17,
                    padding: "0 4px",
                    borderRadius: 999,
                    background: "#EF4444",
                    color: "white",
                    fontSize: 10,
                    fontWeight: 700,
                    display: "grid",
                    placeItems: "center",
                    border: "2px solid rgba(255,255,255,0.9)",
                  }}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </button>
          ) : null}
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              fontSize: 22,
              fontWeight: 700,
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

        {/* Swap League (also on the Account page) */}
        {hasLeague ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, opacity: 0.95 }}>
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
                fontWeight: 500,
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
        ) : null}
      </aside>
    </div>
  );
}
