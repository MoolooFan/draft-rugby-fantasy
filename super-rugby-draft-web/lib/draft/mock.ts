// lib/draft/mock.ts
// Mock drafts (Ethan, 21 Nov 2026): practise against computer teams, before joining a league or
// while in one (before or after its draft). They run in the browser only: nothing goes in any
// league, and the last 5 finished mock drafts are kept on that phone / computer.
// The computer teams pick with lib/draft/cpu.ts; when your clock runs out (or you ask), your pick
// is made by your draft strategy (lib/draft/strategy.ts), like auto-pick in a real draft.
import { rosterSize, squadFits, STANDARD_SQUAD, TEN_SQUAD, type SquadFormat } from "@/lib/league/squad";
import { roundForPick, shuffled, teamForPick } from "@/lib/draft/rules";
import { CPU_TEAM_NAMES, cpuPick, draftGrade, makePersonality, teamStrength, type CpuPlayer, type DraftValues, type Personality } from "@/lib/draft/cpu";
import { strategyChoice, type DraftStrategy } from "@/lib/draft/strategy";

export type MockSpeed = "quick" | "normal" | "slow";
// how long a computer team takes to pick: about 5 seconds as standard (Ethan, 25 Nov 2026)
export const SPEED_MS: Record<MockSpeed, number> = { quick: 2000, normal: 5000, slow: 10000 };
export const SPEED_LABEL: Record<MockSpeed, string> = { quick: "Quick (2 s)", normal: "Normal (5 s)", slow: "Slow (10 s)" };
export const TIMER_OPTIONS = [0, 30, 60, 90] as const;

export type MockSettings = {
  teams: number;
  /** your pick in round 1 (1-based); 0 = random */
  slot: number;
  /** "standard", "ten" (10 starters) or "league" (the league's own squad) */
  squad: "standard" | "ten" | "league";
  leagueId?: string | null;
  leagueName?: string | null;
  /** seconds for your pick; 0 = no clock */
  timer: number;
  speed: MockSpeed;
};

export type MockDraft = {
  id: string;
  startedAt: number;
  finishedAt?: number;
  settings: MockSettings;
  format: SquadFormat;
  /** team names; index = team number */
  teamNames: string[];
  /** your team number */
  you: number;
  /** draft order (team numbers as strings, for lib/draft/rules) */
  order: string[];
  /** player ids, in pick order */
  picks: string[];
  personalities: Personality[];
  /** filled in when it finishes */
  result?: { strengths: number[]; grades: string[] };
};

export const MOCK_LIMITS = { minTeams: 2, maxTeams: 16 } as const;

export function mockFormat(settings: MockSettings, leagueFormat?: SquadFormat | null): SquadFormat {
  if (settings.squad === "ten") return TEN_SQUAD;
  if (settings.squad === "league" && leagueFormat) return leagueFormat;
  return STANDARD_SQUAD;
}

/** Set up a new mock draft. */
export function startMock(settings: MockSettings, format: SquadFormat, rng: () => number = Math.random): MockDraft {
  const teams = Math.max(MOCK_LIMITS.minTeams, Math.min(MOCK_LIMITS.maxTeams, Math.round(settings.teams)));
  const slot = settings.slot >= 1 && settings.slot <= teams ? settings.slot : 1 + Math.floor(rng() * teams);
  const names = shuffled(CPU_TEAM_NAMES).slice(0, teams - 1);
  // team 0 is you; the order puts you at your slot and the computer teams around you
  const others = Array.from({ length: teams - 1 }, (_, i) => String(i + 1));
  const order = [...others.slice(0, slot - 1), "0", ...others.slice(slot - 1)];
  return {
    id: `mock_${Date.now().toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`,
    startedAt: Date.now(),
    settings: { ...settings, teams, slot },
    format,
    teamNames: ["Your Team", ...names],
    you: 0,
    order,
    picks: [],
    personalities: [{ bias: {}, noise: 0 }, ...Array.from({ length: teams - 1 }, () => makePersonality(rng))],
  };
}

export const totalPicks = (m: MockDraft) => m.order.length * rosterSize(m.format);
export const isFinished = (m: MockDraft) => m.picks.length >= totalPicks(m);
/** The team picking at overall pick number n (1-based). */
export const teamAt = (m: MockDraft, n: number) => Number(teamForPick(m.order, n));
/** The team on the clock now (-1 when finished). */
export const onTheClock = (m: MockDraft) => (isFinished(m) ? -1 : teamAt(m, m.picks.length + 1));
export const currentRound = (m: MockDraft) => roundForPick(m.order.length, Math.min(m.picks.length + 1, totalPicks(m)));

