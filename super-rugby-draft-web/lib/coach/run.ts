// lib/coach/run.ts (server only)
// Writes the AI coach's notes with Claude (Anthropic API; model from coach_settings, Sonnet 5.5
// to start). Ethan, 17 Nov 2026:
//   - after each game's stats are final (13.5 h after kickoff): a note for everyone who played
//   - when the team / injury lists are read: a note for everyone with a status that week
//   - season outlooks: from the admin page, for every player in the pool
//     (these three go as batches: written within about an hour, at half price)
//   - when Ethan changes a status by hand, or adds news and asks for an update: one note now
// Nothing runs unless the coach is switched on (admin page) and ANTHROPIC_API_KEY is set.
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFacts, notePoints, type CoachKind } from "@/lib/coach/facts";
import { cleanNote, coachSystemPrompt, coachUserMessage, COACH_NOTE_SCHEMA, type CoachNoteOut } from "@/lib/coach/prompt";
import { coachInput, loadCoachCtx, loadCoachSettings, loadPreviousNotes, type CoachCtx } from "@/lib/coach/data";
import { FINALISE_AFTER_LAST_KICKOFF_MS, fantasyWeekForRealRound, getSeason, kickoffMs, SEASONS, totalFantasyWeeks } from "@/lib/season";
import { currentStatusWeek, statusKind } from "@/lib/status/kind";
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { teamCodeFromName } from "@/lib/status/articles";
import { statCountsFromRaw } from "@/lib/scoring";
import { weekProjections } from "@/lib/projections/server";
import { savedMatchScores } from "@/lib/results/matchScores";
import type { MatchScore } from "@/lib/fixtures/scores";

const MAX_TOKENS = 4000;
const EFFORT = "medium" as const;

export function coachHasKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

/** The request for one note (system prompt cached; the fact sheet and task in the user turn). */
function noteParams(model: string, ctx: CoachCtx, kind: CoachKind, facts: Record<string, unknown>) {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text" as const, text: coachSystemPrompt(ctx.rules), cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: coachUserMessage(kind, facts) }],
    output_config: { effort: EFFORT, format: { type: "json_schema" as const, schema: COACH_NOTE_SCHEMA as unknown as Record<string, unknown> } },
  };
}

/** The note from a reply (null if it was refused, cut off or unreadable). */
function noteFrom(message: { stop_reason?: string | null; content: Array<{ type: string; text?: string }> }): CoachNoteOut | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  try {
    return cleanNote(JSON.parse(text));
  } catch {
    return null;
  }
}

type NoteRow = { season: number; player_id: string; kind: CoachKind; week: number | null; source_key: string; model: string; projected?: number | null; scored?: number | null };

async function saveNote(db: SupabaseClient, row: NoteRow, note: CoachNoteOut): Promise<boolean> {
  const { error } = await db.from("coach_notes").upsert(
    { ...row, headline: note.headline, body: note.body, next_week: note.next_week, verdict: note.verdict, trend: note.trend, factors: note.factors },
    { onConflict: "source_key", ignoreDuplicates: true }
  );
  if (error) throw error;
  return true;
}

// ---------------------------------------------------------------------------
// One note now (status change, news)

