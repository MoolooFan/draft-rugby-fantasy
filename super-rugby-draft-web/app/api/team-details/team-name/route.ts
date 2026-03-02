import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

export async function POST(req: Request) {
  const username = await getServerUsername();
  if (!username) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);

  const leagueId = String(body?.leagueId ?? "").trim();
  const teamId = String(body?.teamId ?? "").trim();
  const teamName = String(body?.teamName ?? "").trim();

  if (!leagueId || !teamId) {
    return NextResponse.json({ ok: false, error: "Missing leagueId/teamId" }, { status: 400 });
  }
  if (!teamName || teamName.length < 2) {
    return NextResponse.json({ ok: false, error: "Team name must be at least 2 characters." }, { status: 400 });
  }

  // ✅ optional safety check: ensure this team belongs to this user
  // If your schema uses userId on the team row, enforce it.
  // Adjust column names to match yours.
  const { data: teamRow, error: teamErr } = await supabaseAdmin
    .from("league_teams")
    .select("id, league_id, userId")
    .eq("id", teamId)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (teamErr) return NextResponse.json({ ok: false, error: "Failed to verify team" }, { status: 500 });
  if (!teamRow) return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });

  // If you store the username as userId on league teams:
  if (String(teamRow.userId ?? "").trim().toLowerCase() !== String(username).trim().toLowerCase()) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error: updErr } = await supabaseAdmin
    .from("league_teams")
    .update({ name: teamName })
    .eq("id", teamId)
    .eq("league_id", leagueId);

  if (updErr) return NextResponse.json({ ok: false, error: "Failed to update team name" }, { status: 500 });

  return NextResponse.json({ ok: true });
}