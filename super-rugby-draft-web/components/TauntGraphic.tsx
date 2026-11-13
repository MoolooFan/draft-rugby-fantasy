"use client";
// components/TauntGraphic.tsx
// The taunt graphic (like ESPN fantasy's): a points card, then an animated picture. Tries: rays
// spinning in the team's colours, the player's picture rising in, "TRY!" slamming over the top.
// Cards: the card flips in, then "SIN BIN!" / "RED CARD!". Tap the picture to play it again.
// Generic pictures are repainted in the browser (lib/chat/tauntArt.ts: green = jersey, magenta =
// second colour, blue = skin).
import { useEffect, useState } from "react";
import { luminance, pointsText, repaintPixels, wordColour, type TauntGraphic as Graphic } from "@/lib/chat/tauntArt";

const painted = new Map<string, Promise<string>>();

/** The picture with its key colours repainted (cached), as a data address. */
export function repaintedArt(url: string, targets: { jersey: string; trim: string; skin: string }): Promise<string> {
  const key = `${url}|${targets.jersey}|${targets.trim}|${targets.skin}`;
  const hit = painted.get(key);
  if (hit) return hit;
  const p = new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(url);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const data = ctx.getImageData(0, 0, c.width, c.height);
        repaintPixels(data.data, targets);
        ctx.putImageData(data, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch {
        resolve(url); // couldn't read the picture: show it as it is
      }
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
  painted.set(key, p);
  return p;
}

const CSS = `
.tg-play .tg-burst { animation: tg-burst 0.7s cubic-bezier(.2,1.4,.4,1) both; transform-origin: 200px 190px; }
.tg-play .tg-word { animation: tg-slam 0.55s 0.45s cubic-bezier(.2,1.6,.4,1) both; transform-box: fill-box; transform-origin: 50% 50%; }
.tg-play .tg-pic { animation: tg-rise 0.6s 0.15s cubic-bezier(.2,1.2,.4,1) both; transform-box: fill-box; transform-origin: 50% 100%; }
.tg-play .tg-card { animation: tg-flip 0.7s 0.1s cubic-bezier(.3,1.4,.5,1) both; transform-box: fill-box; transform-origin: 50% 50%; }
.tg-play .tg-stamp { animation: tg-slam 0.5s 0.55s cubic-bezier(.2,1.6,.4,1) both; transform-box: fill-box; transform-origin: 50% 50%; }
.tg-ray { animation: tg-spin 9s linear infinite; transform-origin: 200px 200px; }
@keyframes tg-burst { from { transform: scale(0.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes tg-slam { 0% { transform: scale(2.4); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes tg-rise { from { transform: translateY(60px) scale(0.85); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes tg-flip { 0% { transform: rotateY(90deg) scale(0.6); opacity: 0; } 100% { transform: none; opacity: 1; } }
@keyframes tg-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tg-play *, .tg-ray { animation: none !important; } }
`;

const rays = (col: string, opacity: number) =>
  Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const b = a + Math.PI / 16;
    return <path key={i} d={`M200 200 L${200 + 420 * Math.cos(a)} ${200 + 420 * Math.sin(a)} L${200 + 420 * Math.cos(b)} ${200 + 420 * Math.sin(b)} Z`} fill={col} opacity={opacity} />;
  });

function Shirt({ jersey, trim, number }: { jersey: string; trim: string; number?: number | null }) {
  return (
    <g className="tg-pic">
      <path d="M140 250 L170 228 L230 228 L260 250 L282 292 L256 304 L248 290 L248 372 L152 372 L152 290 L144 304 L118 292 Z" fill={jersey} stroke={trim} strokeWidth={5} strokeLinejoin="round" />
      <path d="M182 228 Q200 248 218 228" fill="none" stroke={trim} strokeWidth={6} />
      {number ? (
        <text x="200" y="335" textAnchor="middle" fontFamily="Anton, Impact, 'Arial Narrow Bold', sans-serif" fontSize="58" fill={trim}>
          {number}
        </text>
      ) : null}
    </g>
  );
}

