// POST /api/leagues/stakes/agree { leagueId, version } -> your team agrees to the league's
// rewards / punishments (only the version you were shown: if they changed since, it's refused
// and the pop-up shows the new wording).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const NO_STORE = { "Cache-Control": "private, no-store" };
const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const user = await getServerUsername();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const body = await req.json().catch(() => ({}));
  const leagueId = String(body?.leagueId ?? "").trim();
  const version = Number(body?.version);
  if (!leagueId || !Number.isInteger(version)) {
    return NextResponse.json({ ok: false, error: "Missing leagueId or version" }, { status: 400, headers: NO_STORE });
  }

  const { data: league, error } = await supabaseAdmin.from("leagues").select("stakes_version").eq("id", leagueId).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
  if (!league) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404, headers: NO_STORE });
  if (Number(league.stakes_version ?? 0) !== version) {
    return NextResponse.json({ ok: false, error: "They have just been changed. Please read them again.", changed: true }, { status: 409, headers: NO_STORE });
  }
  const { data: rows, error: uErr } = await supabaseAdmin
    .from("teams")
    .update({ stakes_agreed_version: version, stakes_agreed_at: new Date().toISOString() })
    .eq("league_id", leagueId)
    .eq("owner_username", norm(user))
    .select("id");
  if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500, headers: NO_STORE });
  if (!rows?.length) return NextResponse.json({ ok: false, error: "You aren't in this league" }, { status: 403, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
