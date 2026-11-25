// lib/draft/useStrategy.ts
// A page's copy of the draft strategy (lib/draft/strategy.ts): your default, or a league's own.
// Changes show straight away and are saved to the server a moment later. A league without its
// own strategy shows your default; the first change there gives the league its own copy.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanStrategy, EMPTY_STRATEGY, type DraftStrategy } from "@/lib/draft/strategy";

export type StrategySource = "league" | "default" | "none";

export function useDraftStrategy(leagueId: string | null | undefined) {
  const [strategy, setStrategy] = useState<DraftStrategy>(EMPTY_STRATEGY);
  const [source, setSource] = useState<StrategySource>("none");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<DraftStrategy | null>(null);
  const lid = leagueId ?? "";

  useEffect(() => {
    let live = true;
    setLoaded(false);
    fetch(`/api/draft/strategy${lid ? `?leagueId=${encodeURIComponent(lid)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.ok) throw new Error(j?.error || "Couldn't load your strategy");
        setStrategy(cleanStrategy(j.strategy));
        setSource(j.source ?? "none");
        setError(null);
      })
      .catch((e) => live && setError(String(e?.message ?? e)))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [lid]);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const s = pending.current;
    pending.current = null;
    if (!s) return;
    setSaving(true);
    try {
      const r = await fetch("/api/draft/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: lid || undefined, strategy: s }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Couldn't save");
      setSource(lid ? "league" : "default");
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  }, [lid]);

  // save anything still waiting when the page closes
  useEffect(() => () => void flush(), [flush]);

  const update = useCallback(
    (change: (s: DraftStrategy) => DraftStrategy) => {
      setStrategy((prev) => {
        const next = cleanStrategy(change(prev));
        pending.current = next;
        return next;
      });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 700);
    },
    [flush]
  );

  /** A league goes back to using your default strategy. */
  const revertToDefault = useCallback(async () => {
    if (!lid) return;
    pending.current = null;
    const r = await fetch("/api/draft/strategy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leagueId: lid, useDefault: true }) });
    const j = await r.json().catch(() => null);
    if (j?.ok) {
      setStrategy(cleanStrategy(j.strategy));
      setSource(j.source ?? "none");
    }
  }, [lid]);

  return { strategy, update, source, loaded, saving, error, revertToDefault };
}
