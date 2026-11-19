// lib/league/lineupWarnings.ts
// Lineup warnings (Ethan, 19 Nov 2026): starters who won't play this round (a bye, injured,
// suspended, out, or left out of their team's list), starters who are doubtful (named on the
// bench, or due back from injury but not confirmed), and empty starting spots. Shown on Team
// Selection and the dashboard before the lineup deadline. Pure code (scripts/tests/lineup-warnings.test.ts).
import type { PlayerProjection } from "@/lib/projections/server";
import { startersOf } from "@/lib/scoring/week";
import type { SquadFormat } from "@/lib/league/squad";

export type LineupWarningReason = "bye" | "injured" | "suspended" | "out" | "notNamed" | "bench" | "questionable";

export type LineupWarning = {
  playerId: string;
  reason: LineupWarningReason;
  /** "out" = won't play; "doubt" = might not (bench, questionable) */
  level: "out" | "doubt";
};

export const WARNING_TEXT: Record<LineupWarningReason, string> = {
  bye: "on a bye",
  injured: "injured",
  suspended: "suspended",
  out: "out this round",
  notNamed: "not named in his team",
  bench: "named on the bench",
  questionable: "questionable (not confirmed fit)",
};

type LineupLike = Record<string, { id?: string | null } | null | undefined> | null | undefined;

export function lineupWarnings(
  lineup: LineupLike,
  projection: (playerId: string) => PlayerProjection | null,
  format?: SquadFormat | null
): { warnings: LineupWarning[]; emptySpots: number } {
  const warnings: LineupWarning[] = [];
  let emptySpots = 0;
  for (const slot of startersOf(format)) {
    const id = lineup?.[slot]?.id;
    if (!id) {
      emptySpots++;
      continue;
    }
    const p = projection(id);
    if (!p) continue;
    if (p.role === "out") warnings.push({ playerId: id, reason: p.outReason ?? (p.kickoffMs == null ? "bye" : "out"), level: "out" });
    else if (p.role === "bench") warnings.push({ playerId: id, reason: "bench", level: "doubt" });
    else if (p.questionable) warnings.push({ playerId: id, reason: "questionable", level: "doubt" });
  }
  return { warnings, emptySpots };
}

/** One line for the dashboard: "2 starters aren't playing and 1 spot is empty". */
export function warningSummary(w: { warnings: LineupWarning[]; emptySpots: number }): string | null {
  const out = w.warnings.filter((x) => x.level === "out").length;
  const doubt = w.warnings.length - out;
  const parts: string[] = [];
  if (out) parts.push(`${out} starter${out === 1 ? " isn't" : "s aren't"} playing`);
  if (w.emptySpots) parts.push(`${w.emptySpots} starting spot${w.emptySpots === 1 ? " is" : "s are"} empty`);
  if (doubt) parts.push(`${doubt} ${doubt === 1 ? "is" : "are"} doubtful`);
  if (!parts.length) return null;
  const s = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
