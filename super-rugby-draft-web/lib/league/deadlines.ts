// lib/league/deadlines.ts
// When a fantasy week's lineups lock. One place, used by the server.
// Rule: lineups lock 1 hour before the first kickoff of the week's real round.
//
// TODO(item 6, season settings): fixtures are still the 2026 file, and a fantasy week
// is assumed to be exactly one real round. For 2027, rounds 10 and 11 become one
// fantasy week; that mapping will live in the season settings and be applied here.
import fixturesData from "@/data/fixtures-2026.json";
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";

type FixtureLike = { week: number; kickoffAt: string | number };

function toMs(x: string | number): number {
  const n = typeof x === "number" ? x : new Date(x).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** First kickoff (ms) of a real round, or null if the round has no fixtures. */
export function realRoundFirstKickoffMs(realRound: number, fixtures: FixtureLike[] = fixturesData as FixtureLike[]): number | null {
  const times = fixtures.filter((f) => Number(f.week) === realRound).map((f) => toMs(f.kickoffAt)).filter((ms) => ms > 0);
  return times.length ? Math.min(...times) : null;
}

/** Lineup deadline (ms) for a league's fantasy week, or null if that week has no fixtures. */
export function selectionDeadlineMs(startRound: number | null | undefined, fantasyWeek: number): number | null {
  const realRound = fantasyWeekToRealRound(Number(startRound ?? 1) || 1, fantasyWeek);
  const first = realRoundFirstKickoffMs(realRound);
  return first == null ? null : selectionDeadlineFromFirstKickoff(first);
}
