// app/api/admin/history/route.ts — admin only (plan item E8). League history and stars:
// GET  -> past seasons in the honours list (by league name), the names in it and who they're
//         linked to, current leagues and accounts.
// POST { action: "link-league", season, leagueName, leagueId } -> that season's history counts
//         as part of this league (its lineage), so its champions get stars there.
// POST { action: "link-person", personName, userId | null } -> this history name is this account
//         (every season).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSiteAdmin();
    const [h, l, u] = await Promise.all([
      supabaseAdmin.from("honours").select("season, league_name, lineage_id, person_name, user_id, place").order("season", { ascending: false }),
      supabaseAdmin.from("leagues").select("id, name, season, lineage_id").order("season", { ascending: false }),
      supabaseAdmin.from("users").select("id, username").order("username"),
    ]);
    if (h.error) throw h.error;
    if (l.error) throw l.error;
    if (u.error) throw u.error;

    const groups = new Map<string, { season: number; leagueName: string; lineageId: string | null; champion: string | null; rows: number }>();
    for (const r of h.data ?? []) {
      const key = `${r.season}|${r.league_name}`;
      const g = groups.get(key) ?? { season: r.season, leagueName: r.league_name, lineageId: r.lineage_id, champion: null, rows: 0 };
      g.rows++;
      if (r.place === "champion") g.champion = r.person_name;
      groups.set(key, g);
    }
    const people = new Map<string, string | null>();
    for (const r of h.data ?? []) if (!people.has(r.person_name) || r.user_id) people.set(r.person_name, r.user_id ?? people.get(r.person_name) ?? null);

    return NextResponse.json({
      ok: true,
      groups: [...groups.values()],
      people: [...people].map(([personName, userId]) => ({ personName, userId })).sort((a, b) => a.personName.localeCompare(b.personName)),
      leagues: (l.data ?? []).map((x) => ({ id: x.id, name: x.name, season: x.season, lineageId: x.lineage_id ?? x.id })),
      users: u.data ?? [],
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSiteAdmin();
    const body = await req.json().catch(() => ({}));

    if (body?.action === "link-league") {
      const season = Number(body.season);
      const leagueName = String(body.leagueName ?? "");
      const leagueId = String(body.leagueId ?? "").trim();
      const { data: league, error } = await supabaseAdmin.from("leagues").select("id, lineage_id").eq("id", leagueId).maybeSingle();
      if (error) throw error;
      if (!league) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
      const lineage = league.lineage_id ?? league.id;
      if (!league.lineage_id) {
        const { error: lErr } = await supabaseAdmin.from("leagues").update({ lineage_id: lineage }).eq("id", league.id);
        if (lErr) throw lErr;
      }
      const { error: hErr } = await supabaseAdmin.from("honours").update({ lineage_id: lineage }).eq("season", season).eq("league_name", leagueName);
      if (hErr) throw hErr;
      return NextResponse.json({ ok: true });
    }

    if (body?.action === "link-person") {
      const personName = String(body.personName ?? "");
      const userId = body.userId ? String(body.userId) : null;
      if (!personName) return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
      const { error } = await supabaseAdmin.from("honours").update({ user_id: userId }).eq("person_name", personName);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
