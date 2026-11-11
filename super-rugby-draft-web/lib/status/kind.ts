// lib/status/kind.ts
// One place that decides what a player's status text means, so every page shows the same badge.
//   Starting  → green  XV
//   Benched   → yellow SUB
//   Injured   → red    INJ   (any injury, e.g. "Knee - TBC", "Injury - TBC")
//   Suspended → red    SUS   (e.g. "Suspended - 2 weeks")
//   Out       → red    OUT   (not injured: personal reasons, paternity leave, rested, ...)
//   no status → no badge (available)

import { getSeason, SEASONS, totalFantasyWeeks, weekFinaliseAtMs, currentSeasonYear } from "@/lib/season";

export type StatusKind = "starting" | "bench" | "injured" | "suspended" | "out";

/** Reasons a player is out that aren't injuries (the start of the status text). */
const OUT_REASONS = /^(out\b|personal|rested|rest\b|paternity|compassionate|bereavement|international|national|unavailable|not available|stood down|left|other)/;

export function statusKind(raw: string | null | undefined): StatusKind | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s || s === "-") return null;
  if (s === "starting") return "starting";
  if (s === "benched" || s === "bench" || s === "sub" || s === "substitute" || s === "replacement") return "bench";
  if (s.startsWith("susp")) return "suspended";
  if (OUT_REASONS.test(s)) return "out";
  return "injured";
}

export const STATUS_TAG: Record<StatusKind, { tag: string; name: string; bg: string; fg: string }> = {
  starting: { tag: "XV", name: "Starting", bg: "#16a34a", fg: "#ffffff" },
  bench: { tag: "SUB", name: "Sub", bg: "#facc15", fg: "#3b2f00" },
  injured: { tag: "INJ", name: "Injured", bg: "#dc2626", fg: "#ffffff" },
  suspended: { tag: "SUS", name: "Suspended", bg: "#dc2626", fg: "#ffffff" },
  out: { tag: "OUT", name: "Out", bg: "#dc2626", fg: "#ffffff" },
};

/** Ready-made statuses for the admin page (the text after " - " can be edited). */
export const STATUS_PRESETS: string[] = [
  "Starting",
  "Benched",
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
