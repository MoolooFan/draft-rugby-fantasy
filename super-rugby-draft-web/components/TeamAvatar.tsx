"use client";

// A team's picture in a circle (plan item E5), or its initials if it has no picture.
// Championship stars (E8) will sit on the top edge.

import React, { useState } from "react";

export function TeamAvatar({
  pictureUrl,
  initials,
  size = 32,
  style,
}: {
  pictureUrl?: string | null;
  initials?: string | null;
  size?: number;
  style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const showPicture = !!pictureUrl && !broken;
  const text = String(initials ?? "").trim().slice(0, 3).toUpperCase() || "?";

  return (
    <span
      aria-hidden="true"
      style={{
        position: "relative",
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: 999,
        overflow: "hidden",
        background: "linear-gradient(135deg, rgb(29,78,216), rgb(15,23,42))",
        color: "white",
        fontSize: Math.max(8, Math.round(size * 0.36)),
        fontWeight: 900,
        lineHeight: 1,
        boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 4px 10px rgba(0,0,0,0.18)",
        ...style,
      }}
    >
      {showPicture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pictureUrl!}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          draggable={false}
        />
      ) : (
        text
      )}
    </span>
  );
}
