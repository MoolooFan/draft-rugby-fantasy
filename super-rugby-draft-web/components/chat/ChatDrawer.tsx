"use client";
// components/chat/ChatDrawer.tsx
// Messages on a computer (Ethan, 28 Nov 2026): a panel that slides in from the right, like the
// menu from the left, over whatever page you're on. Opened by the menu's message button and the
// new-message banner (lib/chat/store.ts useChatDrawer). Phones keep the Messages page.
import React from "react";
import { usePathname } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";
import { useChatDrawer } from "@/lib/chat/store";
import { useIsDesktop } from "@/lib/ui/useIsDesktop";

const GRADIENT = "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))";

export default function ChatDrawer() {
  const open = useChatDrawer((s) => s.open);
  const channel = useChatDrawer((s) => s.channel);
  const setChannel = useChatDrawer((s) => s.setChannel);
  const close = useChatDrawer((s) => s.close);
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  if (!open || !isDesktop || pathname?.startsWith("/chat")) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} onClick={close} />
      <aside
        role="dialog"
        aria-label="Messages"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: 420,
          maxWidth: "92vw",
          padding: 16,
          background: GRADIENT,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          color: "white",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <ChatView channel={channel} setChannel={setChannel} variant="drawer" onClose={close} />
      </aside>
    </div>
  );
}
