"use client";
// components/AppMenu.tsx
// The site menu. On phones it's the drawer each page opens with its ☰ button (AppMenu). On a
// computer (1024 px and wider) the same menu sits on the left all the time (DesktopSidebar, in
// app/layout.tsx) and the ☰ buttons are hidden (app/globals.css; Ethan, 27 Nov 2026).

import React, { useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { League } from "@/lib/league/types";
import { currentSeasonYear } from "@/lib/season";
import { getActiveUserProfile } from "@/lib/session";
import { useChatUnread } from "@/lib/chat/store";
import { useLeagueStore } from "@/lib/league/store";
import { ChatIcon } from "@/components/ChatIcon";

type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Mock Draft"
  | "Fixtures"
  | "Team Details"
  | "Stats Hub"
  | "Account"
  | "Admin";

const PATHS: Record<ActiveMenu, string> = {
  Dashboard: "/dashboard",
  Matchup: "/matchup",
  "Team Selection": "/team-selection",
  Transactions: "/transactions",
  League: "/league",
  "Draft Room": "/draft-room",
  "Mock Draft": "/mock-draft",
  Fixtures: "/fixtures",
  "Team Details": "/team-details",
  "Stats Hub": "/stats-hub",
  Account: "/account",
  Admin: "/admin",
};

const GRADIENT = "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))";

/** The menu itself: title (+ chat), the pages, and Swap League. */
function MenuContents({
  leagues,
  activeLeagueId,
  setActiveLeague,
  activeItem,
  onClose,
}: {
  leagues: League[];
  activeLeagueId: string | null;
  setActiveLeague: (id: string) => void;
  activeItem: ActiveMenu | null;
  /** the phone drawer's close (none in the sidebar) */
  onClose?: () => void;
}) {
  const router = useRouter();
  const unread = useChatUnread((s) => s.unread);

  function go(item: ActiveMenu) {
    onClose?.();
    if (item === "Dashboard") router.replace(PATHS[item]);
    else router.push(PATHS[item]);
  }

  // No league joined yet: only the pages that work without one (plan item E2). The Stats Hub
  // (was the no-league Player Pool) is for everyone (16 Nov 2026). Mock Draft isn't in the menu
  // (26 Nov 2026): it's on the Dashboard before the draft and in the Draft Room.
  const hasLeague = (leagues ?? []).length > 0;
  const items: ActiveMenu[] = [
    ...((hasLeague
      ? ["Dashboard", "Matchup", "Team Selection", "Transactions", "Stats Hub", "League", "Draft Room", "Fixtures", "Team Details", "Account"]
      : ["Dashboard", "League", "Fixtures", "Stats Hub", "Account"]) as ActiveMenu[]),
    // only for the site admin (the server checks again on the admin page)
    ...(getActiveUserProfile()?.isSiteAdmin ? (["Admin"] as ActiveMenu[]) : []),
  ];

  return (
    <>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 600, fontStyle: "italic", fontSize: 16, flex: 1 }}>Draft Fantasy {currentSeasonYear()}</div>
        {hasLeague ? (
          <button
            onClick={() => {
              onClose?.();
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
        {onClose ? (
          <button onClick={onClose} aria-label="Close menu" style={{ background: "transparent", border: "none", color: "white", fontSize: 22, fontWeight: 700, cursor: "pointer" }}>
            ×
          </button>
        ) : null}
      </div>

      {/* Items */}
      <nav style={{ marginTop: 18, display: "grid", gap: 6 }}>
        {items.map((it) => {
          const isActive = it === activeItem;
          return (
            <button
              key={it}
              onClick={() => go(it)}
              aria-current={isActive ? "page" : undefined}
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
      </nav>

      <div style={{ flex: 1 }} />

      {/* Swap League (also on the Account page) */}
      {hasLeague ? (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, opacity: 0.95 }}>Swap League</div>
          <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 10, padding: "8px 10px" }}>
            <select
              value={activeLeagueId ?? ""}
              onChange={(e) => setActiveLeague(e.target.value)}
              aria-label="Swap league"
              style={{ width: "100%", height: 34, borderRadius: 8, border: "none", outline: "none", background: "transparent", fontSize: 14, fontWeight: 500, color: "#0f172a" }}
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
    </>
  );
}

/** Phones: the drawer a page opens with its ☰ button. */
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
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} onClick={onClose} />

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
          background: GRADIENT,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto", // 14 items: scrolls on short phones
        }}
      >
        <MenuContents leagues={leagues} activeLeagueId={activeLeagueId} setActiveLeague={setActiveLeague} activeItem={activeItem} onClose={onClose} />
      </aside>
    </div>
  );
}

/** Pages with no menu entry of their own light up the one they belong to. */
function activeFor(pathname: string): ActiveMenu | null {
  if (pathname.startsWith("/mock-draft")) return "Draft Room";
  if (pathname.startsWith("/trade")) return "Transactions";
  if (pathname.startsWith("/team-of-the-week")) return "League";
  const hit = (Object.entries(PATHS) as Array<[ActiveMenu, string]>).find(([, p]) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? hit[0] : null;
}

/** Pages that don't show the sidebar (signing in, resetting a password). */
const NO_SIDEBAR = ["/", "/auth", "/reset-password"];

/**
 * Computers: the menu on the left all the time (hidden below 1024 px by app/globals.css, where
 * the pages' ☰ drawer is used instead).
 */
export function DesktopSidebar() {
  const pathname = usePathname() ?? "/";
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  // the leagues and admin flag are saved in the browser, so the menu fills in once the page has
  // loaded there (the empty sidebar is drawn straight away, so the page doesn't jump)
  const inBrowser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  if (NO_SIDEBAR.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)))) return null;
  return (
    <aside className="desk-sidebar" aria-label="Menu">
      {inBrowser ? <MenuContents leagues={leagues} activeLeagueId={activeLeagueId ?? null} setActiveLeague={setActiveLeague} activeItem={activeFor(pathname)} /> : null}
    </aside>
  );
}
