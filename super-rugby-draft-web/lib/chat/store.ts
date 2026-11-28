// lib/chat/store.ts
// Unread chat messages for the active league, shared by the menu's message button and the
// message banner (components/ChatNotifier.tsx keeps it up to date).
"use client";
import { create } from "zustand";

export const useChatUnread = create<{ unread: number; setUnread: (n: number) => void }>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
}));

/** Messages as a panel from the right on a computer (components/chat/ChatDrawer.tsx; Ethan, 28 Nov 2026). */
export const useChatDrawer = create<{
  open: boolean;
  channel: string | null;
  openChat: (channel?: string | null) => void;
  setChannel: (c: string | null) => void;
  close: () => void;
}>((set) => ({
  open: false,
  channel: null,
  openChat: (channel = null) => set({ open: true, channel }),
  setChannel: (channel) => set({ channel }),
  close: () => set({ open: false, channel: null }),
}));
