// app/api/admin/players/route.ts — admin only. List every player in a season (including
// hidden ones), and add or edit a player.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { loadSeasonPlayers } from "@/lib/players/db";
import { currentSeasonYear, SEASONS } from "@/lib/season";

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
 * draftRank?, externalId?, status?, active } }. No id = a new player.
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

    const problems: string[] = [];
    if (!firstName || !lastName) problems.push("First and last name are needed");
    if (!TEAMS.includes(teamCode)) problems.push("Unknown team");
    if (!POS.includes(pos)) problems.push("Unknown position");
    if (pos2 && (!POS.includes(pos2) || pos2 === pos)) problems.push("Second position must be a different position");
    if (pos3 && (!pos2 || !POS.includes(pos3) || pos3 === pos || pos3 === pos2)) problems.push("Third position must be different from the other two (and needs a second position)");
    if (draftRank != null && (!Number.isInteger(draftRank) || draftRank < 1)) problems.push("Draft rank must be a whole number from 1");
    if (externalId != null && (!Number.isInteger(externalId) || externalId < 1)) problems.push("playfantasyrugby id must be a whole number");
    if (problems.length) return NextResponse.json({ ok: false, error: problems.join(". ") }, { status: 400 });

    // New player: an id like the others, e.g. "D.McKenzie" (made unique if needed).
    let id = String(p.id ?? "").trim();
    if (!id) {
      const base = `${firstName[0].toUpperCase()}.${lastName.replace(/\s+/g, "")}`;
      id = base;
      for (let n = 2; ; n++) {
        const { data } = await supabaseAdmin.from("players").select("id").eq("season", season).eq("id", id).maybeSingle();
        if (!data) break;
        id = `${base}${n}`;
      }
    }

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
        status: String(p.status ?? "").trim() || null,
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
