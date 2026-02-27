import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function POST(req: Request) {
  const username = await getServerUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const { teamId, leagueId, name, initials } = body ?? {};

  if (!teamId || !leagueId || !name) {
    return NextResponse.json(
      { error: "Missing teamId/leagueId/name" },
      { status: 400 }
    );
  }

  const owner_username = norm(username);

  const { data: existing, error: exErr } = await supabaseAdmin
    .from("teams")
    .select("id, owner_username, league_id")
    .eq("id", teamId)
    .maybeSingle();

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  if (existing && String(existing.league_id) !== String(leagueId)) {
  return NextResponse.json({ error: "Team not in this league" }, { status: 400 });
}

  if (existing && existing.owner_username && norm(existing.owner_username) !== owner_username) {
    return NextResponse.json({ error: "Team already owned" }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from("teams").upsert(
    {
      id: teamId,
      league_id: leagueId,
      name,
      initials: typeof initials === "string" && initials.trim() ? initials.trim().toUpperCase() : null,
      user_id: owner_username,
      owner_username,
    },
    { onConflict: "id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}