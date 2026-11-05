"use client";
// Makes every page score with the active league's scoring (Standard / Alternate / Custom).
// Set while rendering, above the pages, so pages always draw with the right rules.
import type { ReactNode } from "react";
import { useLeagueStore } from "@/lib/league/store";
import { setActiveScoringRules, type ScoringRules } from "@/lib/scoring";

export default function ScoringRulesSync({ children }: { children: ReactNode }) {
  const rules = useLeagueStore((s) => {
    const l = s.leagues.find((x) => x.id === s.activeLeagueId) as { scoringRules?: Partial<ScoringRules> } | undefined;
    return l?.scoringRules ?? null;
  });
  setActiveScoringRules(rules);
  return <>{children}</>;
}
