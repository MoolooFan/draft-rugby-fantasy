// app/api/leagues/reverse/route.ts
// GET ?leagueId: the moves the commissioner can still reverse (24 hours, and not once the next
// round has kicked off). POST { leagueId, kind: "trade" | "claim" | "transfer", id }: the commissioner reverses a trade,
// waiver claim or free agent move that has gone through (lib/league/reverse.ts). Commissioner only.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireUsername, toHttpError } from "@/lib/league/serverAuth";
import { listReversible, reverseMove, type ReverseKind } from "@/lib/league/reverse";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const username = await requireUsername();
    const leagueId = String(new URL(req.url).searchParams.get("leagueId") ?? "").trim();
    if (!leagueId) return NextResponse.json({ ok: false, error: "Missing leagueId" }, { status: 400 });
    const r = await listReversible(supabaseAdmin, { leagueId, username });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, moves: r.moves });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const username = await requireUsername();
    const b = await req.json().catch(() => ({}));
    const leagueId = String(b?.leagueId ?? "").trim();
    const kind = String(b?.kind ?? "") as ReverseKind;
    const id = String(b?.id ?? "").trim();
    if (!leagueId || !id || !["trade", "claim", "transfer"].includes(kind)) {
      return NextResponse.json({ ok: false, error: "Missing leagueId, kind or id" }, { status: 400 });
    }
    const r = await reverseMove(supabaseAdmin, { leagueId, username, kind, id });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, message: r.message });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
