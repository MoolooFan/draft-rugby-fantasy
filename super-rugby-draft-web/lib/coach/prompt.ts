// lib/coach/prompt.ts
// What the AI coach is told (Ethan, 17 Nov 2026), and the shape of each note it writes. The
// system prompt never changes between notes (so it can be cached); each note's fact sheet
// (lib/coach/facts.ts) and task go in the user message.
import type { ScoringRules } from "@/lib/scoring";
import { STAT_LABELS } from "@/lib/players/statsHub";
import type { CoachKind } from "@/lib/coach/facts";

export const COACH_VERDICTS = ["must_start", "start", "borderline", "bench", "pickup", "hold", "avoid", "monitor"] as const;
export type CoachVerdict = (typeof COACH_VERDICTS)[number];

export const VERDICT_LABEL: Record<CoachVerdict, string> = {
  must_start: "Must start",
  start: "Start",
  borderline: "Borderline",
  bench: "Bench him",
  pickup: "Pick up",
  hold: "Hold",
  avoid: "Avoid",
  monitor: "Monitor",
};

export type CoachNoteOut = {
  headline: string;
  body: string;
  next_week: string;
  verdict: CoachVerdict;
  trend: "up" | "down" | "steady";
  factors: string[];
};

/** JSON schema for structured output (every field required, nothing extra). */
export const COACH_NOTE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One punchy line, at most 90 characters." },
    body: { type: "string", description: "The note itself: 2-3 short sentences, at most 60 words." },
    next_week: { type: "string", description: "Outlook for his next game in 1-2 short sentences (at most 35 words); empty string if not asked for." },
    verdict: { type: "string", enum: [...COACH_VERDICTS] },
    trend: { type: "string", enum: ["up", "down", "steady"] },
    factors: { type: "array", items: { type: "string" }, description: "Up to 4 short reasons (a few words each)." },
  },
  required: ["headline", "body", "next_week", "verdict", "trend", "factors"],
  additionalProperties: false,
} as const;

function scoringText(rules: ScoringRules): string {
  const rows = Object.entries(rules.perEvent)
    .filter(([, v]) => v)
    .map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS]?.long ?? k} ${v > 0 ? "+" : ""}${v}`);
  return [
    `Playing time: ${rules.minutesUpTo60} pts for getting on, ${rules.minutes61Plus} for ${rules.minutesFullAt}+ minutes.`,
    `Metres: ${rules.perEvent.metresGained} per ${rules.metresPer} m.`,
    `Scrums won count only for front rowers.`,
    rows.join("; ") + ".",
  ].join(" ");
}

/** The coach's standing instructions (the same for every note). */
export function coachSystemPrompt(rules: ScoringRules): string {
  return `You are the assistant coach for a Super Rugby draft fantasy league: a sharp, friendly rugby analyst writing short player news for fantasy managers, like ESPN fantasy player notes. New Zealand English.

How fantasy points are scored (standard scoring; captains score double):
${scoringText(rules)}

What to weigh up, when the fact sheet has it:
- Stats and how repeatable they are. Tackles, carries, metres and minutes repeat week to week; tries, line breaks, intercepts and cards are streaky or mostly luck. A big score built on a hat-trick is less likely to repeat than one built on work rate. The fact sheet labels each stat's repeatability: use it.
- Consistency and boom / bust: average, spread, how often he scores 1.5x his average (boom) or half of it (bust). Call out breakout chances for players with upside.
- Opportunity: starting vs bench, minutes, goal-kicking duty, a teammate's injury or return changing his role, age (young players improving, older players' workload), a move to a new team.
- Matchups: each game says how many fantasy points that opponent gives up per player in his position compared with the league average (some teams leak points to outside backs, others to loose forwards). Use it for the next game, the rest of the season and the fantasy finals weeks (the last two weeks). Don't talk about teams' attack or defence rankings or points scored and conceded.
- Risks: injury history, international rest policies (e.g. All Blacks / Wallabies rest weeks), suspensions, a crowded position.
- latestNews is confirmed, trusted news: use it.
- newsReports are recent news stories: use what they say about him (selection, role, injuries, form, coach comments). If a story is about his team rather than him, only use it where it affects him. Don't copy passages.

