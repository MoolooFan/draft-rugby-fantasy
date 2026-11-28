"use client";
// components/ChatNotifier.tsx
// Keeps the unread chat count up to date (for the menu's message button) and shows a banner at
// the top of any page when a new message arrives (not on the chat page itself). Only counts
// what the person hasn't muted in their notification settings. Checks every 20 seconds while
// the site is open (not while the tab is hidden).
import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLeagueStore } from "@/lib/league/store";
import { useChatDrawer, useChatUnread } from "@/lib/chat/store";
import { useIsDesktop } from "@/lib/ui/useIsDesktop";
import { ChatIcon } from "@/components/ChatIcon";

type Newest = { id: string; channel: string; sender_team_id: string | null; kind: string; body: string | null; created_at: string } | null;

const POLL_MS = 20_000;

export default function ChatNotifier() {
  const leagueId = useLeagueStore((s) => s.activeLeagueId);
  const setUnread = useChatUnread((s) => s.setUnread);
  const pathname = usePathname();
  const router = useRouter();
  const openChat = useChatDrawer((s) => s.openChat);
  const drawerOpen = useChatDrawer((s) => s.open);
  const isDesktop = useIsDesktop();
  const [banner, setBanner] = useState<{ id: string; channel: string; title: string; text: string } | null>(null);
  const lastShown = useRef<string | null>(null);

  useEffect(() => {
    if (!leagueId) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    const storageKey = `sr-chat-banner-${leagueId}`;
    try {
      lastShown.current = localStorage.getItem(storageKey);
    } catch {
      lastShown.current = null;
    }
    const check = () => {
      if (document.hidden) return;
      fetch(`/api/chat?leagueId=${encodeURIComponent(leagueId)}&unreadOnly=1`, { cache: "no-store", credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          if (cancelled || !j?.ok) return;
          setUnread(Number(j.total) || 0);
          const n = j.newest as Newest;
          if (!n || n.id === lastShown.current) return;
          lastShown.current = n.id;
          try {
            localStorage.setItem(storageKey, n.id);
          } catch {
            /* fine */
          }
          if (window.location.pathname.startsWith("/chat")) return;
          const sender = (j.teams ?? []).find((t: { id: string }) => t.id === n.sender_team_id)?.name;
          const title = n.channel === "league" ? (sender ? `${sender} in league chat` : "League update") : `${sender ?? "Message"}`;
          const text = n.kind === "trade" ? "Sent you a trade offer" : n.kind === "image" ? "Sent a picture" : String(n.body ?? "").split("\n")[0].slice(0, 90);
          setBanner({ id: n.id, channel: n.channel, title, text });
          setTimeout(() => setBanner((b) => (b?.id === n.id ? null : b)), 6000);
        })
        .catch(() => {});
    };
    check();
    const t = setInterval(check, POLL_MS);
    const onVisible = () => !document.hidden && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [leagueId, setUnread]);

  if (!banner || pathname?.startsWith("/chat") || (isDesktop && drawerOpen)) return null;
  return (
    <button
      onClick={() => {
        setBanner(null);
        if (isDesktop) openChat(banner.channel);
        else router.push(`/chat?c=${encodeURIComponent(banner.channel)}`);
      }}
      style={{
        position: "fixed",
        top: "calc(10px + env(safe-area-inset-top, 0px))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(92vw, 400px)",
        zIndex: 9000,
        border: "none",
        borderRadius: 14,
        padding: "10px 12px",
        background: "rgba(15,23,42,0.96)",
        color: "white",
        boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 999, background: "rgb(13,148,136)", display: "grid", placeItems: "center", flex: "none" }}>
        <ChatIcon size={18} color="white" />
      </span>
      <span style={{ minWidth: 0, display: "grid" }}>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{banner.title}</span>
        <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{banner.text}</span>
      </span>
    </button>
  );
}