export async function writeNoteNow(
  db: SupabaseClient,
  args: { season: number; playerId: string; kind: "status" | "news"; statusChange?: { from: string | null; to: string | null }; sourceKey: string }
): Promise<{ ok: boolean; reason?: string }> {
  const settings = await loadCoachSettings(db);
  if (!settings.enabled) return { ok: false, reason: "The coach is switched off" };
  if (!coachHasKey()) return { ok: false, reason: "No Anthropic API key set" };
  const week = currentStatusWeek(args.season);
  const ctx = await loadCoachCtx(db, args.season, week);
  await loadPreviousNotes(db, ctx, [args.playerId]);
  const input = coachInput(ctx, args.playerId, args.kind, { statusChange: args.statusChange });
  if (!input) return { ok: false, reason: "Player not found" };
  const params = noteParams(settings.model, ctx, args.kind, buildFacts(input));
  const nums = notePoints(input);
  // a declined request is retried on the fallback model the API picks (Claude API only)
  const message = await anthropic().beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
  const note = noteFrom(message as never);
  if (!note) return { ok: false, reason: "The coach couldn't write this one" };
  await saveNote(db, { season: args.season, player_id: args.playerId, kind: args.kind, week, source_key: args.sourceKey, model: settings.model, ...nums }, note);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Batches (after games, team lists, season outlooks)

type BatchItem = { playerId: string; sourceKey: string; week: number | null; extra?: Parameters<typeof coachInput>[3] };

/** Send a batch of notes; records the job so it's collected later (and never sent twice). */
export async function submitBatch(db: SupabaseClient, ctx: CoachCtx, model: string, jobKey: string, kind: CoachKind, items: BatchItem[]): Promise<number> {
  const { data: existing } = await db.from("coach_jobs").select("id").eq("job_key", jobKey).maybeSingle();
  if (existing) return 0;
  // skip notes already written (e.g. a list read again)
  const keys = items.map((i) => i.sourceKey);
  const done = new Set<string>();
  for (let i = 0; i < keys.length; i += 300) {
    const { data } = await db.from("coach_notes").select("source_key").in("source_key", keys.slice(i, i + 300));
    for (const r of data ?? []) done.add(r.source_key);
  }
  const todo = items.filter((i) => !done.has(i.sourceKey));
  await loadPreviousNotes(db, ctx, todo.map((i) => i.playerId));
  const requests: Array<{ custom_id: string; params: ReturnType<typeof noteParams> }> = [];
  const map: Record<string, { player_id: string; source_key: string; week: number | null; kind: CoachKind; projected: number | null; scored: number | null }> = {};
  todo.forEach((it, n) => {
    const input = coachInput(ctx, it.playerId, kind, it.extra ?? {});
    if (!input) return;
    const id = `n${n}`;
    requests.push({ custom_id: id, params: noteParams(model, ctx, kind, buildFacts(input)) });
    map[id] = { player_id: it.playerId, source_key: it.sourceKey, week: it.week, kind, ...notePoints(input) };
  });
  if (!requests.length) {
    await db.from("coach_jobs").insert({ job_key: jobKey, kind, season: ctx.season, week: ctx.week, status: "skipped", requests: 0, finished_at: new Date().toISOString() });
    return 0;
  }
  const batch = await anthropic().messages.batches.create({ requests });
  const { error } = await db.from("coach_jobs").insert({ job_key: jobKey, kind, season: ctx.season, week: ctx.week, batch_id: batch.id, status: "submitted", requests: requests.length, items: map });
  if (error) throw error;
  return requests.length;
}

/** Collect finished batches and save their notes. */
export async function collectBatches(db: SupabaseClient): Promise<number> {
  const { data: jobs } = await db.from("coach_jobs").select("id, season, batch_id, items, created_at").eq("status", "submitted").not("batch_id", "is", null);
  let written = 0;
  const settings = await loadCoachSettings(db);
  for (const job of jobs ?? []) {
    try {
      const b = await anthropic().messages.batches.retrieve(job.batch_id);
      if (b.processing_status !== "ended") continue;
      const items = (job.items ?? {}) as Record<string, { player_id: string; source_key: string; week: number | null; kind: CoachKind; projected?: number | null; scored?: number | null }>;
      let n = 0;
      for await (const r of await anthropic().messages.batches.results(job.batch_id)) {
        const it = items[r.custom_id];
        if (!it || r.result.type !== "succeeded") continue;
        const note = noteFrom(r.result.message as never);
        if (!note) continue;
        await saveNote(db, { season: job.season, player_id: it.player_id, kind: it.kind, week: it.week, source_key: it.source_key, model: settings.model, projected: it.projected ?? null, scored: it.scored ?? null }, note);
        n++;
      }
      written += n;
      await db.from("coach_jobs").update({ status: "done", written: n, finished_at: new Date().toISOString() }).eq("id", job.id);
    } catch (e) {
      await db.from("coach_jobs").update({ status: "failed", error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300), finished_at: new Date().toISOString() }).eq("id", job.id);
    }
  }
  return written;
}

// ---------------------------------------------------------------------------
// What's due (the 5-minute job)

const fixtureTeam = (name: string) => normalizeTeamCode(teamCodeFromName(name) ?? name);
const RECENT_MS = 3 * 24 * 60 * 60 * 1000;

/** Season outlooks for every player in the pool (admin button). */
export async function submitOutlooks(db: SupabaseClient, season: number): Promise<number> {
  const settings = await loadCoachSettings(db);
  if (!coachHasKey()) throw new Error("No Anthropic API key set");
  const ctx = await loadCoachCtx(db, season, 1);
  // a fresh set each time the button is pressed (at most once an hour); the player card shows the newest
  const stamp = new Date().toISOString().slice(0, 13);
  const items: BatchItem[] = [...ctx.players.values()].filter((p) => p.active).map((p) => ({ playerId: p.id, sourceKey: `outlook:${season}:${p.id}:${stamp}`, week: null }));
  return submitBatch(db, ctx, settings.model, `outlook:${season}:${stamp}`, "outlook", items);
}

export type CoachTickReport = { collected: number; submitted: Array<{ job: string; notes: number }>; skipped?: string };

