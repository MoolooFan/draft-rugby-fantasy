import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  const username = norm(usernameRaw);

  const body = await req.json().catch(() => null);
  const leagueId = String(body?.leagueId ?? "").trim();
  const patch = body?.patch ?? null;

  if (!leagueId || !patch || typeof patch !== "object") {
    return NextResponse.json({ ok: false, error: "Missing leagueId or patch" }, { status: 400 });
  }

  // must be league member (or you can tighten to creator only)
  const { data: memberTeam, error: memberErr } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_username", username)
    .maybeSingle();

  if (memberErr) {
    return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
  }
  if (!memberTeam) {
    return NextResponse.json({ ok: false, error: "Not a league member" }, { status: 403 });
  }

  // Map API patch -> DB columns
  const dbPatch: any = {};
  if ("name" in patch) dbPatch.name = patch.name ?? null;
  if ("playoffFormat" in patch) dbPatch.playoff_format = patch.playoffFormat ?? null;
  if ("draftDateTimeText" in patch) dbPatch.draft_date_time_text = patch.draftDateTimeText ?? null;
  if ("draftAt" in patch) dbPatch.draft_at = patch.draftAt ?? null;

  if ("startRound" in patch) dbPatch.start_round = patch.startRound ?? null;
  if ("totalWeeks" in patch) dbPatch.total_weeks = patch.totalWeeks ?? null;

  // optionally allow currentWeek edits
  if ("currentWeek" in patch) dbPatch.current_week = patch.currentWeek ?? null;

  const { error: updErr } = await supabaseAdmin
    .from("leagues")
    .update(dbPatch)
    .eq("id", leagueId);

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}