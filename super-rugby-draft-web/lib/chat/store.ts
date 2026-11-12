// lib/chat/store.ts
// Unread chat messages for the active league, shared by the menu's message button and the
// message banner (components/ChatNotifier.tsx keeps it up to date).
"use client";
import { create } from "zustand";

export const useChatUnread = create<{ unread: number; setUnread: (n: number) => void }>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
}));
