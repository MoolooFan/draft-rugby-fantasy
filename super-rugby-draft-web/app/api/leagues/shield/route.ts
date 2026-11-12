// app/api/leagues/shield/route.ts
// A league's Shield for the League page's Shield tab (members only): holder, defences, next
// shield game, this season's shield games and every holder so far. Also whether your team has
// secured it for the season and not seen that pop-up yet (POST { leagueId } marks it seen).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireLeagueTeam, toHttpError } from "@/lib/league/serverAuth";
import { loadShield } from "@/lib/league/shieldServer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const shield = await loadShield(supabaseAdmin, leagueId);
    let securedPopup = false;
    if (shield.secured?.teamId === teamId && shield.season != null) {
      const { data } = await supabaseAdmin.from("teams").select("shield_secured_seen").eq("id", teamId).maybeSingle();
      securedPopup = (data?.shield_secured_seen ?? 0) < shield.season;
    }
    return NextResponse.json({ ok: true, shield, securedPopup });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const leagueId = String(body?.leagueId ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const { teamId } = await requireLeagueTeam(leagueId);
    const { data: lg } = await supabaseAdmin.from("leagues").select("season").eq("id", leagueId).maybeSingle();
    const { error } = await supabaseAdmin.from("teams").update({ shield_secured_seen: Number(lg?.season) || 0 }).eq("id", teamId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
