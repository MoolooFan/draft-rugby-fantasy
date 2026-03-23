import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const playerId = String(url.searchParams.get("playerId") ?? "").trim();

        if (!playerId) {
            return NextResponse.json(
                { ok: false, error: "Missing playerId" },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
        .from("player_images")
        .select("internal_player_id, external_player_id, image_profile")
        .eq("internal_player_id", playerId)
        .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
            ok: true,
            image_profile: data?.image_profile ?? null,
            external_player_id: data?.external_player_id ?? null,
        });
        } catch (e: any) {
            return NextResponse.json(
                { ok: false, error: e?.message ?? "Failed to load player image" },
                { status: 500 }
            );
        }
}