// lib/chat/tauntArt.ts
// Pictures for try taunts (Ethan, 13 Nov 2026). The graphic is drawn in code (spinning rays in the
// team's colours, "TRY!" slamming in, components/TauntGraphic.tsx) with a picture in the middle:
//
//   - a player's own picture, if Ethan uploaded one for him (top players): shown as it is
//   - otherwise one of the generic pictures, picked at random each taunt. These are drawn with
//     "key colours" that the site repaints, keeping the shading:
//        bright GREEN    -> the player's team jersey colour
//        bright MAGENTA  -> the team's second colour (collar, trim, shorts, socks; optional)
//        bright BLUE     -> the player's skin tone (set per player on the admin page)
//
// Pure code (tested in scripts/tests/taunt-art.test.ts). Pictures need a see-through background,
// or the background could be repainted too if it has green / blue / magenta in it.

export type TeamColours = { jersey: string; trim: string };

/** Starting colours for each team; Ethan can change them on the admin Taunts tab. */
export const DEFAULT_TEAM_COLOURS: Record<string, TeamColours> = {
  BLU: { jersey: "#0b3a82", trim: "#ffffff" },
  BRU: { jersey: "#0a2a5c", trim: "#ffc72c" },
  CHI: { jersey: "#c8102e", trim: "#f2c230" },
  CRU: { jersey: "#c8102e", trim: "#111111" },
  DRU: { jersey: "#ffffff", trim: "#0b4ea2" },
  FOR: { jersey: "#0a2240", trim: "#4fb3e8" },
  HIG: { jersey: "#0b2a55", trim: "#ffb81c" },
  HUR: { jersey: "#ffc600", trim: "#111111" },
  MOA: { jersey: "#0093a5", trim: "#111111" },
  RED: { jersey: "#a3122a", trim: "#ffffff" },
  WAR: { jersey: "#6fb5e6", trim: "#0a2240" },
};
export const FALLBACK_COLOURS: TeamColours = { jersey: "#334155", trim: "#ffffff" };

export function teamColours(code: string | null | undefined, saved?: Record<string, TeamColours>): TeamColours {
  const c = (code ?? "").toUpperCase() === "MOP" ? "MOA" : (code ?? "").toUpperCase();
  return saved?.[c] ?? DEFAULT_TEAM_COLOURS[c] ?? FALLBACK_COLOURS;
}

/** The four skin tones (the middle shade of each; light and shadow come from the picture). */
export const SKIN_TONES: Array<{ id: number; label: string; colour: string }> = [
  { id: 1, label: "Light", colour: "#e2ae88" },
  { id: 2, label: "Medium", colour: "#c38b5f" },
  { id: 3, label: "Brown", colour: "#8e5b3a" },
  { id: 4, label: "Dark", colour: "#5c3a25" },
];
export const DEFAULT_SKIN_TONE = 2;

export function skinColour(tone: number | null | undefined): string {
  return (SKIN_TONES.find((t) => t.id === tone) ?? SKIN_TONES.find((t) => t.id === DEFAULT_SKIN_TONE)!).colour;
}

export function isHexColour(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative brightness 0..1 (for picking a readable colour). */
export function luminance(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The darker of the two team colours, for the "TRY!" lettering (it sits on a white burst). */
export function wordColour(c: TeamColours): string {
  return luminance(c.jersey) <= luminance(c.trim) ? c.jersey : c.trim;
}

// ---------------------------------------------------------------------------
// Repainting the key colours

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Which key colour a hue (degrees) belongs to, if any. */
export function keyFor(hue: number): "jersey" | "skin" | "trim" | null {
  if (hue >= 75 && hue <= 165) return "jersey"; // green
  if (hue >= 185 && hue <= 265) return "skin"; // blue
  if (hue >= 275 && hue <= 335) return "trim"; // magenta
  return null;
}

/**
 * Repaint a picture's key colours in place (RGBA pixels, as from a canvas). A key pixel keeps
 * its light and shade: a pure key colour (lightness 50%) becomes exactly the target colour,
 * darker shades darken it, lighter ones lighten it towards white. Greyish pixels (outlines,
 * the ball, white socks) are left alone; edges blend.
 */
export function repaintPixels(px: Uint8ClampedArray, targets: { jersey: string; trim: string; skin: string }): void {
  const tgt = { jersey: hexRgb(targets.jersey), trim: hexRgb(targets.trim), skin: hexRgb(targets.skin) };
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 0.08) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    let h: number;
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
    const key = keyFor(h);
    if (!key) continue;
    const w = smooth(0.22, 0.45, s);
    if (w <= 0) continue;
    const [tr, tg, tb] = tgt[key];
    const f = l / 0.5;
    const shade = (c: number) => (f <= 1 ? c * f : c + (255 - c) * Math.min(1, f - 1));
    px[i] = Math.round(px[i] * (1 - w) + shade(tr) * w);
    px[i + 1] = Math.round(px[i + 1] * (1 - w) + shade(tg) * w);
    px[i + 2] = Math.round(px[i + 2] * (1 - w) + shade(tb) * w);
  }
}

// ---------------------------------------------------------------------------
// Which picture a taunt uses, and what goes in the chat message

export type TauntArt = { id: string; player_id: string | null; url: string; active: boolean };

/** The player's own picture if he has one (random among several), else a random generic one. */
export function pickArt(arts: TauntArt[], playerId: string, rand: () => number = Math.random): { url: string; generic: boolean } | null {
  const pick = <T,>(xs: T[]) => xs[Math.min(xs.length - 1, Math.floor(rand() * xs.length))];
  const own = arts.filter((a) => a.active && a.player_id === playerId);
  if (own.length) return { url: pick(own).url, generic: false };
  const generic = arts.filter((a) => a.active && !a.player_id);
  if (generic.length) return { url: pick(generic).url, generic: true };
  return null;
}

/** Saved in the taunt message (meta.graphic), so the message always shows what was sent. */
export type TauntGraphic =
  | {
      type: "try";
      points: number;
      line: string; // "Damian McKenzie try"
      teamName: string;
      colours: TeamColours;
      skin: string;
      art: { url: string; generic: boolean } | null; // null = the drawn jersey (no pictures yet)
      number?: number | null;
    }
  | { type: "card"; points: number; line: string; card: "yellow" | "red"; teamName: string; colours: TeamColours };

export function pointsText(n: number): string {
  const v = Math.round(n * 10) / 10;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} Points`;
}

export function tryLine(name: string, tries: number): string {
  return tries > 1 ? `${name}, ${tries} tries` : `${name} try`;
}

export function cardLine(name: string, card: "yellow" | "red"): string {
  return card === "red" ? `${name} sent off` : `${name} sin-binned`;
}
