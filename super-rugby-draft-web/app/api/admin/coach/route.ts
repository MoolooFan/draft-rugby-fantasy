// app/api/admin/coach/route.ts — admin only. The AI coach (lib/coach):
// GET [?playerId] -> settings, whether an API key is set, recent batches, recent notes (or one
//   player's), your coach notes (context), and a player's details.
// POST { action, ... }:
//   settings { enabled?, model? }        switch on / off, pick the model
//   outlooks                             season outlooks for every player (a batch)
//   run                                  check now for notes that are due (normally every 5 min)
//   note_edit { id, headline, body, next_week } / note_hide { id, hidden }
//   context_add { scope, playerId?, teamCode?, text, writeNow? } / context_toggle { id, active }
//   profile { playerId, birthDate, international, restNotes, injuryNotes }
import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { loadCoachSettings } from "@/lib/coach/data";
import { coachHasKey, coachTick, submitOutlooks, writeNoteNow } from "@/lib/coach/run";
import { currentSeasonYear } from "@/lib/season";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"];
const TEAMS = ["BLU", "BRU", "CHI", "CRU", "DRU", "FOR", "HIG", "HUR", "MOA", "RED", "WAR"];
const fail = (error: string) => NextResponse.json({ ok: false, error }, { status: 400 });
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function GET(req: Request) {
  try {
    await requireSiteAdmin();
    const playerId = str(new URL(req.url).searchParams.get("playerId"), 80);
    let notesQ = supabaseAdmin
      .from("coach_notes")
      .select("id, player_id, kind, week, headline, body, next_week, verdict, hidden, edited, created_at")
      .order("created_at", { ascending: false })
      .limit(playerId ? 40 : 60);
    if (playerId) notesQ = notesQ.eq("player_id", playerId);
    const [settings, jobs, notes, context, profile] = await Promise.all([
      loadCoachSettings(supabaseAdmin),
      supabaseAdmin.from("coach_jobs").select("job_key, kind, status, requests, written, error, created_at, finished_at").order("created_at", { ascending: false }).limit(15),
      notesQ,
      supabaseAdmin.from("coach_context").select("id, scope, player_id, team_code, text, active, created_at").order("created_at", { ascending: false }).limit(60),
      playerId ? supabaseAdmin.from("player_profiles").select("birth_date, international, rest_notes, injury_notes").eq("player_id", playerId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    return NextResponse.json({
      ok: true,
      settings,
      hasKey: coachHasKey(),
      models: MODELS,
      jobs: jobs.data ?? [],
      notes: notes.data ?? [],
      context: context.data ?? [],
      profile: profile.data ?? null,
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSiteAdmin();
    const b = await req.json().catch(() => ({}));
    const season = currentSeasonYear();
    const now = new Date().toISOString();

    if (b?.action === "settings") {
      const patch: Record<string, unknown> = { updated_at: now };
      if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
      if (b.model != null) {
        if (!MODELS.includes(String(b.model))) return fail("Unknown model");
        patch.model = String(b.model);
      }
      const { error } = await supabaseAdmin.from("coach_settings").upsert({ id: 1, ...patch }, { onConflict: "id" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (b?.action === "outlooks") {
      const n = await submitOutlooks(supabaseAdmin, season);
      return NextResponse.json({ ok: true, message: n ? `${n} season outlooks sent; they'll appear within about an hour.` : "Nothing to send (outlooks already written)." });
    }

    if (b?.action === "run") {
      const r = await coachTick(supabaseAdmin, season);
      return NextResponse.json({ ok: true, report: r });
    }

    if (b?.action === "note_edit") {
      const headline = str(b.headline, 120);
      const body = str(b.body, 1200);
      if (!b?.id || !headline || !body) return fail("A headline and the note are needed");
      const { error } = await supabaseAdmin
        .from("coach_notes")
        .update({ headline, body, next_week: str(b.next_week, 600), edited: true, updated_at: now })
        .eq("id", String(b.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (b?.action === "note_hide") {
      const { error } = await supabaseAdmin.from("coach_notes").update({ hidden: b?.hidden !== false, updated_at: now }).eq("id", String(b?.id ?? ""));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (b?.action === "context_add") {
      const scope = String(b?.scope);
      const text = str(b?.text, 600);
      if (!["player", "team", "general"].includes(scope) || !text) return fail("Pick who it's about and write the note");
      const playerId = scope === "player" ? str(b.playerId, 80) : null;
      const teamCode = scope === "team" ? str(b.teamCode, 4).toUpperCase() : null;
      if (scope === "player" && !playerId) return fail("Pick the player");
      if (scope === "team" && !TEAMS.includes(teamCode ?? "")) return fail("Pick the team");
      const { data, error } = await supabaseAdmin.from("coach_context").insert({ scope, player_id: playerId, team_code: teamCode, text }).select("id").single();
      if (error) throw error;
      // "write a coach update now": in the background, so this page doesn't wait for it
      if (b?.writeNow && playerId) {
        after(async () => {
          try {
            await writeNoteNow(supabaseAdmin, { season, playerId, kind: "news", sourceKey: `news:${data.id}` });
          } catch (e) {
            console.error("[coach] news note failed:", e);
          }
        });
      }
      return NextResponse.json({ ok: true, message: b?.writeNow && playerId ? "Saved; the coach's update will appear in a minute." : "Saved." });
    }

    if (b?.action === "context_toggle") {
      const { error } = await supabaseAdmin.from("coach_context").update({ active: b?.active !== false }).eq("id", String(b?.id ?? ""));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (b?.action === "profile") {
      const playerId = str(b?.playerId, 80);
      if (!playerId) return fail("Missing player");
      const birth = str(b?.birthDate, 10);
      if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return fail("Birth date must look like 1998-04-21");
      const { error } = await supabaseAdmin.from("player_profiles").upsert(
        {
          player_id: playerId,
          birth_date: birth || null,
          international: str(b?.international, 60) || null,
          rest_notes: str(b?.restNotes, 300) || null,
          injury_notes: str(b?.injuryNotes, 300) || null,
          updated_at: now,
        },
        { onConflict: "player_id" }
      );
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return fail("Unknown action");
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
