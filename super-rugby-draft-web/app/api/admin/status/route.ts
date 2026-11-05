// app/api/admin/status/route.ts — admin only. The team-list / injury-list reader:
// GET  -> unresolved flags (names it couldn't match) and the latest imports.
// POST { action: "import", realRound, teamsUrl?, injuriesUrl? } -> read a round's articles now.
// POST { action: "resolve", flagId, apply } -> apply = give the suggested player that status.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { importRoundStatus } from "@/lib/status/import";
import { currentSeasonYear, getSeason, weekLabel } from "@/lib/season";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    await requireSiteAdmin();
    const seasonYear = currentSeasonYear();
    const season = getSeason(seasonYear);
    const [{ data: flags, error: fErr }, { data: imports, error: iErr }] = await Promise.all([
      supabaseAdmin.from("status_import_flags").select("*").eq("season", seasonYear).is("resolved_at", null).order("week", { ascending: false }).order("team_code"),
      supabaseAdmin.from("status_imports").select("*").eq("season", seasonYear).order("imported_at", { ascending: false }).limit(10),
    ]);
    if (fErr) throw fErr;
    if (iErr) throw iErr;
    const ids = [...new Set((flags ?? []).map((f) => f.suggestion_player_id).filter(Boolean))];
    const { data: sugg } = ids.length
      ? await supabaseAdmin.from("players").select("id, first_name, last_name, team_code").eq("season", seasonYear).in("id", ids)
      : { data: [] };
    const name = new Map((sugg ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name} (${p.team_code})`]));
    return NextResponse.json({
      ok: true,
      season: seasonYear,
      rounds: [...new Set(season.fixtures.map((f) => Number(f.week)))].sort((a, b) => a - b),
      flags: (flags ?? []).map((f) => ({
        id: f.id,
        week: f.week,
        weekLabel: weekLabel(season, f.week),
        source: f.source,
        team: f.team_code,
        text: f.raw_text,
        problem: f.problem,
        suggestionId: f.suggestion_player_id,
        suggestionName: f.suggestion_player_id ? name.get(f.suggestion_player_id) ?? f.suggestion_player_id : null,
      })),
      imports: imports ?? [],
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireSiteAdmin();
    const body = await req.json().catch(() => null);
    const seasonYear = currentSeasonYear();

    if (body?.action === "import") {
      const realRound = Number(body.realRound);
      if (!Number.isInteger(realRound) || realRound < 1) return NextResponse.json({ ok: false, error: "Pick a round" }, { status: 400 });
      const clean = (u: unknown) => {
        const s = String(u ?? "").trim();
        return /^https:\/\/(www\.)?super\.rugby\//.test(s) ? s : undefined;
      };
      const report = await importRoundStatus(supabaseAdmin, seasonYear, realRound, { teams: clean(body.teamsUrl), injuries: clean(body.injuriesUrl) });
      return NextResponse.json({ ok: true, report });
    }

    if (body?.action === "resolve") {
      const { data: flag, error } = await supabaseAdmin.from("status_import_flags").select("*").eq("id", String(body.flagId ?? "")).single();
      if (error) throw error;
      if (body.apply && flag.suggestion_player_id) {
        const status = String(flag.raw_text).split("→").pop()!.trim();
        const { error: sErr } = await supabaseAdmin.from("player_week_status").upsert(
          { season: flag.season, week: flag.week, player_id: flag.suggestion_player_id, status, source: "manual", updated_at: new Date().toISOString(), updated_by: admin },
          { onConflict: "season,week,player_id" }
        );
        if (sErr) throw sErr;
      }
      const { error: rErr } = await supabaseAdmin
        .from("status_import_flags")
        .update({ resolved_at: new Date().toISOString(), resolved_by: admin })
        .eq("id", flag.id);
      if (rErr) throw rErr;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
