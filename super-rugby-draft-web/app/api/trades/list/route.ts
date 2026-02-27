import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";

const norm = (s: string) => s.trim().toLowerCase();

export async function GET(req: Request) {
  const usernameRaw = await getServerUsername();
  if (!usernameRaw) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const username = norm(usernameRaw);

  const { searchParams } = new URL(req.url);
  const leagueId = String(searchParams.get("leagueId") ?? "").trim();
  const status = String(searchParams.get("status") ?? "").trim(); // optional

  if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });

  // must be league member
  const { data: member, error: memberErr } = await supabaseAdmin
    .from("teams")
    .select("id")
    .eq("league_id", leagueId)
    .eq("owner_username", username)
    .maybeSingle();

  if (memberErr) return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });
  if (!member) return NextResponse.json({ ok: false, error: "Not a league member" }, { status: 403 });

  let q = supabaseAdmin.from("trade_offers").select("*").eq("league_id", leagueId).order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);

  const { data: offers, error } = await q;

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, offers: offers ?? [] });
}