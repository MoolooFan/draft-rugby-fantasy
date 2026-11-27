"use client";
// lib/ui/useIsDesktop.ts
// True on a computer-sized screen (1024 px and wider; Ethan, 27 Nov 2026), for pages that lay
// themselves out differently there (e.g. the Draft Room's columns). False on the server and on
// phones.
import { useSyncExternalStore } from "react";

export const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}
