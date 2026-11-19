// GET  /api/leagues/stakes?leagueId=          -> LeagueStakes (lib/league/stakes.ts): the text, and who has agreed
// POST /api/leagues/stakes { leagueId, rewards, punishments } -> the commissioner saves them
//      (any change: everyone agrees again; the commissioner counts as agreeing)
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getServerUsername } from "@/lib/serverSession";
import { cleanStakesText, type LeagueStakes } from "@/lib/league/stakes";

const NO_STORE = { "Cache-Control": "private, no-store" };
const norm = (s: string) => s.trim().toLowerCase();

async function load(leagueId: string, username: string): Promise<{ stakes?: LeagueStakes; error?: string; status?: number }> {
  const { data: league, error } = await supabaseAdmin
    .from("leagues")
    .select("id, created_by, stakes_rewards, stakes_punishments, stakes_version")
    .eq("id", leagueId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  if (!league) return { error: "League not found", status: 404 };
  const { data: teams, error: tErr } = await supabaseAdmin
    .from("teams")
    .select("id, name, owner_username, stakes_agreed_version, stakes_agreed_at")
    .eq("league_id", leagueId);
  if (tErr) return { error: tErr.message, status: 500 };
  const mine = (teams ?? []).find((t) => norm(String(t.owner_username ?? "")) === username);
  if (!mine) return { error: "You aren't in this league", status: 403 };

  const owners = [...new Set((teams ?? []).map((t) => String(t.owner_username ?? "")).filter(Boolean))];
  const names = new Map<string, string>();
  if (owners.length) {
    const { data: users } = await supabaseAdmin.from("users").select("username, username_norm, first_name, last_name").in("username_norm", owners);
    for (const u of users ?? []) {
      const first = String(u.first_name ?? "").trim();
      const last = String(u.last_name ?? "").trim();
      names.set(u.username_norm, first ? `${first}${last ? ` ${last[0].toUpperCase()}.` : ""}` : u.username);
    }
  }
  const version = Number(league.stakes_version ?? 0);
  const agreedTo = (t: { stakes_agreed_version?: number | null }) => Number(t.stakes_agreed_version ?? 0) >= version;
  return {
    stakes: {
      rewards: league.stakes_rewards ?? null,
      punishments: league.stakes_punishments ?? null,
      version,
      isCommissioner: norm(String(league.created_by ?? "")) === username,
      myTeamId: mine.id,
      myAgreedVersion: Number(mine.stakes_agreed_version ?? 0),
      teams: (teams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        ownerName: names.get(String(t.owner_username ?? "")) ?? null,
        agreed: agreedTo(t),
        agreedAt: agreedTo(t) ? t.stakes_agreed_at ?? null : null,
      })),
    },
  };
}

export async function GET(req: Request) {
  const user = await getServerUsername();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
  if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400, headers: NO_STORE });
  const r = await load(leagueId, norm(user));
  if (!r.stakes) return NextResponse.json({ ok: false, error: r.error }, { status: r.status ?? 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, stakes: r.stakes }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getServerUsername();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401, headers: NO_STORE });
  const username = norm(user);
  const body = await req.json().catch(() => ({}));
  const leagueId = String(body?.leagueId ?? "").trim();
  if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400, headers: NO_STORE });
  const cur = await load(leagueId, username);
  if (!cur.stakes) return NextResponse.json({ ok: false, error: cur.error }, { status: cur.status ?? 500, headers: NO_STORE });
  if (!cur.stakes.isCommissioner) return NextResponse.json({ ok: false, error: "Only the commissioner can change these" }, { status: 403, headers: NO_STORE });

  const rewards = cleanStakesText(body?.rewards);
  const punishments = cleanStakesText(body?.punishments);
  if (rewards === cur.stakes.rewards && punishments === cur.stakes.punishments) {
    return NextResponse.json({ ok: true, stakes: cur.stakes }, { headers: NO_STORE });
  }
  const version = cur.stakes.version + 1;
  const { error } = await supabaseAdmin
    .from("leagues")
    .update({ stakes_rewards: rewards, stakes_punishments: punishments, stakes_version: version })
    .eq("id", leagueId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
  // the commissioner agrees to what they wrote
  await supabaseAdmin
    .from("teams")
    .update({ stakes_agreed_version: version, stakes_agreed_at: new Date().toISOString() })
    .eq("id", cur.stakes.myTeamId!);
  const next = await load(leagueId, username);
  return NextResponse.json({ ok: true, stakes: next.stakes }, { headers: NO_STORE });
}
