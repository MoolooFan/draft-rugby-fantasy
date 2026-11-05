// app/api/admin/scoring/route.ts — admin only. The Standard and Alternate point values.
// Changes apply to leagues that haven't started their draft (a league's scoring is frozen then).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { getSystemRules } from "@/lib/scoring/leagueRules";
import { cleanScoringRules } from "@/lib/scoring/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSiteAdmin();
    const [standard, alternate] = await Promise.all([getSystemRules(supabaseAdmin, "standard"), getSystemRules(supabaseAdmin, "alternate")]);
    return NextResponse.json({ ok: true, systems: { standard, alternate } });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/** Body: { id: "standard" | "alternate", rules } */
export async function POST(req: Request) {
  try {
    const admin = await requireSiteAdmin();
    const body = await req.json().catch(() => null);
    const id = body?.id === "alternate" ? "alternate" : body?.id === "standard" ? "standard" : null;
    if (!id) return NextResponse.json({ ok: false, error: "Pick Standard or Alternate" }, { status: 400 });
    const base = await getSystemRules(supabaseAdmin, id);
    const { rules, error } = cleanScoringRules(body?.rules, { allowStructure: true, base });
    if (!rules) return NextResponse.json({ ok: false, error }, { status: 400 });
    const { error: uErr } = await supabaseAdmin
      .from("scoring_systems")
      .upsert({ id, rules, updated_at: new Date().toISOString(), updated_by: admin }, { onConflict: "id" });
    if (uErr) throw uErr;
    return NextResponse.json({ ok: true, rules });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
