// components/transactions/playerMetrics.ts
// The numbers in the Transactions page's player list (points, match average, form, last score,
// stat totals, projections) and their labels, worked out from the season's stat rows with the
// league's scoring. Split out of app/transactions/page.tsx (21 Nov 2026).
import type { StatView } from "@/lib/players/statView";
import { applyStatView, formatStatView } from "@/lib/players/statView";
import type { WeekProjections } from "@/lib/projections/useProjections";
import { formatProjection, projectionFor } from "@/lib/projections/useProjections";
import type { League } from "@/lib/league/types";
import { toNum, type Player } from "@/components/transactions/helpers";
import { isFrontRow, playedInRound, playerPoints, statCountsFromRow, roundPoints } from "@/lib/scoring";
import { playerRoundRows } from "@/lib/players/roundIndex";

export type InfoMode =
  | "DRAFT_RANK"
  | "PROJECTED"
  | "MATCH_AVG"
  | "TOTAL_PTS"
  | "FORM_3"
  | "LAST_SCORE"
  | "GAMES_PLAYED"
  | "TRIES"
  | "TRY_ASSISTS"
  | "LINEBREAKS"
  | "LINEBREAK_ASSISTS"
  | "DEFENDERS_BEATEN"
  | "METRES_GAINED"
  | "OFFLOADS"
  | "TACKLES"
  | "MISSED_TACKLES"
  | "TURNOVERS_FORCED"
  | "INTERCEPTIONS"
  | "KICKS_50_22"
  | "PENALTIES_CONCEDED"
  | "ERRORS"
  | "LINEOUTS_WON"
  | "LINEOUT_STEALS"
  | "LINEOUT_ERRORS"
  | "SCRUMS_WON"
  | "CONVERSIONS"
  | "PENALTY_GOALS"
  | "DROP_GOALS"
  | "YELLOW_CARDS"
  | "RED_CARDS";

// C1: points and stat totals follow the Per game / Total / Per 80 switch (draft rank, match
// average, form, last score and games don't)
export const VIEW_MODES = new Set<InfoMode>([
  "TOTAL_PTS", "TRIES", "TRY_ASSISTS", "LINEBREAKS", "LINEBREAK_ASSISTS", "DEFENDERS_BEATEN", "METRES_GAINED",
  "OFFLOADS", "TACKLES", "MISSED_TACKLES", "TURNOVERS_FORCED", "INTERCEPTIONS", "KICKS_50_22", "PENALTIES_CONCEDED",
  "ERRORS", "LINEOUTS_WON", "LINEOUT_STEALS", "LINEOUT_ERRORS", "SCRUMS_WON", "CONVERSIONS", "PENALTY_GOALS",
  "DROP_GOALS", "YELLOW_CARDS", "RED_CARDS",
]);

export type PlayerMetricsContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  roundRows: any[];
  statView: StatView;
  weekProj: WeekProjections | null;
  ownerByPlayerId: Map<string, string>;
  activeLeague: League | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draftTeams: any[];
};

/**
 * The player list's numbers (points, match average, form, stat totals...) for the Transactions
 * page, worked out from the season's stat rows. Made fresh on every draw of the page with its
 * current data, exactly as when these lived inside the page.
 */
