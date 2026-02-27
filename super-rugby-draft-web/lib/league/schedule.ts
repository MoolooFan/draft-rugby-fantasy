// lib/league/schedule.ts
import type { LeagueTeam, PlayoffFormat } from "./types";

export type MatchupRow = {
  weekNo: number;
  homeTeamId: string | null; // null = BYE / placeholder
  awayTeamId: string | null; // null = BYE / placeholder

  // ✅ NEW: optional metadata for playoffs / labels
  kind?: "regular" | "playoff" | "consolation";
  label?: string; // e.g. "Semi Final 1", "Final", "5th Place Final"
};

function rotate<T>(arr: T[]) {
  if (arr.length <= 2) return arr;
  const fixed = arr[0];
  const rest = arr.slice(1);
  const last = rest.pop()!;
  return [fixed, last, ...rest];
}

export function buildRoundRobinSchedule(params: {
  teams: LeagueTeam[];
  weeks: number;
}): MatchupRow[] {
  const { teams, weeks } = params;
  if (teams.length < 2) return [];

  let ids: Array<string | null> = teams.map((t) => t.id);
  const isOdd = ids.length % 2 === 1;
  if (isOdd) ids = [...ids, null];

  const n = ids.length;
  const roundsPerCycle = n - 1;

  let wheel = [...ids];
  const cycle: MatchupRow[] = [];

  for (let round = 1; round <= roundsPerCycle; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = wheel[i];
      const b = wheel[n - 1 - i];

      const home = round % 2 === 1 ? a : b;
      const away = round % 2 === 1 ? b : a;

      cycle.push({
        weekNo: round,
        homeTeamId: home,
        awayTeamId: away,
        kind: "regular",
      });
    }
    wheel = rotate(wheel);
  }

  const out: MatchupRow[] = [];
  for (let w = 1; w <= weeks; w++) {
    const roundIndex = ((w - 1) % roundsPerCycle) + 1;
    const rowsForRound = cycle.filter((r) => r.weekNo === roundIndex);
    for (const row of rowsForRound) out.push({ ...row, weekNo: w, kind: "regular" });
  }

  return out;
}

function playoffWeekCount(fmt: PlayoffFormat): number {
  if (fmt === "none") return 0;
  if (fmt === "final2") return 1;
  if (fmt === "final3") return 2;
  return 2; // final4
}

/**
 * Placeholder playoff + consolation rows.
 * IMPORTANT: This does NOT assign real teamIds yet.
 * It only creates labeled rows so Fixtures/Results can show "Semi Final 1", etc.
 */
function buildPlayoffPlaceholders(params: {
  teams: LeagueTeam[];
  startWeekNo: number; // first playoff week number
  playoffFormat: PlayoffFormat;
}): MatchupRow[] {
  const { teams, startWeekNo, playoffFormat } = params;
  const n = teams.length;

  const rows: MatchupRow[] = [];
  const w1 = startWeekNo;
  const w2 = startWeekNo + 1;

  const addLabel = (weekNo: number, label: string, kind: "playoff" | "consolation") => {
    rows.push({
      weekNo,
      homeTeamId: null,
      awayTeamId: null,
      label,
      kind,
    });
  };

  if (playoffFormat === "none") return rows;

  if (playoffFormat === "final4") {
    // Week 1: Semis + consolation semis (for remaining teams)
    addLabel(w1, "Semi Final 1", "playoff");
    addLabel(w1, "Semi Final 2", "playoff");

    // Consolation bracket for places 5+
    // If 8 teams: two consolation semis
    // If 6 teams: one consolation semi + one bye-ish (still label)
    // If 5 teams: one consolation game label
    if (n > 4) {
      const consolationGames = Math.floor((n - 4) / 2) + ((n - 4) % 2);
      for (let i = 1; i <= consolationGames; i++) {
        addLabel(w1, `Consolation Semi Final ${i}`, "consolation");
      }
    }

    // Week 2: Final + placing games
    addLabel(w2, "Grand Final", "playoff");
    addLabel(w2, "3rd Place Playoff", "playoff");

    if (n > 4) {
      const consolationFinals = Math.floor((n - 4) / 2) + ((n - 4) % 2);
      for (let i = 1; i <= consolationFinals; i++) {
        addLabel(w2, `Consolation Final ${i}`, "consolation");
      }
    }

    return rows;
  }

  if (playoffFormat === "final3") {
    // Week 1: Qualifying Final + consolation
    addLabel(w1, "Qualifying Final", "playoff"); // typically 2v3
    if (n > 3) {
      const consolationGames = Math.floor((n - 3) / 2) + ((n - 3) % 2);
      for (let i = 1; i <= consolationGames; i++) addLabel(w1, `Consolation Game ${i}`, "consolation");
    }

    // Week 2: Grand Final + placing
    addLabel(w2, "Grand Final", "playoff"); // typically 1 v winner QF
    addLabel(w2, "3rd Place Playoff", "playoff"); // optional but good for ranks
    if (n > 3) {
      const consolationGames2 = Math.floor((n - 3) / 2) + ((n - 3) % 2);
      for (let i = 1; i <= consolationGames2; i++) addLabel(w2, `Consolation Game ${i}`, "consolation");
    }

    return rows;
  }

  // final2
  addLabel(w1, "Grand Final", "playoff"); // typically 1v2
  addLabel(w1, "3rd Place Playoff", "playoff");
  if (n > 4) {
    const consolationGames = Math.floor((n - 4) / 2) + ((n - 4) % 2);
    for (let i = 1; i <= consolationGames; i++) addLabel(w1, `Consolation Game ${i}`, "consolation");
  }

  return rows;
}

export function buildLeagueSchedule(params: {
  teams: LeagueTeam[];
  totalWeeks: number;     // ✅ regular season fantasy weeks
  currentWeek: number;
  playoffFormat: PlayoffFormat;
}): MatchupRow[] {
  // Regular season schedule only uses totalWeeks
  const regular = buildRoundRobinSchedule({ teams: params.teams, weeks: params.totalWeeks });

  const pw = playoffWeekCount(params.playoffFormat);
  if (pw <= 0) return regular;

  // Append playoff placeholders AFTER regular season
  const playoffs = buildPlayoffPlaceholders({
    teams: params.teams,
    startWeekNo: params.totalWeeks + 1,
    playoffFormat: params.playoffFormat,
  });

  return [...regular, ...playoffs];
}