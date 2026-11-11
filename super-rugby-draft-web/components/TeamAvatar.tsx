"use client";

// A team's picture in a circle (plan item E5), or its initials if it has no picture, with a gold
// star on the top edge for each championship its owner has won in this league (E8).

import React, { useState } from "react";
import { StarShape, starPositions } from "@/components/ChampionStar";

export function TeamAvatar({
  pictureUrl,
  initials,
  size = 32,
  stars = 0,
  style,
}: {
  pictureUrl?: string | null;
  initials?: string | null;
  size?: number;
  /** championships won in this league */
  stars?: number;
  style?: React.CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  const showPicture = !!pictureUrl && !broken;
  const text = String(initials ?? "").trim().slice(0, 3).toUpperCase() || "?";
  const n = Math.max(0, Math.min(9, Math.floor(stars || 0)));
  const R = size / 2;
  const starR = Math.max(4, size * 0.12);
  const pad = starR * 1.4;

  return (
    <span
      title={n ? `${n} ${n === 1 ? "championship" : "championships"}` : undefined}
      style={{ position: "relative", display: "inline-block", width: size, height: size, flex: "0 0 auto", ...style }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: size,
          height: size,
          borderRadius: 999,
          overflow: "hidden",
          background: "linear-gradient(135deg, rgb(29,78,216), rgb(15,23,42))",
          color: "white",
          fontSize: Math.max(8, Math.round(size * 0.36)),
          fontWeight: 900,
          lineHeight: 1,
          boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 4px 10px rgba(0,0,0,0.18)",
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
      {n ? (
        <svg
          aria-hidden="true"
          width={size + pad * 2}
          height={size + pad * 2}
          viewBox={`${-R - pad} ${-R - pad} ${size + pad * 2} ${size + pad * 2}`}
          style={{ position: "absolute", left: -pad, top: -pad, overflow: "visible", pointerEvents: "none" }}
        >
          {starPositions(n, R).map((p, i) => (
            <g key={i} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
              <StarShape r={starR} />
            </g>
          ))}
        </svg>
      ) : null}
    </span>
  );
}
