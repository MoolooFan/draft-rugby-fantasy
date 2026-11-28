// lib/draft/lottery/view.ts
// Small helpers for showing the draft lottery (Draft Room, League Settings, Dashboard).
import type { LotteryData, LotteryRun } from "./useLottery";

/** The run that's waiting for its time, if any. */
export function waitingRun(data: LotteryData | null): LotteryRun | null {
  return data?.runs.find((r) => !r.ranAt) ?? null;
}

/** The latest run that has run. */
export function lastRun(data: LotteryData | null): LotteryRun | null {
  const ran = (data?.runs ?? []).filter((r) => r.ranAt);
  return ran.length ? ran[ran.length - 1] : null;
}

/** "Run 2 (rerun)" */
export const runLabel = (r: Pick<LotteryRun, "runNumber">) => `Run ${r.runNumber}${r.runNumber > 1 ? " (rerun)" : ""}`;

/** "Sat 30 Nov, 7:30 pm" (in `timeZone`, else this device's). */
export const lotteryWhen = (ms: number, timeZone?: string) =>
  new Date(ms).toLocaleString(undefined, { timeZone, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const listNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * What to say about the order compared with the last lottery (null: it's still the lottery's
 * order). Teams that join after a lottery go on the end (Ethan, 28 Nov 2026) until the
 * commissioner runs it again or arranges the order by hand.
 */
export function lotteryOrderNote(data: LotteryData | null): string | null {
  const last = lastRun(data);
  if (!data || !last?.resultTeamIds) return null;
  if (data.order.join("|") === last.resultTeamIds.join("|")) return null;
  if (data.orderSource === "commissioner") return "The commissioner changed the order by hand after the lottery.";
  const joined = data.order.filter((id) => !last.resultTeamIds!.includes(id));
  if (!joined.length) return null; // only a team leaving: everyone else keeps their place
  const names = joined.map((id) => data.teams.find((t) => t.id === id)?.name ?? "A new team");
  return `${listNames(names)} joined after the lottery, so they're at the end of the order.`;
}
