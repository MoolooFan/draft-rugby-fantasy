import type { MetadataRoute } from "next";
import { currentSeasonYear } from "@/lib/season";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `Draft Fantasy ${currentSeasonYear()}`,
    short_name: "Draft Fantasy",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
