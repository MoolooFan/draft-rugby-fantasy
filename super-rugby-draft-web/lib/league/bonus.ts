// lib/league/bonus.ts
// Bonus ladder points (Ethan, 16 Nov 2026): the commissioner can switch each of the two on or
// off and set its margin, before the draft (locked once it starts, like scoring):
//   winning bonus: win by at least `win.margin` points  -> +1 ladder point
//   losing bonus:  lose by `lose.margin` points or fewer -> +1 ladder point
// Saved in leagues.bonus_rules; older leagues only have the on/off switch (leagues.bonus_points),
// which means both on (or both off) with the usual margins.
import { BONUS_POINTS } from "@/lib/season";

export type BonusRules = {
  win: { on: boolean; margin: number };
  lose: { on: boolean; margin: number };
};

export const DEFAULT_BONUS_RULES: BonusRules = {
  win: { on: true, margin: BONUS_POINTS.winMarginAtLeast },
  lose: { on: true, margin: BONUS_POINTS.loseMarginAtMost },
};

export const BONUS_MARGIN_MAX = 1000;

const margin = (v: unknown, fallback: number, min: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(BONUS_MARGIN_MAX, n)) : fallback;
};

/** Clean what a page sent (or what's saved); `enabledFallback` = the old on/off switch. */
export function cleanBonusRules(raw: unknown, enabledFallback = true): BonusRules {
  const r = (raw && typeof raw === "object" ? raw : null) as { win?: { on?: unknown; margin?: unknown }; lose?: { on?: unknown; margin?: unknown } } | null;
  if (!r) {
    return {
      win: { ...DEFAULT_BONUS_RULES.win, on: enabledFallback },
      lose: { ...DEFAULT_BONUS_RULES.lose, on: enabledFallback },
    };
  }
  return {
    win: { on: r.win?.on !== false, margin: margin(r.win?.margin, DEFAULT_BONUS_RULES.win.margin, 1) },
    lose: { on: r.lose?.on !== false, margin: margin(r.lose?.margin, DEFAULT_BONUS_RULES.lose.margin, 0) },
  };
}

/** A league's bonus rules from its database row. */
export function bonusRulesFromRow(row: { bonus_rules?: unknown; bonus_points?: boolean | null }): BonusRules {
  return cleanBonusRules(row.bonus_rules ?? null, row.bonus_points !== false);
}

export function anyBonus(r: BonusRules): boolean {
  return r.win.on || r.lose.on;
}

/** Short description for the pages, e.g. "Win by 140+: +1 · Lose by 40 or less: +1" (null = none). */
export function bonusRulesText(r: BonusRules): string | null {
  const parts: string[] = [];
  if (r.win.on) parts.push(`Win by ${r.win.margin}+: +${BONUS_POINTS.ladderPoints}`);
  if (r.lose.on) parts.push(`Lose by ${r.lose.margin} or less: +${BONUS_POINTS.ladderPoints}`);
  return parts.length ? parts.join(" · ") : null;
}
