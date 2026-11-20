// app/api/leagues/team-profile/route.ts
// A team's profile pop-up (Ethan, 20 Nov 2026; components/TeamProfileModal.tsx), league members
// only: the current squad (and IR), standings place and movement since the round before, power
// ranking and movement, the Shield (holding it / next chance to win it) and the team's results.
// GET ?leagueId=...&teamId=...
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { activeIdsOf, irIdsOf } from "@/lib/league/ir";
import { buildLadder, type LadderMatchup } from "@/lib/league/ladder";
import { loadPower } from "@/lib/league/powerServer";
import { loadShield } from "@/lib/league/shieldServer";
import type { TeamProfile, TeamProfileResult } from "@/lib/league/teamProfile";

export const dynamic = "force-dynamic";

type Matchup = LadderMatchup & { label: string | null; winner_team_id: string | null; weeks: number[] };

const lastWeek = (m: { weeks?: number[] | null }) => Math.max(0, ...((m.weeks ?? []).map(Number)));

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const leagueId = String(sp.get("leagueId") ?? "").trim();
    const teamId = String(sp.get("teamId") ?? "").trim();
    if (!leagueId || !teamId) return NextResponse.json({ ok: false, error: "Missing leagueId or teamId" }, { status: 400 });
    const { teamId: myTeamId } = await requireLeagueTeam(leagueId);

    const [league, teams, roster, matchups] = await Promise.all([
      supabaseAdmin.from("leagues").select("season, draft_status").eq("id", leagueId).maybeSingle(),
      supabaseAdmin.from("teams").select("id").eq("league_id", leagueId),
      supabaseAdmin.from("rosters").select("data").eq("league_id", leagueId).eq("team_id", teamId).maybeSingle(),
      supabaseAdmin
        .from("league_matchups")
        .select("kind, label, weeks, status, home_team_id, away_team_id, home_score, away_score, home_bonus, away_bonus, home_shield_pts, away_shield_pts, shield_holder_after, winner_team_id")
        .eq("league_id", leagueId),
    ]);
    for (const r of [league, teams, roster, matchups]) if (r.error) throw r.error;
    const teamIds = (teams.data ?? []).map((t) => String(t.id));
    if (!teamIds.includes(teamId)) return NextResponse.json({ ok: false, error: "That team isn't in this league" }, { status: 404 });
    const games = (matchups.data ?? []) as Matchup[];

    // Standings: now, and after the round before (for the movement)
    const regularFinal = games.filter((m) => m.kind === "regular" && m.status === "final");
    const asOfWeek = Math.max(0, ...regularFinal.map(lastWeek));
    let standings: TeamProfile["standings"] = null;
    if (asOfWeek > 0) {
      const now = buildLadder(teamIds, regularFinal);
      const earlier = regularFinal.filter((m) => lastWeek(m) < asOfWeek);
      const before = earlier.length ? buildLadder(teamIds, earlier) : null;
      const i = now.findIndex((r) => r.teamId === teamId);
      const j = before ? before.findIndex((r) => r.teamId === teamId) : -1;
      const row = now[i];
      standings = {
        rank: i + 1,
        of: now.length,
        moved: j >= 0 ? j - i : null,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        ladderPoints: row.ladderPoints,
        pointsFor: row.pointsFor,
        asOfWeek,
      };
    }

    // Power ranking (live: today's squads) and the Shield
    const [power, shield] = await Promise.all([
      loadPower(supabaseAdmin, leagueId).catch((e) => (console.error("[team-profile] power:", e), null)),
      loadShield(supabaseAdmin, leagueId).catch((e) => (console.error("[team-profile] shield:", e), null)),
    ]);
    const prow = power?.rows.find((r) => r.teamId === teamId) ?? null;

    let shieldOut: TeamProfile["shield"] = null;
    if (shield?.enabled) {
      const holder = shield.holderTeamId;
      const holding = !!holder && holder === teamId;
      let next: NonNullable<TeamProfile["shield"]>["next"] = null;
      if (holding && shield.next) next = { week: shield.next.week, opponentId: shield.next.awayTeamId, kind: "defence" };
      else if (holder && !holding) {
        // it's only on the line in the holder's home games: his next game away at the holder
        const g = games
          .filter((m) => m.kind === "regular" && m.status !== "final" && m.home_team_id === holder && m.away_team_id === teamId)
          .sort((a, b) => lastWeek(a) - lastWeek(b))[0];
        if (g) next = { week: lastWeek(g), opponentId: holder, kind: "challenge" };
      }
      shieldOut = { name: shield.name, holderTeamId: holder, holding, defences: holding ? shield.holder?.defences ?? 0 : 0, next };
    }

    // Results, newest first (byes included)
    const results: TeamProfileResult[] = games
      .filter((m) => m.status === "final" && (m.home_team_id === teamId || m.away_team_id === teamId))
      .map((m): TeamProfileResult => {
        const home = m.home_team_id === teamId;
        const f = home ? m.home_score : m.away_score;
        const a = home ? m.away_score : m.home_score;
        const bye = m.kind === "regular" && !m.away_team_id;
        const result: TeamProfileResult["result"] = bye
          ? "BYE"
          : m.winner_team_id
            ? m.winner_team_id === teamId ? "W" : "L"
            : f != null && a != null ? (f > a ? "W" : f < a ? "L" : "D") : "D";
        return {
          week: lastWeek(m),
          label: m.kind === "regular" ? null : m.label,
          kind: m.kind,
          opponentId: home ? m.away_team_id : m.home_team_id,
          home,
          for: f == null ? null : Number(f),
          against: a == null ? null : Number(a),
          result,
        };
      })
      .sort((a, b) => b.week - a.week);

    const rosterData = roster.data?.data ?? null;
    const profile: TeamProfile = {
      teamId,
      myTeamId,
      season: Number(league.data?.season) || new Date().getFullYear(),
      draftDone: league.data?.draft_status === "complete",
      roster: { active: activeIdsOf(rosterData), ir: irIdsOf(rosterData) },
      standings,
      power: prow && power
        ? { rank: prow.rank, of: power.rows.length, moved: prow.movement, titlePct: prow.titlePct, playoffPct: prow.playoffPct, finalsSize: power.finalsSize, simulated: power.simulated }
        : null,
      shield: shieldOut,
      results,
    };
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
