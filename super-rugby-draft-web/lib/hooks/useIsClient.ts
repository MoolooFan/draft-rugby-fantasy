"use client";
// lib/hooks/useIsClient.ts
// False while the page is drawn on the server and during the browser's first (hydration) pass,
// true after that, the same as the old `useEffect(() => setMounted(true), [])` but without the
// extra draw React 19's rules warn about (27 Nov 2026). Use it before reading anything only the
// browser has (the address bar, saved settings, the clock) so the server and browser match.
import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

export function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
}
