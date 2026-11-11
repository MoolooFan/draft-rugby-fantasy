// GET /api/leagues/preview?code=ABCDE
// Step 1 of joining a league: which league the code is for, and - if you played in this league
// before (any earlier season) - your old team name and picture to pre-fill step 2 (E8).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { previousTeam } from "@/lib/league/honours";

const norm = (s: string) => s.trim().toLowerCase();

export async function GET(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const code = String(new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false, error: "Enter a league code." }, { status: 400 });

  const { data: league, error } = await supabaseAdmin.from("leagues").select("id, name, season, lineage_id").eq("code", code).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!league) return NextResponse.json({ ok: false, error: "No league has that code. Check it and try again." }, { status: 404 });

  const { data: mine } = await supabaseAdmin
    .from("teams")
    .select("name, picture_url")
    .eq("league_id", league.id)
    .eq("owner_username", username)
    .maybeSingle();

  let previous: { name: string; pictureUrl: string | null } | null = null;
  if (mine) {
    previous = { name: mine.name, pictureUrl: mine.picture_url ?? null };
  } else {
    const prev = await previousTeam(supabaseAdmin, league.lineage_id ?? league.id, username, league.id).catch(() => null);
    if (prev) previous = { name: prev.name, pictureUrl: prev.picture_url };
  }

  return NextResponse.json({
    ok: true,
    league: { name: league.name, season: league.season },
    previous,
    alreadyIn: !!mine,
  });
}
