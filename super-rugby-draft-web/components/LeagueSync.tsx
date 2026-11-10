"use client";
// Loads the signed-in player's leagues once per page load (lib/league/store loadMyLeagues),
// so every page knows the active league, not just the dashboard.
import { useEffect } from "react";
import { loadMyLeagues } from "@/lib/league/store";

export default function LeagueSync({ username }: { username: string | null }) {
  useEffect(() => {
    if (username) void loadMyLeagues();
  }, [username]);
  return null;
}
