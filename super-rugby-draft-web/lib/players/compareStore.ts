"use client";
// lib/players/compareStore.ts
// The player comparison pop-up (components/PlayerCompare.tsx) can be opened from anywhere:
// a player card's Compare button, or two players ticked in the Stats Hub.
import { create } from "zustand";

type CompareState = {
  open: boolean;
  ids: [string | null, string | null];
  /** open with one player (pick the other in the pop-up) or two */
  openWith: (a: string, b?: string | null) => void;
  setSlot: (i: 0 | 1, id: string | null) => void;
  swap: () => void;
  close: () => void;
};

export const useCompareStore = create<CompareState>((set) => ({
  open: false,
  ids: [null, null],
  openWith: (a, b = null) => set({ open: true, ids: [a, b && b !== a ? b : null] }),
  setSlot: (i, id) => set((s) => {
    const ids: [string | null, string | null] = [...s.ids];
    ids[i] = id;
    return { ids };
  }),
  swap: () => set((s) => ({ ids: [s.ids[1], s.ids[0]] })),
  close: () => set({ open: false }),
}));
