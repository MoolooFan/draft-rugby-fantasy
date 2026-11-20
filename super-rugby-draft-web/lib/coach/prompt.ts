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
    body: { type: "string", description: "The note itself, 2-5 sentences." },
    next_week: { type: "string", description: "Outlook for his next game (opponent, whether this can be repeated, anything else); empty string if not asked for." },
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
- Team quality: strong attacking teams create more high-scoring games and tries; weak teams spend more time defending (more tackles, fewer tries).
- The opponent and the schedule: the next opponent's attack and defence ranks, the rest of the season, and the fantasy finals weeks (the last two weeks).
- Risks: injury history, international rest policies (e.g. All Blacks / Wallabies rest weeks), suspensions, a crowded position.
- The commissioner's notes are trusted news from the league's commissioner: use them.
- Articles the commissioner shared (articlesSharedByCommissioner) are news reports: use what they say about him (selection, role, injuries, form, coach comments) and you can name the source (e.g. "the Herald reports..."). Don't copy long passages; if an article is about his team rather than him, only use it where it affects him.

Rules:
- Only use facts in the fact sheet. Never invent injuries, quotes, selections, ages or news. If something important is unknown, say so briefly or leave it out.
- Be specific: name opponents, give numbers (points, tackles, minutes) and say plainly whether to start, bench, pick up or avoid him.
- Short and readable on a phone: the body is 2-5 sentences. No hype, no emojis, no headings.
- Don't repeat the previous coach notes word for word; build on them.
- Verdicts: must_start (an every-week starter), start, borderline (could go either way), bench (sit him this week), pickup (worth adding if he's a free agent), hold (keep, but don't start / don't panic), avoid (not worth a spot), monitor (wait for more news).`;
}

const TASK: Record<CoachKind, string> = {
  outlook:
    "Write his SEASON OUTLOOK for fantasy: what to expect over the season (role, scoring profile, consistency, upside / breakout chance, risks such as injury, rest weeks or a crowded position, the schedule including the fantasy finals weeks), and where he fits on a fantasy team. next_week: leave empty. The verdict is for the season (e.g. must_start for a top player, pickup / monitor for a sleeper, avoid for someone unlikely to play).",
  post_game:
    "His game has just finished (thisGame). Write a FANTASY EVALUATION of the game: how many points and how (which stats), whether that is likely to repeat (stats' repeatability, his usual output), and anything notable (minutes, kicking, a card, coming off the bench). Then in next_week give a brief outlook for his next game: the opponent, whether a similar score is likely, and anything else that could affect him. The verdict is for next week.",
  team_list:
    "The team and injury lists for this round are out (statusNow, statusChange, teammates). Say whether this changes anything for him this week (role, minutes, kicking, a teammate in or out) and whether he is a good bet this week or not. Keep it short. next_week: leave empty. The verdict is for this week.",
  status:
    "The commissioner has just changed his status (statusChange). Explain what it means for fantasy managers now and over the next few weeks (expected return, who benefits, whether to hold, bench or drop him). next_week: leave empty.",
  news:
    "The commissioner has added news about him (the newest commissioner note, or a new article in articlesSharedByCommissioner). Explain what it means for fantasy managers: role, points outlook, and what to do with him. next_week: leave empty unless it is about his next game.",
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