function TryArt({ g }: { g: Extract<Graphic, { type: "try" }> }) {
  const [paintedSrc, setPaintedSrc] = useState<{ key: string; src: string } | null>(null);
  const key = g.art ? `${g.art.url}|${g.colours.jersey}|${g.colours.trim}|${g.skin}` : "";
  useEffect(() => {
    if (!g.art?.generic) return;
    let live = true;
    repaintedArt(g.art.url, { jersey: g.colours.jersey, trim: g.colours.trim, skin: g.skin }).then((src) => {
      if (live) setPaintedSrc({ key, src });
    });
    return () => {
      live = false;
    };
  }, [g.art, g.colours.jersey, g.colours.trim, g.skin, key]);
  const src = !g.art ? null : g.art.generic ? (paintedSrc?.key === key ? paintedSrc.src : null) : g.art.url;
  const word = wordColour(g.colours);

  if (!g.art) {
    // no pictures uploaded yet: the drawn jersey
    return (
      <>
        <rect width="400" height="400" fill={g.colours.jersey} />
        <g className="tg-ray">{rays(g.colours.trim, 0.3)}</g>
        <circle className="tg-burst" cx="200" cy="190" r="150" fill="#ffffff" opacity="0.92" />
        <Shirt jersey={g.colours.jersey} trim={word} number={g.number} />
        <g className="tg-word">
          <text x="200" y="175" textAnchor="middle" fontFamily="Anton, Impact, 'Arial Narrow Bold', sans-serif" fontSize="150" fill={word} stroke="#ffffff" strokeWidth="10" paintOrder="stroke" transform="rotate(-6 200 120)">
          TRY!
        </text>
        </g>
      </>
    );
  }
  return (
    <>
      <rect width="400" height="400" fill={g.colours.jersey} />
      <g className="tg-ray">{rays(g.colours.trim, 0.3)}</g>
      <circle className="tg-burst" cx="200" cy="190" r="160" fill="#ffffff" opacity="0.92" />
      {src ? <image className="tg-pic" href={src} x="20" y="8" width="360" height="352" preserveAspectRatio="xMidYMax meet" /> : null}
      <g className="tg-word">
          <text x="200" y="388" textAnchor="middle" fontFamily="Anton, Impact, 'Arial Narrow Bold', sans-serif" fontSize="118" fill={word} stroke="#ffffff" strokeWidth="10" paintOrder="stroke" transform="rotate(-6 200 340)">
        TRY!
      </text>
        </g>
    </>
  );
}

function CardArt({ g }: { g: Extract<Graphic, { type: "card" }> }) {
  const colour = g.card === "red" ? "#dc2626" : "#facc15";
  const label = g.card === "red" ? "RED CARD!" : "SIN BIN!";
  const teamCol = luminance(g.colours.jersey) >= luminance(g.colours.trim) ? g.colours.jersey : g.colours.trim;
  return (
    <>
      <rect width="400" height="400" fill="#0f172a" />
      <g className="tg-ray">{rays(colour, 0.18)}</g>
      <g transform="rotate(10 200 155)">
        <rect className="tg-card" x="140" y="70" width="120" height="170" rx="14" fill={colour} stroke="#ffffff" strokeWidth="6" />
      </g>
      <g className="tg-stamp">
          <text x="200" y="330" textAnchor="middle" fontFamily="Anton, Impact, 'Arial Narrow Bold', sans-serif" fontSize="84" fill="#ffffff" stroke="#0f172a" strokeWidth="8" paintOrder="stroke" transform="rotate(-6 200 300)">
        {label}
      </text>
        </g>
      <text x="200" y="372" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="800" fontSize="20" fill={teamCol}>
        {g.teamName.toUpperCase()} DOWN TO 14
      </text>
    </>
  );
}

/** The animated picture on its own (also used for the admin page preview). */
export function TauntArtwork({ graphic, size = 240 }: { graphic: Graphic; size?: number }) {
  const [run, setRun] = useState(0);
  const label = graphic.type === "try" ? `TRY! ${graphic.line}` : `${graphic.card === "red" ? "Red card" : "Sin bin"}: ${graphic.line}`;
  return (
    <button
      type="button"
      onClick={() => setRun((n) => n + 1)}
      title="Play again"
      aria-label={`${label}. Play again`}
      style={{ display: "block", width: size, maxWidth: "100%", aspectRatio: "1", padding: 0, border: "none", borderRadius: 16, overflow: "hidden", cursor: "pointer", background: "transparent" }}
    >
      <style>{CSS}</style>
      <svg key={run} className="tg-play" viewBox="0 0 400 400" width="100%" height="100%" style={{ display: "block" }} aria-hidden="true">
        {graphic.type === "try" ? <TryArt g={graphic} /> : <CardArt g={graphic} />}
      </svg>
    </button>
  );
}

/** Points card + picture, as it shows in the chat. */
export default function TauntGraphic({ graphic, align = "start" }: { graphic: Graphic; align?: "start" | "end" }) {
  return (
    <div style={{ display: "grid", gap: 4, justifyItems: align }}>
      <div style={{ background: "rgba(124,58,237,0.95)", color: "white", borderRadius: 14, padding: "8px 12px", lineHeight: 1.25, maxWidth: 240 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{pointsText(graphic.points)}</div>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{graphic.line}</div>
      </div>
      <TauntArtwork graphic={graphic} />
    </div>
  );
}
