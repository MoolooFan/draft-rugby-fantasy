"use client";
// app/chat/page.tsx
// The Messages page (league chat and direct messages): components/chat/ChatView.tsx. On a
// computer the menu's message button opens the same thing as a panel from the right instead
// (components/chat/ChatDrawer.tsx; Ethan, 28 Nov 2026); this page still works there for links.
import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppMenu } from "@/components/AppMenu";
import { ChatView } from "@/components/chat/ChatView";
import { useLeagueStore } from "@/lib/league/store";
import { useRequireSession } from "@/lib/session/useRequireSession";

function ChatPageInner() {
  useRequireSession();
  const router = useRouter();
  const params = useSearchParams();
  const channel = params?.get("c") ?? null;
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }} />
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, margin: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
        </div>
      </div>

      <ChatView channel={channel} setChannel={(c) => router.push(c ? `/chat?c=${encodeURIComponent(c)}` : "/chat")} variant="page" />

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues as never}
        activeLeagueId={activeLeagueId as never}
        setActiveLeague={setActiveLeague as never}
        activeItem={"Messages" as never}
      />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
