// lib/draft/useStrategy.ts
// A page's copy of your draft strategy for a league (lib/draft/strategy.ts). Changes show
// straight away and are saved to the server a moment later. No league = no strategy.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cleanStrategy, EMPTY_STRATEGY, type DraftStrategy } from "@/lib/draft/strategy";

export type StrategySource = "league" | "none";

export function useDraftStrategy(leagueId: string | null | undefined) {
  const [strategy, setStrategy] = useState<DraftStrategy>(EMPTY_STRATEGY);
  const [source, setSource] = useState<StrategySource>("none");
  // loaded for which league ("" = none): "loaded" means loaded for this one (React 19 rules: not
  // reset in an effect)
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<DraftStrategy | null>(null);
  const lid = leagueId ?? "";

  useEffect(() => {
    let live = true;
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
      .finally(() => live && setLoadedFor(lid));
    return () => {
      live = false;
    };
  }, [lid]);

  const flush = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const s = pending.current;
    pending.current = null;
    if (!s || !lid) return;
    setSaving(true);
    try {
      const r = await fetch("/api/draft/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId: lid || undefined, strategy: s }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "Couldn't save");
      setSource("league");
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

  const loaded = loadedFor === lid;
  return { strategy, update, source, loaded, saving, error };
}
