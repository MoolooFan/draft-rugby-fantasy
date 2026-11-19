import { NextResponse } from "next/server";
import { demo } from "@/lib/demo";
import { squadFormatOf } from "@/lib/league/squad";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { refreshDraftOrder } from "@/lib/draft/engine";
import { rulesForLeagueRow } from "@/lib/scoring/leagueRules";
import { championshipStars } from "@/lib/league/honours";
import { loadShield } from "@/lib/league/shieldServer";
import { cleanShieldName, cleanShieldRewards } from "@/lib/league/shield";
import { bonusRulesFromRow } from "@/lib/league/bonus";
import { currentSeasonYear, restartWindow } from "@/lib/season";

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
      .select("id, name, initials, user_id, owner_name, owner_username, created_at, picture_url")
    .eq("league_id", leagueId)
    .order("created_at", { ascending: true });

  if (teamErr) {
    return NextResponse.json({ ok: false, error: teamErr.message }, { status: 500 });
  }
// each owner's name as "Ethan S." (shown under the team name on the ladder)
const ownerNames = new Map<string, string>();
{
  const owners = [...new Set((teamRows ?? []).map((t: any) => String(t.owner_username ?? "")).filter(Boolean))];
  if (owners.length) {
    const { data: users } = await supabaseAdmin.from("users").select("username, username_norm, first_name, last_name").in("username_norm", owners);
    for (const u of users ?? []) {
      const first = String(u.first_name ?? "").trim();
      const last = String(u.last_name ?? "").trim();
      ownerNames.set(u.username_norm, first ? `${first}${last ? ` ${last[0].toUpperCase()}.` : ""}` : u.username);
    }
  }
}

// championship stars (E8): titles each team's owner has won in this league's history
let stars: Record<string, number> = {};
try {
  stars = await championshipStars(supabaseAdmin, leagueId, (teamRows ?? []) as any);
  // demo site only: a sample star to show where stars appear (lib/demo.ts)
  const d = demo();
  if (d && leagueId === d.leagueId && (teamRows ?? []).some((t: any) => t.id === d.sampleStarTeamId)) {
    stars[d.sampleStarTeamId] = Math.max(1, stars[d.sampleStarTeamId] ?? 0);
  }
} catch (e) {
  console.error("[leagues/get] stars:", e);
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
    pictureUrl: t.picture_url ?? null,
    stars: stars[t.id] ?? 0,
    ownerName: ownerNames.get(String(t.owner_username ?? "")) ?? null,
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
    // scoring: the system and the actual point values this league uses
    scoringSystem: leagueRow.scoring_system ?? "standard",
    scoringRules: await rulesForLeagueRow(supabaseAdmin, leagueRow),
    scoringCustom: leagueRow.scoring_custom ?? null,
    scoringLocked: !!leagueRow.scoring_rules_locked,
    bonusPoints: leagueRow.bonus_points !== false,
    bonusRules: bonusRulesFromRow(leagueRow),
    season: leagueRow.season,
    // The Shield: who holds it, their next shield game, and this season's shield games
    shield: await shieldSummary(),
    shieldEnabled: leagueRow.shield_enabled !== false,
    shieldName: cleanShieldName(leagueRow.shield_name),
    shieldRewards: cleanShieldRewards(leagueRow.shield_rewards),
    // the squad: starting slots, bench, IR (lib/league/squad.ts)
    squadFormat: squadFormatOf(leagueRow.squad_format),
    // E8: a league from an earlier season can be restarted for this season by its commissioner,
    // in the month before the season starts (restartOpensAt: when that month begins)
    ...(await restartInfo(leagueRow)),

    realRegularSeasonRounds: leagueRow.real_regular_season_rounds ?? 16,
    startRound: leagueRow.start_round ?? 1,
    totalWeeks: leagueRow.total_weeks ?? 16,
    currentWeek: leagueRow.current_week ?? 1,
draftOrder: computedOrder,
    teams: teamsOrdered,
  };

  return NextResponse.json({ ok: true, league });

  async function shieldSummary() {
    try {
      const s = await loadShield(supabaseAdmin, leagueId);
      return {
        enabled: s.enabled,
        name: s.name,
        holderTeamId: s.holderTeamId,
        defences: s.holder?.defences ?? 0,
        next: s.next,
        games: s.events.filter((e) => e.kind !== "awarded").map((e) => ({ week: e.week, kind: e.kind, holderTeamId: e.holderTeamId, otherTeamId: e.otherTeamId })),
      };
    } catch {
      return { enabled: leagueRow.shield_enabled !== false, name: "The Shield", holderTeamId: null, defences: 0, next: null, games: [] };
    }
  }

  async function restartInfo(row: { id: string; season: number; lineage_id?: string | null }) {
    const season = currentSeasonYear();
    const win = restartWindow(season);
    const now = Date.now();
    if (Number(row.season) >= season || !win || now >= win.closesMs || (await hasSuccessor(row))) {
      return { canRestart: false, restartOpensAt: null };
    }
    return { canRestart: now >= win.opensMs, restartOpensAt: win.opensMs };
  }

  async function hasSuccessor(row: { id: string; lineage_id?: string | null }) {
    const lineage = row.lineage_id ?? row.id;
    const { data } = await supabaseAdmin
      .from("leagues")
      .select("id")
      .or(`lineage_id.eq.${lineage},id.eq.${lineage}`)
      .eq("season", currentSeasonYear())
      .limit(1);
    return !!data?.length;
  }

  
}