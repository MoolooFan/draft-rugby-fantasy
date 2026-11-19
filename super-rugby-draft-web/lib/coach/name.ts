// lib/coach/name.ts
// The name each user gives their AI assistant coach (Ethan, 19 Nov 2026), set on the Account
// page. Only a label: the coach's notes are shared by everyone, so the name isn't in them.
"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { DEFAULT_COACH_NAME } from "@/lib/coach/nameRules";

type CoachNameState = { name: string; loaded: boolean; loading: boolean; set: (name: string | null) => void; load: () => Promise<void> };

export const useCoachNameStore = create<CoachNameState>((set, get) => ({
  name: DEFAULT_COACH_NAME,
  loaded: false,
  loading: false,
  set: (name) => set({ name: name || DEFAULT_COACH_NAME, loaded: true }),
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const j = await fetch("/api/account/coach-name", { cache: "no-store", credentials: "include" }).then((r) => r.json());
      set({ name: (j?.ok && j.name) || DEFAULT_COACH_NAME, loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },
}));

/** The signed-in user's name for their coach ("AI Coach" until they change it). */
export function useCoachName(): string {
  const name = useCoachNameStore((s) => s.name);
  const load = useCoachNameStore((s) => s.load);
  useEffect(() => {
    void load();
  }, [load]);
  return name;
}
