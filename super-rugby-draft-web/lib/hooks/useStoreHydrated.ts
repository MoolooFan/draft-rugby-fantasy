"use client";
// lib/hooks/useStoreHydrated.ts
// Whether a saved (zustand `persist`) store has loaded its saved copy from this device yet
// (27 Nov 2026; replaces setting a flag in an effect). Stores that aren't saved count as loaded.
import { useSyncExternalStore } from "react";

type PersistApi = { hasHydrated?: () => boolean; onFinishHydration?: (fn: () => void) => () => void };

export function useStoreHydrated(store: { persist?: PersistApi } | null | undefined): boolean {
  const p = store?.persist;
  return useSyncExternalStore(
    (onChange) => (p?.onFinishHydration ? p.onFinishHydration(onChange) : () => {}),
    () => (p?.hasHydrated ? p.hasHydrated() : true),
    () => false
  );
}
