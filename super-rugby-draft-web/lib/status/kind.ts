// lib/status/kind.ts
// One place that decides what a player's status text means, so every page shows the same badge.
//   Starting  → green  XV    (from the team lists with the jersey: "Starting - #12")
//   Benched   → yellow SUB   ("Bench - #22")
//   Questionable → red QUES  (due back this round, not confirmed yet: lib/status/questionable.ts)
//   Injured   → red    INJ   (any injury, e.g. "Knee - TBC", "Injury - TBC")
//   Suspended → red    SUS   (e.g. "Suspended - 2 weeks")
//   Out       → red    OUT   (not injured: personal reasons, paternity leave, rested, ...)
//   no status → no badge (available)

import { getSeason, SEASONS, totalFantasyWeeks, weekFinaliseAtMs, currentSeasonYear } from "@/lib/season";

export type StatusKind = "starting" | "bench" | "questionable" | "injured" | "suspended" | "out";

/** Reasons a player is out that aren't injuries (the start of the status text). */
const OUT_REASONS = /^(out\b|personal|rested|rest\b|paternity|compassionate|bereavement|international|national|unavailable|not available|stood down|left|other)/;

export function statusKind(raw: string | null | undefined): StatusKind | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s === "-") return null;
  if (/^starting\b/.test(s)) return "starting";
  if (/^(benched|bench|sub|substitute|replacement)\b/.test(s)) return "bench";
  if (/^(questionable|ques)\b/.test(s)) return "questionable";
  if (s.startsWith("susp")) return "suspended";
  if (OUT_REASONS.test(s)) return "out";
  return "injured";
}

/** "Starting" / "Bench" plus the jersey from the team list if known: "Starting - #12". */
export function jerseyLabel(base: string, text: string | null | undefined): string {
  const m = String(text ?? "").match(/#\s*(\d{1,2})/);
  return m ? `${base} - #${m[1]}` : base;
}

export const STATUS_TAG: Record<StatusKind, { tag: string; name: string; bg: string; fg: string }> = {
  starting: { tag: "XV", name: "Starting", bg: "#16a34a", fg: "#ffffff" },
  bench: { tag: "SUB", name: "Sub", bg: "#facc15", fg: "#3b2f00" },
  questionable: { tag: "QUES", name: "Questionable", bg: "#dc2626", fg: "#ffffff" },
  injured: { tag: "INJ", name: "Injured", bg: "#dc2626", fg: "#ffffff" },
  suspended: { tag: "SUS", name: "Suspended", bg: "#dc2626", fg: "#ffffff" },
  out: { tag: "OUT", name: "Out", bg: "#dc2626", fg: "#ffffff" },
};

/** Ready-made statuses for the admin page (the text after " - " can be edited). */
export const STATUS_PRESETS: string[] = [
  "Starting - #",
  "Bench - #",
  "Questionable - TBC",
  "Injury - TBC",
  "Suspended - 1 week",
  "Out - Personal reasons",
  "Out - Paternity leave",
  "Out - Compassionate leave",
  "Out - Rested",
  "Out - International duty",
];

let weekCache: { season: number; minute: number; week: number } | null = null;

/**
 * The fantasy week whose statuses are current: the first week that hasn't been finalised yet
 * (so this week's team lists show until the week is over), or the last week after the season.
 */
export function currentStatusWeek(seasonYear: number = currentSeasonYear(), nowMs: number = Date.now()): number {
  const minute = Math.floor(nowMs / 60_000);
  if (weekCache && weekCache.season === seasonYear && weekCache.minute === minute) return weekCache.week;
  let week = 1;
  if (SEASONS[seasonYear]) {
    const s = getSeason(seasonYear);
    const n = totalFantasyWeeks(s);
    week = n;
    for (let w = 1; w <= n; w++) {
      const fin = weekFinaliseAtMs(s, w);
      if (fin != null && fin > nowMs) {
        week = w;
        break;
      }
    }
  }
  weekCache = { season: seasonYear, minute, week };
  return week;
}

type WithStatus = { status?: string | null; weeklyStatus?: Record<string, string> | null };

/** A player's status right now: this week's (team list / injury list), else their card status. */
export function currentStatusText(p: WithStatus | null | undefined, week: number = currentStatusWeek()): string | null {
  if (!p) return null;
  const weekly = p.weeklyStatus?.[`W${week}`];
  if (weekly && weekly.trim()) return weekly;
  const card = String(p.status ?? "").trim();
  return card && card !== "-" ? card : null;
}

export function currentStatusKind(p: WithStatus | null | undefined): StatusKind | null {
  return statusKind(currentStatusText(p));
}
