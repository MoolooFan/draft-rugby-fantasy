// app/api/leagues/commissioner/route.ts
// POST { leagueId, toTeamId }: the commissioner hands the job to another team's owner (Ethan,
// 23 Nov 2026), so the league can carry on if the commissioner stops playing. The new commissioner
// gets everything (League Settings, draft order, reversing moves, restarting the league next
// season); the old one becomes an ordinary member. The league chat is told. Commissioner only.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireUsername, toHttpError } from "@/lib/league/serverAuth";
import { postMessage } from "@/lib/chat/server";
import { LEAGUE_CHANNEL } from "@/lib/chat/common";

export const dynamic = "force-dynamic";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

export async function POST(req: Request) {
  try {
    const username = await requireUsername();
    const b = await req.json().catch(() => ({}));
    const leagueId = String(b?.leagueId ?? "").trim();
    const toTeamId = String(b?.toTeamId ?? "").trim();
    if (!leagueId || !toTeamId) return NextResponse.json({ ok: false, error: "Missing leagueId or toTeamId" }, { status: 400 });

    const { data: league, error: lErr } = await supabaseAdmin.from("leagues").select("id, created_by").eq("id", leagueId).maybeSingle();
    if (lErr) throw lErr;
    if (!league) return NextResponse.json({ ok: false, error: "League not found" }, { status: 404 });
    if (norm(league.created_by) !== username) return NextResponse.json({ ok: false, error: "Only the commissioner can hand over the job" }, { status: 403 });

    const { data: team, error: tErr } = await supabaseAdmin.from("teams").select("id, name, owner_username").eq("id", toTeamId).eq("league_id", leagueId).maybeSingle();
    if (tErr) throw tErr;
    const to = norm(team?.owner_username);
    if (!team || !to) return NextResponse.json({ ok: false, error: "That team isn't in this league" }, { status: 400 });
    if (to === username) return NextResponse.json({ ok: false, error: "You're already the commissioner" }, { status: 400 });

    // only if it's still ours (two taps at once can't hand it to two people)
    const { data: moved, error: uErr } = await supabaseAdmin.from("leagues").update({ created_by: to }).eq("id", leagueId).eq("created_by", league.created_by).select("id");
    if (uErr) throw uErr;
    if (!moved?.length) return NextResponse.json({ ok: false, error: "The commissioner changed just now; refresh and try again" }, { status: 409 });

    const { data: mine } = await supabaseAdmin.from("teams").select("name").eq("league_id", leagueId).eq("owner_username", username).maybeSingle();
    try {
      await postMessage(supabaseAdmin, {
        leagueId,
        channel: LEAGUE_CHANNEL,
        senderTeamId: null,
        kind: "system",
        body: `${team.name} is the new commissioner${mine?.name ? `, taking over from ${mine.name}` : ""}.`,
        meta: { commissioner: { from: username, to } },
      });
    } catch (e) {
      console.error("[commissioner] chat post failed:", e);
    }
    return NextResponse.json({ ok: true, commissioner: to });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
