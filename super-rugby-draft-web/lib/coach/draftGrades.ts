// lib/coach/draftGrades.ts (server only)
// The AI coach writes the bullet points for each team's draft grade (Ethan, 25 Nov 2026: "a bit
// more varied"). Run from the 5-minute job: leagues whose grades still have the plain bullet
// points get one request each (every team at once, so the bullets don't all sound the same).
// The grades themselves never change; if the coach is off, has no key or fails, the plain
// bullet points stay. Each league is only tried once.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCoachSettings } from "@/lib/coach/data";
import { coachHasKey } from "@/lib/coach/run";

const MAX_LEAGUES_PER_RUN = 3;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export const DRAFT_GRADE_SCHEMA = {
  type: "object",
  properties: {
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          team_id: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["team_id", "bullets"],
        additionalProperties: false,
      },
    },
  },
  required: ["teams"],
  additionalProperties: false,
} as const;

export const DRAFT_GRADE_SYSTEM = `You are the assistant coach for a Super Rugby draft fantasy league: a sharp, friendly rugby analyst. New Zealand English. The league's draft has just finished and every team has a draft grade (A+ to F, already decided: never change it or argue with it). Write the bullet points that explain each team's grade.

For each team write 2 or 3 bullet points, each one sentence of at most about 22 words. Between them cover:
- positional balance: strong or thin position groups, starting positions with no cover on the bench, piling too many players into one position;
- boom vs bust: steady players with a reliable floor versus boom-or-bust players (big spread, or little history) who can win or lose a round, and anyone injured or out right now;
- one standout pick: a steal (picked well after his Draft Rank), a reach (well before it), or the first-round pick.

Rules:
- Only use the facts given (grade, rank, squad with positions, picks, Draft Ranks, last season's points a game and games, starter / bench, profile, risks). Never invent injuries, news or stats.
- Name players. Use numbers where they help (pick 47, Draft Rank 18, 14.2 points a game).
- Vary the wording and the angle between teams: don't start every team's bullets the same way.
- Match the tone to the grade: upbeat for A grades, fair and constructive for C grades, honest but not mean for anything lower.
- No emojis, no headings, no grade letters at the start of bullets. Plain sentences.`;

type GradeRow = { team_id: string; grade: string; rank: number; facts: Record<string, unknown> };

/** Rewrite the bullet points of up to a few leagues' new draft grades. */
export async function coachDraftGrades(db: SupabaseClient, nowMs = Date.now()): Promise<{ leagues: number; skipped?: string }> {
  const settings = await loadCoachSettings(db);
  if (!settings.enabled) return { leagues: 0, skipped: "switched off" };
  if (!coachHasKey()) return { leagues: 0, skipped: "no API key" };

  const { data: due, error } = await db
    .from("draft_grades")
    .select("league_id")
    .eq("written_by", "rules")
    .is("coach_tried_at", null)
    .gte("created_at", new Date(nowMs - MAX_AGE_MS).toISOString())
    .limit(100);
  if (error) throw error;
  const leagues = [...new Set((due ?? []).map((r) => String(r.league_id)))].slice(0, MAX_LEAGUES_PER_RUN);
  let done = 0;
  for (const leagueId of leagues) {
    // claim it first, so two runs at once don't both pay for it
    const { data: claimed } = await db
      .from("draft_grades")
      .update({ coach_tried_at: new Date(nowMs).toISOString() })
      .eq("league_id", leagueId)
      .is("coach_tried_at", null)
      .select("team_id, grade, rank, facts");
    const rows = (claimed ?? []) as GradeRow[];
    if (!rows.length) continue;
    try {
      const bullets = await writeBullets(settings.model, rows);
      for (const r of rows) {
        const b = bullets.get(r.team_id);
        if (b?.length) await db.from("draft_grades").update({ bullets: b, written_by: "coach" }).eq("league_id", leagueId).eq("team_id", r.team_id);
      }
      done++;
    } catch (e) {
      console.error("[coach] draft grades", leagueId, e);
    }
  }
  return { leagues: done };
}

let client: Anthropic | null = null;

async function writeBullets(model: string, rows: GradeRow[]): Promise<Map<string, string[]>> {
  client ??= new Anthropic();
  const teams = [...rows]
    .sort((a, b) => a.rank - b.rank)
    .map((r) => ({ team_id: r.team_id, grade: r.grade, ...r.facts }));
  // the same kind of call as the coach's notes (lib/coach/run.ts writeNoteNow)
  const message = await client.beta.messages.create({
    model,
    max_tokens: 6000,
    system: [{ type: "text" as const, text: DRAFT_GRADE_SYSTEM, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: `The league's teams, best grade first (JSON):\n${JSON.stringify(teams)}` }],
    output_config: { effort: "medium" as const, format: { type: "json_schema" as const, schema: DRAFT_GRADE_SCHEMA as unknown as Record<string, unknown> } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") throw new Error(`stopped: ${message.stop_reason}`);
  const text = message.content.map((b) => (b.type === "text" ? (b as { text: string }).text : "")).join("");
  return cleanBullets(JSON.parse(text), new Set(rows.map((r) => r.team_id)));
}

/** The coach's reply, checked: known teams only, 2-3 short bullets each. */
export function cleanBullets(raw: unknown, teamIds: Set<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const teams = (raw as { teams?: unknown })?.teams;
  if (!Array.isArray(teams)) return out;
  for (const t of teams) {
    const id = String((t as { team_id?: unknown })?.team_id ?? "");
    const list = (t as { bullets?: unknown })?.bullets;
    if (!teamIds.has(id) || !Array.isArray(list)) continue;
    const bullets = list
      .map((b) => String(b ?? "").replace(/^[\s•\-*]+/, "").replace(/\s+/g, " ").trim())
      .filter((b) => b.length >= 8)
      .map((b) => (b.length > 220 ? `${b.slice(0, 217).trimEnd()}…` : b))
      .slice(0, 3);
    if (bullets.length >= 2) out.set(id, bullets);
  }
  return out;
}
