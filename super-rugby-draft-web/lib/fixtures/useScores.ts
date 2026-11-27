"use client";
// lib/fixtures/useScores.ts
// Pages that use the fixtures file directly (Matchup, Team Selection) get the real scores on it
// too (from /api/fixtures/scores; lib/fixtures/scores.ts): final ones, and live ones while a game
// is on. Shared between pages and fetched again after 5 minutes, or every minute while a game is
// live; the fixtures show without scores until they've loaded.
import { useEffect, useMemo, useState } from "react";
import { withScores, type MatchScore } from "./scores";
import { currentSeasonYear } from "@/lib/season";

const FRESH_MS = 5 * 60_000;
const LIVE_MS = 60_000;
const loaded = new Map<number, { at: number; p: Promise<MatchScore[]> }>();
function loadScores(season: number, maxAgeMs = FRESH_MS): Promise<MatchScore[]> {
  const hit = loaded.get(season);
  let p = hit && Date.now() - hit.at < maxAgeMs ? hit.p : null;
  if (!p) {
    p = fetch(`/api/fixtures/scores?season=${season}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j?.ok && Array.isArray(j.scores) ? (j.scores as MatchScore[]) : []))
      .catch(() => {
        loaded.delete(season); // try again next time
        return [];
      });
    loaded.set(season, { at: Date.now(), p });
  }
  return p;
}

export function useFixturesWithScores<F extends Parameters<typeof withScores>[0][number]>(fixtures: F[], season: number = currentSeasonYear()): F[] {
  const [scores, setScores] = useState<MatchScore[] | null>(null);
  useEffect(() => {
    let live = true;
    loadScores(season).then((s) => {
      if (live) setScores(s);
    });
    return () => {
      live = false;
    };
  }, [season]);
  // while a game is live, check again every minute
  const anyLive = !!scores?.some((s) => s.final === false);
  useEffect(() => {
    if (!anyLive) return;
    let live = true;
    const t = setInterval(() => {
      loadScores(season, LIVE_MS - 5_000).then((s) => {
        if (live) setScores(s);
      });
    }, LIVE_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [anyLive, season]);
  return useMemo(() => withScores(fixtures, scores), [fixtures, scores]);
}