export function createPlayerMetrics({ roundRows, statView, weekProj, ownerByPlayerId, activeLeague, draftTeams }: PlayerMetricsContext) {
function normaliseId(x: any) {
  return String(x ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function playerGetsScrumPoints(p: Player): boolean {
  return isFrontRow(p);
}

// Fantasy points for one stat row, using the shared scoring rules (lib/scoring).
// Returns null when the player didn't get on the field.
function getRoundPointsFromRow(row: any, p: Player): number | null {
  if (!row) return null;
  const counts = statCountsFromRow(row);
  if (!playedInRound(counts)) return null; // not played
  return playerPoints(counts, isFrontRow(p));
}

// Find rows belonging to this player.
// We check a wider set of possible ID column names.
function getPlayerRounds(playerId: string) {
  return playerRoundRows(roundRows, playerId); // grouped by player once (lib/players/roundIndex)
}

function getTotalPoints(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  let total = 0;
  let any = false;

  for (const r of rounds) {
    const pts = getRoundPointsFromRow(r, p);
    if (pts == null) continue;
    total += pts;
    any = true;
  }

  return any ? roundPoints(total) : null;
}

function getMatchesPlayed(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  // Count only rounds that actually have a points value
  const played = rounds.reduce((acc: number, r: any) => acc + (getRoundPointsFromRow(r, p) != null ? 1 : 0), 0);
  return played || null;
}

function getAvgPPG(p: Player): number | null {
  const tot = getTotalPoints(p);
  const gp = getMatchesPlayed(p);
  if (tot != null && gp != null && gp > 0) return tot / gp;
  return null;
}

// Return numeric value from a row by header (case-insensitive); missing => 0
function getRowNumber(row: any, header: string): number {
  if (!row) return 0;

  // direct
  if (row[header] != null) {
    const n = toNum(row[header]);
    return n != null ? n : 0;
  }

  // case-insensitive match
  const keys = Object.keys(row);
  const found = keys.find((k) => String(k).trim().toLowerCase() === header.trim().toLowerCase());
  if (found && row[found] != null) {
    const n = toNum(row[found]);
    return n != null ? n : 0;
  }

  return 0;
}

function getMetresGainedTotal(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  let totalMetres = 0;
  let any = false;

  for (const r of rounds) {
    const metres = getRowNumber(r, "Carries (m)");
    if (metres === 0) continue;
    totalMetres += metres;
    any = true;
  }

  return any ? totalMetres : null;
}

// Player "Form" = average total score over last 3 PLAYED rounds (most recent by round number)
function getFormLast3Avg(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  // keep only played rows (where getRoundPointsFromRow returns a number)
  const played = rounds
  .map((r: any) => ({ r, pts: getRoundPointsFromRow(r, p) }))
  .filter((x: any) => typeof x.pts === "number");

  if (!played.length) return null;

  // sort by round ascending (sheet has "round")
  played.sort((a: any, b: any) => (toNum(a.r?.round) ?? 0) - (toNum(b.r?.round) ?? 0));

  const last3 = played.slice(-3);
  const sum = last3.reduce((acc: number, x: any) => acc + (x.pts as number), 0);
  return sum / last3.length;
}

// Most recent score = points from latest PLAYED round
function getLastRoundPoints(p: Player): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  const played = rounds
  .map((r: any) => ({ r, pts: getRoundPointsFromRow(r, p) }))
  .filter((x: any) => typeof x.pts === "number");

  if (!played.length) return null;

  // sort by round ascending (sheet column "round")
  played.sort((a: any, b: any) => (toNum(a.r?.round) ?? 0) - (toNum(b.r?.round) ?? 0));

  const last = played[played.length - 1];
  return typeof last?.pts === "number" ? last.pts : null;
}

function getStatTotalCount(p: Player, header: string): number | null {
  const rounds = getPlayerRounds(p.id);
  if (!rounds.length) return null;

  let total = 0;
  let any = false;

  for (const r of rounds) {
    const v = getRowNumber(r, header);
    total += v;
    any = true;
  }

  return any ? total : null;
}

  function metricLabel(mode: InfoMode) {
  switch (mode) {
    case "DRAFT_RANK": return "Draft Rk";
    case "PROJECTED": return "Proj";
    case "MATCH_AVG": return "Match Avg";
    case "TOTAL_PTS": return "Fantasy Points";
    case "FORM_3": return "Form";
    case "LAST_SCORE": return "Last";
    case "GAMES_PLAYED": return "Games";

    case "TRIES": return "Tries";
    case "TRY_ASSISTS": return "Try Assists";
    case "LINEBREAKS": return "Line Breaks";
    case "LINEBREAK_ASSISTS": return "Line Break Asts";
    case "DEFENDERS_BEATEN": return "Defenders Beaten";
    case "METRES_GAINED": return "Metres";
    case "OFFLOADS": return "Offloads";
    case "TACKLES": return "Tackles";
    case "MISSED_TACKLES": return "Missed Tackles";
    case "TURNOVERS_FORCED": return "Turnovers";
    case "INTERCEPTIONS": return "Interceptions";
    case "KICKS_50_22": return "50:22s";
    case "PENALTIES_CONCEDED": return "Penalties";
    case "ERRORS": return "Errors";
    case "LINEOUTS_WON": return "Lineouts Won";
    case "LINEOUT_STEALS": return "Lineout Steals";
    case "LINEOUT_ERRORS": return "Lineout Errors";
    case "SCRUMS_WON": return "Scrums Won";
    case "CONVERSIONS": return "Conversions";
    case "PENALTY_GOALS": return "Penalty Goals";
    case "DROP_GOALS": return "Drop Goals";
    case "YELLOW_CARDS": return "Yellow Cards";
    case "RED_CARDS": return "Red Cards";
    default: return "—";
  }
}

  function metricValue(p: Player, mode: InfoMode): string {
  if (VIEW_MODES.has(mode)) return formatStatView(metricSortValue(p, mode), statView);
  // Basic score-derived stats
  if (mode === "DRAFT_RANK") return typeof p.draftRank === "number" ? String(p.draftRank) : "-";
  if (mode === "PROJECTED") {
    const pr = projectionFor(weekProj, p.id);
    return pr ? formatProjection(pr.pts) : "-";
  }

  if (mode === "MATCH_AVG") {
    const v = getAvgPPG(p);
    return typeof v === "number" ? v.toFixed(1) : "-";
  }

  if (mode === "TOTAL_PTS") {
    const t = getTotalPoints(p);
    return typeof t === "number" ? String(Math.round(t)) : "-";
  }

  if (mode === "FORM_3") {
    const f = getFormLast3Avg(p);
    return typeof f === "number" ? f.toFixed(1) : "-";
  }

  if (mode === "LAST_SCORE") {
  const v = getLastRoundPoints(p);
  return typeof v === "number" ? String(Math.round(v)) : "-";
}

  if (mode === "GAMES_PLAYED") {
    const gp = getMatchesPlayed(p);
    return typeof gp === "number" ? String(gp) : "-";
  }

  // Stat totals shown as COUNTS (convert points -> count)
  const stat = (header: string) => getStatTotalCount(p, header);

  switch (mode) {
    case "TRIES": {
  const v = stat("Tries");
  return v == null ? "-" : String(v);
}
case "TRY_ASSISTS": {
  const v = stat("Try Assists");
  return v == null ? "-" : String(v);
}
case "LINEBREAKS": {
  const v = stat("Linebreaks");
  return v == null ? "-" : String(v);
}
case "LINEBREAK_ASSISTS": {
  const v = stat("Linebreak assists");
  return v == null ? "-" : String(v);
}
case "DEFENDERS_BEATEN": {
  const v = stat("Defenders beaten");
  return v == null ? "-" : String(v);
}

    case "METRES_GAINED": {
  const m = getMetresGainedTotal(p);
  return typeof m === "number" ? String(Math.round(m)) : "-";
}

case "OFFLOADS": {
  const v = stat("Offloads");
  return v == null ? "-" : String(v);
}
case "TACKLES": {
  const v = stat("Tackles");
  return v == null ? "-" : String(v);
}
case "MISSED_TACKLES": {
  const v = stat("Missed tackles");
  return v == null ? "-" : String(v);
}
case "TURNOVERS_FORCED": {
  const v = stat("Turnover Forced");
  return v == null ? "-" : String(v);
}
case "INTERCEPTIONS": {
  const v = stat("Interceptions");
  return v == null ? "-" : String(v);
}
case "KICKS_50_22": {
  const v = stat("50:22 Kicks");
  return v == null ? "-" : String(v);
}
case "PENALTIES_CONCEDED": {
  const v = stat("Penalties Conceded");
  return v == null ? "-" : String(v);
}
case "ERRORS": {
  const v = stat("Errors");
  return v == null ? "-" : String(v);
}

case "LINEOUTS_WON": {
  const v = stat("Lineouts won");
  return v == null ? "-" : String(v);
}
case "LINEOUT_STEALS": {
  const v = stat("Lineout steals");
  return v == null ? "-" : String(v);
}
case "LINEOUT_ERRORS": {
  const v = stat("Lineout errors");
  return v == null ? "-" : String(v);
}
case "SCRUMS_WON": {
  const v = playerGetsScrumPoints(p) ? stat("Scrums won outright") : 0;
  return v == null ? "-" : String(v);
}
case "CONVERSIONS": {
  const v = stat("Conversions");
  return v == null ? "-" : String(v);
}
case "PENALTY_GOALS": {
  const v = stat("Penalty scored");
  return v == null ? "-" : String(v);
}
case "DROP_GOALS": {
  const v = stat("Drop goal scored");
  return v == null ? "-" : String(v);
}
case "YELLOW_CARDS": {
  const v = stat("Yellow cards");
  return v == null ? "-" : String(v);
}
case "RED_CARDS": {
  const v = stat("Red cards");
  return v == null ? "-" : String(v);
}

    default:
      return "-";
  }
}

function ownerTeamLabelForPlayerId(playerId: string): string {
  const ownerTeamId = ownerByPlayerId.get(playerId) ?? null;

  if (!ownerTeamId) return "Available";

  // Prefer activeLeague teams (these are the league team names you want displayed)
  const leagueTeam = activeLeague?.teams?.find((t: any) => t.id === ownerTeamId);
  if (leagueTeam?.name) return leagueTeam.name;

  // Fallback: draftTeams
  const draftTeam = draftTeams?.find((t: any) => t.id === ownerTeamId);
  if (draftTeam?.name) return draftTeam.name;

  return "Owned";
}

function metricSortValue(p: Player, mode: InfoMode): number | null {
  const raw = metricRawValue(p, mode);
  if (!VIEW_MODES.has(mode)) return raw;
  return applyStatView(raw, getMatchesPlayed(p) ?? 0, getStatTotalCount(p, "Minutes played") ?? 0, statView);
}

function metricRawValue(p: Player, mode: InfoMode): number | null {
  if (mode === "DRAFT_RANK") return typeof p.draftRank === "number" ? p.draftRank : null;
  if (mode === "PROJECTED") return projectionFor(weekProj, p.id)?.pts ?? null;

  if (mode === "MATCH_AVG") return getAvgPPG(p);
  if (mode === "TOTAL_PTS") return getTotalPoints(p);
  if (mode === "FORM_3") return getFormLast3Avg(p);
  if (mode === "LAST_SCORE") return getLastRoundPoints(p);
  if (mode === "GAMES_PLAYED") return getMatchesPlayed(p);

  // stat totals as counts (points -> count)
  const stat = (header: string) => getStatTotalCount(p, header);

  switch (mode) {
    case "TRIES": return stat("Tries");
case "TRY_ASSISTS": return stat("Try Assists");
case "LINEBREAKS": return stat("Linebreaks");
case "LINEBREAK_ASSISTS": return stat("Linebreak assists");
case "DEFENDERS_BEATEN": return stat("Defenders beaten");
case "METRES_GAINED": return getMetresGainedTotal(p);
case "OFFLOADS": return stat("Offloads");
case "TACKLES": return stat("Tackles");
case "MISSED_TACKLES": return stat("Missed tackles");
case "TURNOVERS_FORCED": return stat("Turnover Forced");
case "INTERCEPTIONS": return stat("Interceptions");
case "KICKS_50_22": return stat("50:22 Kicks");
case "PENALTIES_CONCEDED": return stat("Penalties Conceded");
case "ERRORS": return stat("Errors");
case "LINEOUTS_WON": return stat("Lineouts won");
case "LINEOUT_STEALS": return stat("Lineout steals");
case "LINEOUT_ERRORS": return stat("Lineout errors");
case "SCRUMS_WON": return playerGetsScrumPoints(p) ? stat("Scrums won outright") : 0;
case "CONVERSIONS": return stat("Conversions");
case "PENALTY_GOALS": return stat("Penalty scored");
case "DROP_GOALS": return stat("Drop goal scored");
case "YELLOW_CARDS": return stat("Yellow cards");
case "RED_CARDS": return stat("Red cards");
    default:
      return null;
  }
}
  return { metricLabel, metricSortValue, metricValue, ownerTeamLabelForPlayerId };
}
