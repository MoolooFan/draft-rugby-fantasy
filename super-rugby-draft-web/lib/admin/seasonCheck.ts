// lib/admin/seasonCheck.ts
// The Admin page's season setup checklist (Ethan, 19 Nov 2026): before a season's draft, checks
// what Ethan loads by hand (fixtures, the player pool, jerseys and logos, photos, difficulty
// ratings) and points at anything missing or doubled up. Pure code (scripts/tests/season-check.test.ts);
// the data is loaded by app/api/admin/season-check.
import type { SeasonConfig } from "@/lib/season";
import { teamCodeFromName } from "@/lib/status/articles";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";

export type CheckStatus = "ok" | "warn" | "fail";
export type CheckItem = { id: string; label: string; status: CheckStatus; detail: string; items?: string[] };

export type CheckPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  draftRank: number | null;
  externalId: number | null;
};

export const POSITIONS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"] as const;
/** fewest of each main position a Super Rugby squad should have (warn below this) */
export const MIN_PER_POSITION: Record<(typeof POSITIONS)[number], number> = { PR: 3, HO: 2, LK: 3, LF: 4, HB: 2, FH: 2, CE: 3, OB: 4 };
export const MIN_SQUAD = 28;
const SHOW = 12; // names listed per check

const fixtureTeam = (name: string) => normalizeTeamCode(teamCodeFromName(name) ?? name);
const nameOf = (p: CheckPlayer) => `${p.firstName} ${p.lastName} (${p.teamCode})`;
const list = (xs: string[]) => (xs.length > SHOW ? [...xs.slice(0, SHOW), `…and ${xs.length - SHOW} more`] : xs);
const item = (id: string, label: string, bad: string[], level: "warn" | "fail", okText: string, badText: (n: number) => string): CheckItem =>
  bad.length ? { id, label, status: level, detail: badText(bad.length), items: list(bad) } : { id, label, status: "ok", detail: okText };