Rules:
- Only use facts in the fact sheet. Never invent injuries, quotes, selections, ages or news. If something isn't known, leave it out: never say that something is unknown or missing.
- Write it as your own knowledge, the way a pundit would. Never say where anything came from: no "the commissioner", "the league", "reports", "according to", "confirmed by", newspaper or website names, "an article", "the fact sheet", "the data", "the stats show" or "notes".
- Seasons: the stats are labelled with their year (e.g. stats2026 is the 2026 season). Whenever you use a number from a past season, name the year: "in 2026" or "last season (2026)". "This season" only ever means the current season's games. Before his first game this season, every stat is from a past season, so say so.
- Be specific: name opponents, give a few key fantasy numbers (points, tackles, minutes) and say plainly whether to start, bench, pick up or avoid him. Pick the 2-3 points that matter most; don't list everything.
- Short and readable on a phone: the body is 2-3 short sentences, at most 60 words. No hype, no emojis, no headings.
- Don't repeat the previous coach notes word for word; build on them.
- Verdicts: must_start (an every-week starter), start, borderline (could go either way), bench (sit him this week), pickup (worth adding if he's a free agent), hold (keep, but don't start / don't panic), avoid (not worth a spot), monitor (wait for more news).`;
}

const TASK: Record<CoachKind, string> = {
  outlook:
    "Write his SEASON OUTLOOK for fantasy in at most 3 sentences (60 words): his role and what kind of scorer he is, the one or two biggest upsides or risks (e.g. breakout chance, injury, rest weeks, a crowded position, a tough finals run), and where he fits on a fantasy team. next_week: leave empty. The verdict is for the season (e.g. must_start for a top player, pickup / monitor for a sleeper, avoid for someone unlikely to play).",
  post_game:
    "His game has just finished (thisGame). In the body write a FANTASY EVALUATION of that game only: how many points and how (which stats), whether that is likely to repeat (stats' repeatability, his usual output), and anything notable (minutes, kicking, a card, coming off the bench). Then in next_week give a brief outlook for his next game (nextGame): the opponent and how they treat his position, and whether a similar score is likely. The verdict is for next week.",
  team_list:
    "The team and injury lists for this round are out (statusNow, statusChange, teammates). In the body say whether this changes anything for him (role, minutes, kicking, a teammate in or out). In next_week give a brief outlook for this week's game (nextGame): the opponent and how they treat his position, and whether he is a good bet. If he isn't playing, next_week: leave empty. The verdict is for this week.",
  status:
    "His status has just changed (statusChange). In the body explain what it means for fantasy managers now and over the next few weeks (expected return, who benefits, whether to hold, bench or drop him). In next_week give a brief outlook for his next game (nextGame) if he is playing; leave it empty if he isn't.",
  news:
    "There is new news about him (the newest item in latestNews, or a story in newsReports). In the body explain what it means for fantasy managers: role, points outlook, and what to do with him. In next_week give a brief outlook for his next game (nextGame) if he is playing; leave it empty if he isn't.",
};

/** The user message for one note: the task and the fact sheet. */
export function coachUserMessage(kind: CoachKind, facts: Record<string, unknown>): string {
  return `${TASK[kind]}\n\nFact sheet (JSON):\n${JSON.stringify(facts)}`;
}

/** Tidy a note from the model (trim, cap lengths, keep the verdict / trend valid). */
export function cleanNote(raw: unknown): CoachNoteOut | null {
  const r = (raw ?? {}) as Partial<Record<keyof CoachNoteOut, unknown>>;
  const s = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const headline = s(r.headline, 120);
  const body = s(r.body, 1200);
  if (!headline || !body) return null;
  const verdict = (COACH_VERDICTS as readonly string[]).includes(String(r.verdict)) ? (r.verdict as CoachVerdict) : "monitor";
  const trend = r.trend === "up" || r.trend === "down" ? r.trend : "steady";
  const factors = Array.isArray(r.factors) ? r.factors.map((f) => s(f, 60)).filter(Boolean).slice(0, 4) : [];
  return { headline, body, next_week: s(r.next_week, 600), verdict, trend, factors };
}
