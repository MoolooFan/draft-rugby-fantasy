import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { refreshDraftOrder } from "@/lib/draft/engine";

const norm = (s: string) => s.trim().toLowerCase();

function initialsFromOwnerName(ownerName: any): string | null {
  const parts = String(ownerName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return null;

  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? parts[0]?.[0] ?? "";
  const out = (first + last).toUpperCase();

  return out || null;
}

export async function GET(req: Request) {
  // 0) must be logged in
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }
  const username = norm(usernameRaw);

  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();

  if (!leagueId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
  }

  // 1) must be a member of the league
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

  // 2) fetch league
  const { data: leagueRow, error: leagueErr } = await supabaseAdmin
    .from("leagues")
    .select("*")
    .eq("id", leagueId)
    .single();



  if (leagueErr || !leagueRow) {
    return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
  }

      // ✅ Auto-start draft when draft_at has passed
if (
  leagueRow.draft_status === "scheduled" &&
  leagueRow.draft_at &&
  new Date(leagueRow.draft_at).getTime() <= Date.now()
) {
  const { error: autoErr } = await supabaseAdmin
    .from("leagues")
    .update({ draft_status: "live", settings_locked_at: new Date().toISOString() })
    .eq("id", leagueId);

  if (!autoErr) {
    // reflect update in the response
    leagueRow.draft_status = "live";
  }
}

  // 3) fetch teams
  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("teams")
      .select("id, name, initials, user_id, owner_name, created_at")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: true });

  if (teamErr) {
    return NextResponse.json({ ok: false, error: teamErr.message }, { status: 500 });
  }
const teamsRaw = (teamRows ?? []).map((t: any) => {
  const dbInitials =
    typeof t.initials === "string" && t.initials.trim()
      ? t.initials.trim().toUpperCase()
      : null;

  const computed = dbInitials ?? initialsFromOwnerName(t.owner_name);

  return {
    id: t.id,
    name: t.name,
    initials: computed,
    userId: t.user_id,
    userInitials: computed,
  };
});

// 3.1) draft order: from the draft itself (snake order; shuffled as teams join, the commissioner
//      can rearrange it until the draft starts)
const computedOrder: string[] = await refreshDraftOrder(supabaseAdmin, leagueId);

// Build teamsOrdered using computedOrder
let teamsOrdered = teamsRaw;
if (computedOrder.length) {
  const byId = new Map(teamsRaw.map((t) => [t.id, t]));
  const inOrder = computedOrder.map((id) => byId.get(id)).filter(Boolean) as typeof teamsRaw;
  const leftovers = teamsRaw.filter((t) => !computedOrder.includes(t.id));
  teamsOrdered = [...inOrder, ...leftovers];
}

  // 4) map
  const league = {
    id: leagueRow.id,
    name: leagueRow.name,
    code: leagueRow.code,
    createdByUserId: leagueRow.created_by,

    draftDateTimeText: leagueRow.draft_date_time_text ?? "",
    draftAt: leagueRow.draft_at ? new Date(leagueRow.draft_at).getTime() : null,
    draftStatus: leagueRow.draft_status ?? "scheduled",

    playoffFormat: leagueRow.playoff_format ?? "final4",

    realRegularSeasonRounds: leagueRow.real_regular_season_rounds ?? 16,
    startRound: leagueRow.start_round ?? 1,
    totalWeeks: leagueRow.total_weeks ?? 16,
    currentWeek: leagueRow.current_week ?? 1,
draftOrder: computedOrder,
    teams: teamsOrdered,
  };

  return NextResponse.json({ ok: true, league });

  
}