export function seasonChecks(input: {
  season: number;
  cfg: SeasonConfig | null;
  players: CheckPlayer[];
  /** player ids with a photo (lower case) */
  photoIds: Set<string>;
  /** teams (names or codes) with difficulty ratings for the season */
  difficultyTeams: string[];
  jerseys: Record<string, unknown>;
  logos: Record<string, unknown>;
}): CheckItem[] {
  const { cfg, players } = input;
  const out: CheckItem[] = [];
  if (!cfg) {
    out.push({ id: "season", label: "Season settings", status: "fail", detail: `There are no season settings for ${input.season} (lib/season)` });
    return out;
  }

  // --- fixtures
  const fx = cfg.fixtures;
  const teams = [...new Set(fx.flatMap((f) => [fixtureTeam(f.homeTeam), fixtureTeam(f.awayTeam)]))].sort();
  const realRounds = [...new Set(fx.map((f) => Number(f.week)))].sort((a, b) => a - b);
  out.push(
    fx.length
      ? { id: "fixtures", label: "Fixtures", status: "ok", detail: `${fx.length} games over ${realRounds.length} rounds, ${teams.length} teams` }
      : { id: "fixtures", label: "Fixtures", status: "fail", detail: `No fixtures for ${input.season} yet (data/fixtures-${input.season}.json)` }
  );
  if (!fx.length) return out;

  const unknownTeams = [...new Set(fx.flatMap((f) => [f.homeTeam, f.awayTeam]).filter((n) => !teamCodeFromName(n)))];
  out.push(item("fixture-teams", "Fixture team names", unknownTeams, "fail", "Every team name is recognised", (n) => `${n} team name${n === 1 ? " isn't" : "s aren't"} recognised`));

  const badKickoff = fx.filter((f) => !Number.isFinite(Date.parse(f.kickoffAt))).map((f) => `${f.id}: "${f.kickoffAt}"`);
  out.push(item("kickoffs", "Kickoff times", badKickoff, "fail", "Every game has a kickoff time", (n) => `${n} game${n === 1 ? " has" : "s have"} no proper kickoff time`));

  const ids = new Map<string, number>();
  for (const f of fx) ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
  const dupIds = [...ids].filter(([, n]) => n > 1).map(([id, n]) => `${id} (${n} times)`);
  out.push(item("fixture-ids", "Fixture ids", dupIds, "fail", "Every game has its own id", (n) => `${n} id${n === 1 ? " is" : "s are"} used more than once`));

  // fantasy weeks: every round in exactly one week, and each team plays at most once per week
  const inWeeks = cfg.fantasyWeeks.flat();
  const missingRounds = realRounds.filter((r) => !inWeeks.includes(r)).map((r) => `Round ${r}`);
  const twiceRounds = [...new Set(inWeeks.filter((r, i) => inWeeks.indexOf(r) !== i))].map((r) => `Round ${r}`);
  const emptyWeeks = cfg.fantasyWeeks.map((rs, i) => ({ i, n: fx.filter((f) => rs.includes(Number(f.week))).length })).filter((w) => !w.n).map((w) => `Week ${w.i + 1}`);
  out.push(
    item("weeks", "Fantasy weeks", [...missingRounds.map((r) => `${r} isn't in any week`), ...twiceRounds.map((r) => `${r} is in more than one week`), ...emptyWeeks.map((w) => `${w} has no games`)], "fail",
      `${cfg.fantasyWeeks.length} weeks, every round in one of them`, (n) => `${n} problem${n === 1 ? "" : "s"} with the weeks`)
  );
  const twice: string[] = [];
  cfg.fantasyWeeks.forEach((rs, i) => {
    const count = new Map<string, number>();
    for (const f of fx.filter((x) => rs.includes(Number(x.week)))) for (const t of [fixtureTeam(f.homeTeam), fixtureTeam(f.awayTeam)]) count.set(t, (count.get(t) ?? 0) + 1);
    for (const [t, n] of count) if (n > 1) twice.push(`Week ${i + 1}: ${t} plays ${n} times`);
  });
  out.push(item("double-games", "One game per team per week", twice, "warn", "No team plays twice in a fantasy week", (n) => `${n} time${n === 1 ? "" : "s"} a team plays twice in a week`));

  // --- players
  out.push(
    players.length
      ? { id: "players", label: "Player pool", status: "ok", detail: `${players.length} active players` }
      : { id: "players", label: "Player pool", status: "fail", detail: `No players loaded for ${input.season} yet` }
  );
  if (players.length) {
    const noTeam = players.filter((p) => !teams.includes(normalizeTeamCode(p.teamCode))).map(nameOf);
    out.push(item("player-teams", "Players' teams", noTeam, "fail", "Every player's team is in the fixtures", (n) => `${n} player${n === 1 ? "'s team isn't" : "s' teams aren't"} in the fixtures`));

    const short: string[] = [];
    for (const t of teams) {
      const squad = players.filter((p) => normalizeTeamCode(p.teamCode) === t);
      if (squad.length < MIN_SQUAD) short.push(`${t}: ${squad.length} players`);
      for (const pos of POSITIONS) {
        const n = squad.filter((p) => p.posAbbrev === pos).length;
        if (n < MIN_PER_POSITION[pos]) short.push(`${t}: ${n} ${pos}`);
      }
    }
    out.push(item("squads", "Squad sizes", short, "warn", `Every team has ${MIN_SQUAD}+ players and enough in each position`, (n) => `${n} squad${n === 1 ? " looks" : "s look"} short`));

    const byName = new Map<string, CheckPlayer[]>();
    for (const p of players) {
      const k = `${p.firstName} ${p.lastName}`.toLowerCase().replace(/[^a-z]/g, "");
      byName.set(k, [...(byName.get(k) ?? []), p]);
    }
    const dupNames = [...byName.values()].filter((ps) => ps.length > 1).map((ps) => ps.map(nameOf).join(" / "));
    out.push(item("dup-names", "Players listed twice", dupNames, "warn", "No player is in the pool twice", (n) => `${n} name${n === 1 ? " is" : "s are"} in the pool more than once`));

    const byExt = new Map<number, CheckPlayer[]>();
    for (const p of players) if (p.externalId != null) byExt.set(p.externalId, [...(byExt.get(p.externalId) ?? []), p]);
    const dupExt = [...byExt].filter(([, ps]) => ps.length > 1).map(([id, ps]) => `${id}: ${ps.map(nameOf).join(" / ")}`);
    out.push(item("dup-ext", "playfantasyrugby ids", dupExt, "fail", "No two players share a playfantasyrugby id", (n) => `${n} id${n === 1 ? " is" : "s are"} on more than one player`));

    const noExt = players.filter((p) => p.externalId == null).map(nameOf);
    out.push(item("no-ext", "Stats links", noExt, "warn", "Every player has a playfantasyrugby id (for stats)", (n) => `${n} player${n === 1 ? " has" : "s have"} no playfantasyrugby id, so no stats`));

    const noRank = players.filter((p) => !p.draftRank || p.draftRank <= 0 || p.draftRank >= 9999).map(nameOf);
    const ranks = new Map<number, CheckPlayer[]>();
    for (const p of players) if (p.draftRank && p.draftRank > 0 && p.draftRank < 9999) ranks.set(p.draftRank, [...(ranks.get(p.draftRank) ?? []), p]);
    const dupRank = [...ranks].filter(([, ps]) => ps.length > 1).map(([r, ps]) => `#${r}: ${ps.map(nameOf).join(" / ")}`);
    out.push(item("ranks", "Draft ranks", [...noRank.map((x) => `${x}: no rank`), ...dupRank], "warn", "Every player has his own draft rank", (n) => `${n} missing or shared rank${n === 1 ? "" : "s"}`));

    const noPhoto = players.filter((p) => !input.photoIds.has(p.id.toLowerCase())).map(nameOf);
    out.push(item("photos", "Player photos", noPhoto, "warn", "Every player has a photo", (n) => `${n} player${n === 1 ? " has" : "s have"} no photo`));
  }

  // --- jerseys, logos, difficulty
  out.push(item("jerseys", "Jerseys", teams.filter((t) => !input.jerseys[t]), "fail", `A jersey for all ${teams.length} teams`, (n) => `${n} team${n === 1 ? " has" : "s have"} no jersey`));
  out.push(item("logos", "Team logos", teams.filter((t) => !input.logos[t]), "warn", `A logo for all ${teams.length} teams`, (n) => `${n} team${n === 1 ? " has" : "s have"} no logo`));
  const rated = new Set(input.difficultyTeams.map((t) => fixtureTeam(t))); // saved by team name
  out.push(item("difficulty", "Difficulty ratings", teams.filter((t) => !rated.has(t)), "warn", "Every team has home and away ratings", (n) => `${n} team${n === 1 ? " has" : "s have"} no ratings (Difficulty tab)`));

  return out;
}
