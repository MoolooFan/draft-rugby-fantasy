// lib/hooks/usePoll.ts
// Runs `run` now, then again after `delayMs()` each time it finishes (never two at once).
// Pauses while the tab is hidden (phone locked, another tab open) and refreshes straight
// away when it's shown again.
"use client";
import { useEffect, useRef } from "react";
import type { League } from "@/lib/league/types";

/** `restartKey`: when it changes (e.g. a different league), start again straight away. */
export function usePoll(run: (() => Promise<unknown> | unknown) | null, delayMs: () => number, restartKey?: string | null) {
  const runRef = useRef(run);
  const delayRef = useRef(delayMs);
  useEffect(() => {
    runRef.current = run;
    delayRef.current = delayMs;
  });
  const enabled = !!run;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let running = false;
    let timer: number | undefined;

    const tick = async () => {
      window.clearTimeout(timer);
      if (cancelled || running) return;
      if (!document.hidden) {
        running = true;
        try { await runRef.current?.(); } catch {}
        running = false;
      }
      if (!cancelled) timer = window.setTimeout(tick, Math.max(1000, delayRef.current()));
    };
    const onVisible = () => { if (!document.hidden) void tick(); };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, restartKey]);
}

/** How often to re-check a league: often around the draft, rarely otherwise. */
export function leagueRefreshMs(league: Pick<League, "draftStatus" | "draftAt"> | null | undefined, nowMs = Date.now()) {
  if (!league || league.draftStatus === "complete") return 60_000;
  if (league.draftStatus === "live") return 3_000;
  if (league.draftAt && league.draftAt - nowMs < 10 * 60_000) return 3_000;
  return 30_000;
}