/** Run from the 5-minute job: collect finished batches, then send notes that are due. */
export async function coachTick(db: SupabaseClient, season: number, nowMs = Date.now()): Promise<CoachTickReport> {
  const report: CoachTickReport = { collected: 0, submitted: [] };
  const settings = await loadCoachSettings(db);
  if (!settings.enabled) return { ...report, skipped: "switched off" };
  if (!coachHasKey()) return { ...report, skipped: "no API key" };
  report.collected = await collectBatches(db);
  if (!SEASONS[season]) return report;
  const s = getSeason(season);
  let ctxCache: { week: number; ctx: CoachCtx } | null = null;
  const ctxFor = async (week: number) => {
    if (!ctxCache || ctxCache.week !== week) ctxCache = { week, ctx: await loadCoachCtx(db, season, week) };
    return ctxCache.ctx;
  };

  let officialScores: MatchScore[] | null = null;
  // 1. after each game: stats final 13.5 h after kickoff (games in the last 3 days only)
  for (const f of s.fixtures) {
    const ko = kickoffMs(f);
    if (!Number.isFinite(ko) || ko + FINALISE_AFTER_LAST_KICKOFF_MS > nowMs || ko < nowMs - RECENT_MS) continue;
    const jobKey = `post_game:${season}:${f.id}`;
    const { data: existing } = await db.from("coach_jobs").select("id").eq("job_key", jobKey).maybeSingle();
    if (existing) continue;
    const gameWeek = fantasyWeekForRealRound(s, f.week);
    if (!gameWeek) continue;
    const nextWeek = Math.min(gameWeek + 1, totalFantasyWeeks(s));
    const ctx = await ctxFor(nextWeek);
    // his projection for the game's week, from the games before it (shown with the note)
    const gameProj = await weekProjections(db, season, gameWeek, ctx.rules).catch(() => null);
    const h = fixtureTeam(f.homeTeam), a = fixtureTeam(f.awayTeam);
    const { data: rows } = await db.from("player_round_stats").select("internal_player_id, stats:raw_json->stats").eq("season", season).eq("round", f.week);
    const playedIds: string[] = [];
    for (const r of rows ?? []) {
      const p = ctx.players.get(String(r.internal_player_id));
      const t = p ? normalizeTeamCode(p.teamCode) : null;
      if (!p || (t !== h && t !== a)) continue;
      if (Number(statCountsFromRaw(r.stats).minutesPlayed) > 0) playedIds.push(p.id);
    }
    if (!playedIds.length) continue; // stats not in yet: try again next time
    // the official final score (from the official fantasy game, lib/results/matchScores.ts)
    officialScores ??= await savedMatchScores(db, season).catch(() => []);
    const real = officialScores.find((m) => m.final !== false && m.realRound === Number(f.week) && m.homeTeam === h && m.awayTeam === a);
    const score: Record<string, number | null> = { [h]: real ? real.homeScore : null, [a]: real ? real.awayScore : null };
    const items: BatchItem[] = playedIds.map((id) => {
      const t = normalizeTeamCode(ctx.players.get(id)!.teamCode);
      return { playerId: id, sourceKey: `post_game:${season}:${f.id}:${id}`, week: gameWeek, extra: { thisGameRound: f.week, teamScore: score[t], oppScore: score[t === h ? a : h], projected: gameProj?.players[id]?.pts ?? null } };
    });
    report.submitted.push({ job: jobKey, notes: await submitBatch(db, ctx, settings.model, jobKey, "post_game", items) });
  }

  // 2. team / injury lists read in the last 3 days: everyone with a status that week
  const { data: imports } = await db
    .from("status_imports")
    .select("id, real_round, kind, imported_at")
    .eq("season", season)
    .gte("imported_at", new Date(nowMs - RECENT_MS).toISOString());
  for (const imp of imports ?? []) {
    const jobKey = `team_list:${imp.id}`;
    const { data: existing } = await db.from("coach_jobs").select("id").eq("job_key", jobKey).maybeSingle();
    if (existing) continue;
    const week = fantasyWeekForRealRound(s, imp.real_round);
    if (!week) continue;
    const ctx = await ctxFor(week);
    const items: BatchItem[] = [];
    for (const p of ctx.players.values()) {
      if (!p.active) continue;
      const k = statusKind(p.weeklyStatus?.[`W${week}`] || null);
      const wanted = imp.kind === "team-list" ? k === "starting" || k === "bench" : k === "injured" || k === "out" || k === "questionable" || k === "suspended";
      if (wanted) items.push({ playerId: p.id, sourceKey: `team_list:${season}:${week}:${p.id}`, week });
    }
    report.submitted.push({ job: jobKey, notes: await submitBatch(db, ctx, settings.model, jobKey, "team_list", items) });
  }
  return report;
}
