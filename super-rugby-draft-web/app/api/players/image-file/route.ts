import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawPlayerId = String(url.searchParams.get("playerId") ?? "").trim();
const playerId = rawPlayerId.toLowerCase();

    if (!playerId) {
      return new NextResponse("Missing playerId", { status: 400 });
    }

    const { data, error } = await supabaseAdmin
  .from("player_images")
  .select("image_profile")
  .eq("internal_player_id", playerId)
  .maybeSingle();

    if (error) throw error;

    const imageUrl = String(data?.image_profile ?? "").trim();

    if (!imageUrl) {
      return new NextResponse("No image found", { status: 404 });
    }

    const upstream = await fetch(imageUrl, {
      cache: "no-store",
      headers: {
        "user-agent": "Mozilla/5.0",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: "https://www.playfantasyrugby.com/",
      },
    });

    if (!upstream.ok) {
      return new NextResponse(`Failed to fetch remote image: ${upstream.status}`, {
        status: upstream.status,
      });
    }

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "image/png";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (e: any) {
    return new NextResponse(e?.message ?? "Failed to load player image", {
      status: 500,
    });
  }
}