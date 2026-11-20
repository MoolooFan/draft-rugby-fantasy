"use client";
// components/dashboard/JerseyTile.tsx
// A Super Rugby team's jersey for the Dashboard's player lists (placeholder if it won't load).
import React from "react";
import { JERSEY_PLACEHOLDER, jerseySrcForTeamCode } from "./helpers";

export function JerseyTile({
  size = 36,
  teamCode,
}: {
  size?: number;
  teamCode?: string;
}) {
  const src = jerseySrcForTeamCode(teamCode, "angle");

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{
        width: 30,
        height: 30,
        borderRadius: 10,
        objectFit: "contain",
        display: "block",
      }}
      draggable={false}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = JERSEY_PLACEHOLDER;
      }}
    />
  );
}
