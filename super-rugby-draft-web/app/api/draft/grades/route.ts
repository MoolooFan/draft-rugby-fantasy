// app/api/draft/grades/route.ts
// GET ?leagueId: the league's draft grades (members only), best first. Empty until the draft
// is finished. A draft that finished before grades existed gets them the first time anyone
// looks (and they're fixed from then on).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { getDraftState } from "@/lib/draft/engine";
import { writeDraftGrades } from "@/lib/draft/gradesServer";

export const dynamic = "force-dynamic";

type Row = { team_id: string; grade: string; rank: number; bullets: unknown; written_by: string; facts: { teamName?: string } | null };

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    await requireLeagueTeam(leagueId);
    const state = await getDraftState(supabaseAdmin, leagueId);
    if (state.phase !== "complete") return NextResponse.json({ ok: true, grades: [] });

    const load = async () => {
      const { data, error } = await supabaseAdmin
        .from("draft_grades")
        .select("team_id, grade, rank, bullets, written_by, facts")
        .eq("league_id", leagueId)
        .order("rank");
      if (error) throw error;
      return (data ?? []) as Row[];
    };
    let rows = await load();
    if (!rows.length) {
      await writeDraftGrades(supabaseAdmin, leagueId);
      rows = await load();
    }
    return NextResponse.json({
      ok: true,
      grades: rows.map((r) => ({
        teamId: r.team_id,
        teamName: r.facts?.teamName ?? "",
        grade: r.grade,
        rank: r.rank,
        bullets: Array.isArray(r.bullets) ? r.bullets.map(String) : [],
        byCoach: r.written_by === "coach",
      })),
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
