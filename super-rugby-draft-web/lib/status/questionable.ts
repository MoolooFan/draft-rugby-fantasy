// lib/status/questionable.ts
// Questionable (QUES) players (Ethan, 12 Nov 2026). Some injuries come with a return time,
// e.g. "Hamstring - 1-2 weeks" on the Round 5 injury list. Counting from that list's round, in
// calendar rounds (byes count), the earliest he's due back is Round 6. Once Round 5 has finished
// he becomes "Questionable - Hamstring" until Round 6's injury list and team lists say whether
// he's back (the next injury list clears or replaces it, as it does every status).
//   "N weeks", "N-M weeks", "N+ weeks"  -> back in list round + N (the shortest time)
//   "N days"                           -> weeks rounded up
//   "Round N", "Rounds N-M", "Round N-Finals" -> back in round N
// Vague times (short / medium / long term, TBC, season, returning) never turn questionable.
// Pure code (tested in scripts/tests/questionable.test.ts).

/** The injury part of "Injury - Timeframe" (everything before the last " - "). */
function splitStatus(status: string): { injury: string; timeframe: string } | null {
  const s = status.trim();
  const i = s.lastIndexOf(" - ");
  if (i <= 0) return null;
  return { injury: s.slice(0, i).trim(), timeframe: s.slice(i + 3).trim() };
}

/** The real round he's due back, from his injury status and the round of the list that set it. */
export function returnRound(status: string | null | undefined, listRound: number | null | undefined): number | null {
  if (!status || listRound == null || !Number.isFinite(listRound)) return null;
  const parts = splitStatus(status);
  if (!parts || /^questionable/i.test(parts.injury)) return null;
  const t = parts.timeframe.toLowerCase();
  const weeks = t.match(/^(\d+)(?:\+|\s*-\s*\d+)?\s*weeks?$/);
  if (weeks) {
    const n = Number(weeks[1]);
    return n >= 1 ? listRound + n : null;
  }
  const days = t.match(/^(\d+)(?:\+|\s*-\s*\d+)?\s*days?$/);
  if (days) {
    const n = Math.ceil(Number(days[1]) / 7);
    return n >= 1 ? listRound + n : null;
  }
  const round = t.match(/^rounds?\s*(\d+)/);
  if (round) {
    const r = Number(round[1]);
    return r > listRound ? r : null;
  }
  return null;
}

/** "Hamstring - 1-2 weeks" -> "Questionable - Hamstring". */
export function questionableStatus(status: string): string {
  const parts = splitStatus(status);
  const injury = parts?.injury && !/^(injury|out)$/i.test(parts.injury) ? parts.injury : null;
  return injury ? `Questionable - ${injury}` : "Questionable";
}

/**
 * Should this status turn questionable now? Yes once the round before his return has finished
 * (roundFinishedMs(r) = when round r's last game is over, null if unknown), as long as no later
 * injury list has set his status since (listRound < return round).
 */
export function dueQuestionable(
  status: string | null | undefined,
  listRound: number | null | undefined,
  roundFinishedMs: (realRound: number) => number | null,
  nowMs: number
): boolean {
  const back = returnRound(status, listRound);
  if (back == null || listRound == null || listRound >= back) return false;
  const finished = roundFinishedMs(back - 1);
  return finished != null && nowMs >= finished;
}
