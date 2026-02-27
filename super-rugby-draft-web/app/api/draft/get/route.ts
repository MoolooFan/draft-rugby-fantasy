import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function GET(req: Request) {
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

  // ✅ must be league member
  const { data: member, error: memberErr } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_username", username)
    .maybeSingle();

  if (memberErr) {
    return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ ok: false, error: "Not a league member" }, { status: 403 });
  }

  const { data: state, error: stateErr } = await supabaseAdmin
    .from("draft_state")
    .select("*")
    .eq("league_id", leagueId)
    .maybeSingle();

  if (stateErr) {
    return NextResponse.json({ ok: false, error: stateErr.message }, { status: 500 });
  }

  const { data: picks, error: picksErr } = await supabaseAdmin
    .from("draft_picks")
    .select("*")
    .eq("league_id", leagueId)
    .order("pick_number", { ascending: true });

  if (picksErr) {
    return NextResponse.json({ ok: false, error: picksErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, state: state ?? null, picks: picks ?? [] });
}