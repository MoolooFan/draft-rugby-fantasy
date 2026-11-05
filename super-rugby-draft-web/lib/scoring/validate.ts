// lib/scoring/validate.ts
// Checks scoring values sent from a form (league Custom scoring, or the admin's Standard /
// Alternate) and returns clean rules, or a problem to show.
import { completeRules, type ScoringRules } from "@/lib/scoring";

const LIMIT = 100; // no stat can be worth more than 100 points either way

export function cleanScoringRules(input: unknown, opts: { allowStructure: boolean; base: ScoringRules }): { rules?: ScoringRules; error?: string } {
  if (!input || typeof input !== "object") return { error: "Missing scoring values" };
  const raw = input as Partial<ScoringRules>;
  const rules = completeRules({ ...opts.base, ...raw, perEvent: { ...opts.base.perEvent, ...(raw.perEvent ?? {}) } });
  const values = [rules.minutesUpTo60, rules.minutes61Plus, ...Object.values(rules.perEvent)];
  if (values.some((v) => !Number.isFinite(v) || Math.abs(v) > LIMIT)) return { error: `Points must be numbers between -${LIMIT} and ${LIMIT}` };
  if (!opts.allowStructure) {
    // commissioners change points only; the rest follows the base system
    rules.minutesFullAt = opts.base.minutesFullAt;
    rules.metresPer = opts.base.metresPer;
    rules.scrumPositions = opts.base.scrumPositions;
  } else {
    if (!Number.isInteger(rules.minutesFullAt) || rules.minutesFullAt < 1 || rules.minutesFullAt > 80) return { error: "Minutes mark must be 1 to 80" };
    if (!Number.isInteger(rules.metresPer) || rules.metresPer < 1 || rules.metresPer > 50) return { error: "Metres per point must be 1 to 50" };
    if (!rules.scrumPositions.length || rules.scrumPositions.some((p) => !["PR", "HO"].includes(p))) return { error: "Scrum points must go to props (and optionally hookers)" };
  }
  return { rules };
}
