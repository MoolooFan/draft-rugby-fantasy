// app/api/admin/taunts/route.ts — admin only. The ready-made taunt lines (lib/chat/common.ts).
// GET -> every line. POST { action: "add", kind, text } | { action: "edit", id, text } |
// { action: "toggle", id, active } -> change them. {player}, {opponent}, {card} get filled in.
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSiteAdmin } from "@/lib/admin/server";
import { toHttpError } from "@/lib/league/serverAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSiteAdmin();
    const { data, error } = await supabaseAdmin.from("taunt_lines").select("id, kind, text, active").order("kind").order("created_at");
    if (error) throw error;
    return NextResponse.json({ ok: true, lines: data ?? [] });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    await requireSiteAdmin();
    const b = await req.json().catch(() => ({}));
    const text = String(b?.text ?? "").trim().slice(0, 200);
    if (b?.action === "add") {
      if (!["try", "card"].includes(b?.kind) || !text) return NextResponse.json({ ok: false, error: "Pick try or card and write the line" }, { status: 400 });
      const { error } = await supabaseAdmin.from("taunt_lines").insert({ kind: b.kind, text });
      if (error) throw error;
    } else if (b?.action === "edit") {
      if (!b?.id || !text) return NextResponse.json({ ok: false, error: "Write the line" }, { status: 400 });
      const { error } = await supabaseAdmin.from("taunt_lines").update({ text }).eq("id", String(b.id));
      if (error) throw error;
    } else if (b?.action === "toggle") {
      const { error } = await supabaseAdmin.from("taunt_lines").update({ active: b?.active !== false }).eq("id", String(b?.id ?? ""));
      if (error) throw error;
    } else {
      return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
