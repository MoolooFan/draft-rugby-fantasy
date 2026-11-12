// app/api/admin/players/route.ts — admin only. List every player in a season (including
// hidden ones), and add or edit a player.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { loadSeasonPlayers } from "@/lib/players/db";
import { currentSeasonYear, getSeason, realRoundsForWeek, SEASONS } from "@/lib/season";
import { currentStatusWeek } from "@/lib/status/kind";
import { idStem, newPlayerId } from "@/lib/players/ids";

export const dynamic = "force-dynamic";

const POS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"];
const TEAMS = ["BLU", "BRU", "CHI", "CRU", "DRU", "FOR", "HIG", "HUR", "MOA", "RED", "WAR"];

function seasonFrom(v: unknown) {
  const n = Number(v);
  return SEASONS[n] ? n : currentSeasonYear();
}

export async function GET(req: Request) {
  try {
    await requireSiteAdmin();
    const season = seasonFrom(new URL(req.url).searchParams.get("season"));
    const players = await loadSeasonPlayers(supabaseAdmin, season, { includeInactive: true });
    return NextResponse.json({ ok: true, season, players });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/**
 * Body: { season, player: { id?, firstName, lastName, teamCode, posAbbrev, secondaryPosAbbrev?,
 * draftRank?, externalId?, expectedRole?, kickOrder?, status?, active } }. No id = a new player.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireSiteAdmin();
    const body = await req.json().catch(() => null);
    const season = seasonFrom(body?.season);
    const p = body?.player ?? {};
    const firstName = String(p.firstName ?? "").trim();
    const lastName = String(p.lastName ?? "").trim();
    const teamCode = String(p.teamCode ?? "").trim().toUpperCase();
    const pos = String(p.posAbbrev ?? "").trim().toUpperCase();
    const pos2 = String(p.secondaryPosAbbrev ?? "").trim().toUpperCase() || null;
    const pos3 = String(p.thirdPosAbbrev ?? "").trim().toUpperCase() || null;
    const draftRank = p.draftRank === "" || p.draftRank == null ? null : Number(p.draftRank);
    const externalId = p.externalId === "" || p.externalId == null ? null : Number(p.externalId);
    const expectedRole = ["starter", "bench", "squad"].includes(String(p.expectedRole)) ? String(p.expectedRole) : null;
    const kickOrder = [1, 2].includes(Number(p.kickOrder)) ? Number(p.kickOrder) : null;

    const problems: string[] = [];
    if (!firstName || !lastName) problems.push("First and last name are needed");
    if (!TEAMS.includes(teamCode)) problems.push("Unknown team");
    if (!POS.includes(pos)) problems.push("Unknown position");
    if (pos2 && (!POS.includes(pos2) || pos2 === pos)) problems.push("Second position must be a different position");
    if (pos3 && (!pos2 || !POS.includes(pos3) || pos3 === pos || pos3 === pos2)) problems.push("Third position must be different from the other two (and needs a second position)");
    if (draftRank != null && (!Number.isInteger(draftRank) || draftRank < 1)) problems.push("Draft rank must be a whole number from 1");
    if (externalId != null && (!Number.isInteger(externalId) || externalId < 1)) problems.push("playfantasyrugby id must be a whole number");
    if (problems.length) return NextResponse.json({ ok: false, error: problems.join(". ") }, { status: 400 });

    // New player (F1): the id he had in another season if we know him (same playfantasyrugby
    // id), otherwise a new clean id like "mckenda01" (lib/players/ids.ts).
    let id = String(p.id ?? "").trim();
    if (!id) {
      if (externalId != null) {
        const { data: known } = await supabaseAdmin.from("players").select("id").eq("external_id", externalId).limit(1);
        if (known?.length) id = known[0].id;
      }
      if (!id) {
        const { data: ids, error: idErr } = await supabaseAdmin.from("players").select("id").like("id", `${idStem(firstName, lastName)}%`);
        if (idErr) throw idErr;
        id = newPlayerId(firstName, lastName, new Set((ids ?? []).map((r) => r.id)));
      }
    }

    // A new card status counts from this week's round (for Questionable: lib/status/questionable.ts)
    const status = String(p.status ?? "").trim() || null;
    const { data: before } = await supabaseAdmin.from("players").select("status, status_round").eq("season", season).eq("id", id).maybeSingle();
    const statusRound = before && before.status === status
      ? before.status_round ?? null
      : status
        ? Math.min(...realRoundsForWeek(getSeason(season), currentStatusWeek(season)))
        : null;

    const { error } = await supabaseAdmin.from("players").upsert(
      {
        season,
        id,
        first_name: firstName,
        last_name: lastName,
        team_code: teamCode,
        pos,
        pos2,
        pos3,
        draft_rank: draftRank,
        external_id: externalId,
        expected_role: expectedRole,
        kick_order: kickOrder,
        status,
        status_round: statusRound,
        active: p.active !== false,
        updated_at: new Date().toISOString(),
        updated_by: admin,
      },
      { onConflict: "season,id" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
