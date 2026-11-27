"use client";
// lib/hooks/useNow.ts
// The time now, moving on every `ms` (27 Nov 2026; replaces the pages' own "set the time in an
// effect, then every so often" clocks, which React 19's rules warn about). 0 while the page is
// drawn on the server and in the browser's first pass, so both match; the real time straight
// after. Pages showing the same tick share one timer.
import { useCallback, useSyncExternalStore } from "react";

type Clock = { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> | null };
const clocks = new Map<number, Clock>();

function clockFor(ms: number): Clock {
  let c = clocks.get(ms);
  if (!c) {
    c = { now: 0, listeners: new Set(), timer: null };
    clocks.set(ms, c);
  }
  return c;
}

export function useNow(ms = 30_000): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const c = clockFor(ms);
      c.listeners.add(onChange);
      if (!c.timer) {
        c.timer = setInterval(() => {
          c.now = Date.now();
          c.listeners.forEach((l) => l());
        }, ms);
      }
      return () => {
        c.listeners.delete(onChange);
        if (!c.listeners.size && c.timer) {
          clearInterval(c.timer);
          c.timer = null;
          c.now = 0; // read fresh next time
        }
      };
    },
    [ms]
  );
  const getSnapshot = useCallback(() => {
    const c = clockFor(ms);
    // first read in the browser: the real time (then the timer moves it on)
    if (!c.now) c.now = Date.now();
    return c.now;
  }, [ms]);
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