/** Pick label like "3.07" (round 3, 7th pick of the round). */
export function pickLabel(m: MockDraft, n: number): string {
  const teams = m.order.length;
  const r = roundForPick(teams, n);
  const inRound = n - (r - 1) * teams;
  return `${r}.${String(inRound).padStart(2, "0")}`;
}

/** Each team's players (ids), in the order they were picked. */
export function mockRosters(m: MockDraft): string[][] {
  const out: string[][] = m.order.map(() => []);
  m.picks.forEach((id, i) => out[teamAt(m, i + 1)].push(id));
  return out;
}

/** Picks until you're up (0 = you're on the clock, -1 = you have no picks left). */
export function picksUntilYou(m: MockDraft): number {
  for (let n = m.picks.length + 1; n <= totalPicks(m); n++) if (teamAt(m, n) === m.you) return n - m.picks.length - 1;
  return -1;
}

/** Players nobody has taken, who keep this team's roster legal. */
export function fittingAvailable<T extends CpuPlayer>(m: MockDraft, players: T[], team: number, byId: Map<string, T>): T[] {
  const taken = new Set(m.picks);
  const roster = mockRosters(m)[team].map((id) => byId.get(id)).filter((p): p is T => !!p);
  return players.filter((p) => !taken.has(p.id) && squadFits([...roster, p], m.format));
}

/** The pick the team on the clock makes: a computer team's choice, or yours by your strategy. */
export function autoChoice<T extends CpuPlayer>(m: MockDraft, players: T[], byId: Map<string, T>, values: DraftValues, strategy: DraftStrategy | null, rng: () => number = Math.random): T | null {
  const team = onTheClock(m);
  if (team < 0) return null;
  const taken = new Set(m.picks);
  const roster = mockRosters(m)[team].map((id) => byId.get(id)).filter((p): p is T => !!p);
  if (team === m.you) {
    return strategyChoice({ available: fittingAvailable(m, players, team, byId), round: currentRound(m), totalRounds: rosterSize(m.format), strategy });
  }
  return cpuPick({ available: players.filter((p) => !taken.has(p.id)), roster, format: m.format, values, personality: m.personalities[team], rng });
}

/** Add a pick (returns a new mock draft; scores it when the last pick is made). */
export function withPick<T extends CpuPlayer>(m: MockDraft, playerId: string, byId: Map<string, T>, values: DraftValues): MockDraft {
  const next: MockDraft = { ...m, picks: [...m.picks, playerId] };
  if (isFinished(next)) {
    const strengths = mockRosters(next).map((ids) => teamStrength(ids.map((id) => byId.get(id)).filter((p): p is T => !!p), next.format, values));
    next.result = { strengths, grades: strengths.map((s) => draftGrade(s, strengths)) };
    next.finishedAt = Date.now();
  }
  return next;
}

/** Where you finished by team strength (1 = best). */
export function yourPlace(m: MockDraft): number {
  const s = m.result?.strengths ?? [];
  return 1 + s.filter((x, i) => i !== m.you && x > s[m.you]).length;
}

// ---------------------------------------------------------------------------
// Kept on this device: the last 5 finished mock drafts, and one in progress (so a refresh or a
// trip to another page doesn't lose it).
const HISTORY_KEY = "sr-mock-drafts-v1";
const LIVE_KEY = "sr-mock-draft-live-v1";
export const HISTORY_SIZE = 5;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: carry on without it */
  }
}

export const loadHistory = (): MockDraft[] => read<MockDraft[]>(HISTORY_KEY, []).filter((m) => m && Array.isArray(m.picks));
export function saveToHistory(m: MockDraft): MockDraft[] {
  const list = [m, ...loadHistory().filter((x) => x.id !== m.id)].slice(0, HISTORY_SIZE);
  write(HISTORY_KEY, list);
  return list;
}
export const loadLive = (): MockDraft | null => {
  const m = read<MockDraft | null>(LIVE_KEY, null);
  return m && Array.isArray(m.picks) && !isFinished(m) ? m : null;
};
export const saveLive = (m: MockDraft | null) => write(LIVE_KEY, m);
