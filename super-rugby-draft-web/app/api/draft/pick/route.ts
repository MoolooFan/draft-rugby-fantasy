import { NextResponse } from "next/server";
import crypto from "crypto";
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
  const teamId = String(body?.teamId ?? "").trim();
  const playerId = String(body?.playerId ?? "").trim();
  const pickNumber = Number(body?.pickNumber);
  const round = Number(body?.round ?? 1);

  if (!leagueId || !teamId || !playerId || !Number.isFinite(pickNumber)) {
    return NextResponse.json(
      { ok: false, error: "Missing leagueId/teamId/playerId/pickNumber" },
      { status: 400 }
    );
  }

  // ✅ Verify user is member of league AND owns this team
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, owner_username")
    .eq("id", teamId)
    .eq("league_id", leagueId)
    .maybeSingle();

  if (teamErr) {
    return NextResponse.json({ ok: false, error: teamErr.message }, { status: 500 });
  }
  if (!team) {
    return NextResponse.json({ ok: false, error: "Team not found" }, { status: 404 });
  }
  if (norm(team.owner_username) !== username) {
    return NextResponse.json({ ok: false, error: "Not team owner" }, { status: 403 });
  }

  // ✅ Check draft state to enforce pick order
  const { data: state } = await supabaseAdmin
    .from("draft_state")
    .select("pick_index")
    .eq("league_id", leagueId)
    .maybeSingle();

  const expectedPick = Number(state?.pick_index ?? 1);
  if (pickNumber !== expectedPick) {
    return NextResponse.json(
      { ok: false, error: `Not your turn (expected pick ${expectedPick})` },
      { status: 409 }
    );
  }

  const pickId = `pick_${crypto.randomUUID()}`;

  const { error: pickErr } = await supabaseAdmin.from("draft_picks").insert({
    id: pickId,
    league_id: leagueId,
    team_id: teamId,
    player_id: playerId,
    pick_number: pickNumber,
    round,
  });

  if (pickErr) {
    // Unique constraints trigger here
    if (pickErr.message.includes("draft_picks_unique_league_pick")) {
      return NextResponse.json({ ok: false, error: "Pick already taken" }, { status: 409 });
    }
    if (pickErr.message.includes("draft_picks_unique_league_player")) {
      return NextResponse.json({ ok: false, error: "Player already drafted" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: pickErr.message }, { status: 500 });
  }

  const { error: stateErr } = await supabaseAdmin
    .from("draft_state")
    .upsert(
      {
        league_id: leagueId,
        phase: "live",
        pick_index: pickNumber + 1,
        is_draft_order_set: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "league_id" }
    );

  if (stateErr) {
    return NextResponse.json({ ok: false, error: stateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}