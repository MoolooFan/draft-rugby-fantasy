"use client";
// lib/ui/useIsDesktop.ts
// True on a computer-sized screen (1024 px and wider; Ethan, 27 Nov 2026), for pages that lay
// themselves out differently there (e.g. the Draft Room's columns). False on the server and on
// phones.
import { useSyncExternalStore } from "react";

export const DESKTOP_QUERY = "(min-width: 1024px)";
/** wide computer screens (room for a third column) */
export const WIDE_QUERY = "(min-width: 1320px)";

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
