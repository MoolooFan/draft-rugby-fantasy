// lib/teams/icons.ts
// Default team pictures (Ethan, 16 Nov 2026): instead of uploading a photo, a team can pick a
// rugby boot, goal posts (like the ones on the Shield), a ball, or a jersey with a number
// (1-23), in a colour of their choice, on a white circle with thin dark outlines (redrawn from
// Ethan's reference pictures, 16 Nov): white posts with flags and pads in the colour; a white
// ball with trim in the colour; a boot and a jersey (back, big number) in the colour with white
// or black details, whichever shows up better on that colour. Saved in teams.picture_url as "icon:<kind>:<rrggbb>[:<number>]", so
// every page that shows a team picture (components/TeamAvatar.tsx) handles it.

export type TeamIconKind = "boot" | "posts" | "ball" | "jersey";
export const TEAM_ICON_KINDS: Array<{ kind: TeamIconKind; label: string }> = [
  { kind: "boot", label: "Boot" },
  { kind: "posts", label: "Posts" },
  { kind: "ball", label: "Ball" },
  { kind: "jersey", label: "Jersey" },
];
export type TeamIcon = { kind: TeamIconKind; colour: string; number?: number };

/** Colours to pick from (a custom colour is allowed too). */
export const TEAM_ICON_COLOURS = [
  "#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#38bdf8",
  "#3b82f6", "#a855f7", "#ec4899", "#8b5a2b", "#111827", "#ffffff",
];

const KINDS = new Set<string>(TEAM_ICON_KINDS.map((k) => k.kind));

export function isTeamIcon(url: string | null | undefined): boolean {
  return !!parseTeamIcon(url);
}

export function parseTeamIcon(url: string | null | undefined): TeamIcon | null {
  const m = /^icon:([a-z]+):([0-9a-f]{6})(?::(\d{1,2}))?$/i.exec(String(url ?? "").trim());
  if (!m || !KINDS.has(m[1].toLowerCase())) return null;
  const kind = m[1].toLowerCase() as TeamIconKind;
  const n = m[3] ? Number(m[3]) : undefined;
  return { kind, colour: `#${m[2].toLowerCase()}`, ...(kind === "jersey" ? { number: n && n >= 1 && n <= 23 ? n : 10 } : {}) };
}

/** The value saved for an icon (null if it isn't valid). */
export function teamIconValue(icon: { kind: unknown; colour: unknown; number?: unknown }): string | null {
  const kind = String(icon.kind ?? "").toLowerCase();
  const hex = String(icon.colour ?? "").replace(/^#/, "").toLowerCase();
  if (!KINDS.has(kind) || !/^[0-9a-f]{6}$/.test(hex)) return null;
  if (kind !== "jersey") return `icon:${kind}:${hex}`;
  const n = Math.round(Number(icon.number));
  if (!(n >= 1 && n <= 23)) return null;
  return `icon:${kind}:${hex}:${n}`;
}

function luminance(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const INK = "#111111";

/** The details' colour: white, or black where white would be hard to see (contrast under 3:1). */
export function detailColour(colour: string): string {
  return 1.05 / (luminance(colour) + 0.05) >= 3 ? "#ffffff" : INK;
}

/** A darker shade of a colour (for the ball's inner trim line). */
function shade(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (x: number) => Math.max(0, Math.min(255, Math.round(x * f))).toString(16).padStart(2, "0");
  return `#${ch((v >> 16) & 255)}${ch((v >> 8) & 255)}${ch(v & 255)}`;
}

/** Posts: the Shield's posts (components/AwardIcons.tsx), always white; flags and pads in the colour. */
function posts(c: string): string {
  const frame = "M26.5 15 V41 M37.5 15 V41 M26.5 32 H37.5";
  // flags start at each post's left edge, drawn under the post so they join it
  const flags = "M25.6 14.6 C24.1 13.8 22.7 15.6 21.1 14.8 C22.1 16 23.7 17 25.6 16.6 Z M36.6 14.6 C35.1 13.8 33.7 15.6 32.1 14.8 C33.1 16 34.7 17 36.6 16.6 Z";
  return `<g transform="translate(32 32) scale(1.72) translate(-30.2 -28)">
    <path d="${flags}" fill="${c}" stroke="${INK}" stroke-width="0.5" stroke-linejoin="round"/>
    <path d="${frame}" stroke="${INK}" stroke-width="2.9" stroke-linecap="round" fill="none"/>
    <path d="${frame}" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="24.6" y="33.5" width="3.8" height="8.5" rx="1.3" fill="${c}" stroke="${INK}" stroke-width="0.5"/>
    <rect x="35.6" y="33.5" width="3.8" height="8.5" rx="1.3" fill="${c}" stroke="${INK}" stroke-width="0.5"/>
  </g>`;
}

/** Ball: lying nearly flat (tilted up to the right), bold outline, shaded white, two trim bands hugging the top edge. */
function ball(c: string): string {
  const light = luminance(c) > 0.75;
  const outer = light ? "#d1d5db" : c;
  const inner = light ? "#9ca3af" : shade(c, 0.62);
  return `<defs><radialGradient id="tiBallShade" cx="0.38" cy="0.32" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#f3f4f6"/><stop offset="1" stop-color="#b8bec8"/></radialGradient></defs>
  <ellipse cx="33" cy="53" rx="17" ry="2.2" fill="#000000" opacity="0.13"/>
  <g transform="rotate(-27 32 31)">
    <ellipse cx="32" cy="31" rx="25.5" ry="17" fill="url(#tiBallShade)"/>
    <ellipse cx="31.6" cy="28.7" rx="23.5" ry="13.3" fill="none" stroke="${outer}" stroke-width="3.1"/>
    <ellipse cx="31.8" cy="29.3" rx="21" ry="10.9" fill="none" stroke="${inner}" stroke-width="2"/>
    <path d="M10.6 24 C14.6 18.2 22.6 15.6 31.6 15.6 C40.4 15.6 47.6 18.2 51.8 22.4" stroke="#ffffff" stroke-width="0.9" fill="none" opacity="0.65"/>
    <ellipse cx="32" cy="31" rx="25.5" ry="17" fill="none" stroke="${INK}" stroke-width="2.1"/>
  </g>`;
}

/** Boot (from Ethan's reference): small rounded toe to the left, top rising over the laces to a raised heel;
 *  the colour with white / black cut-out lines (laces inside the lace area, collar, heel, toe stitching,
 *  sole line) and two stripes. */
function boot(c: string, d: string): string {
  const upper =
    "M9 45 C6.2 45 5.6 41.4 7.6 39.6 C9.4 38 12.4 37.4 16 36.8 C22 35.6 28.6 32.6 33.6 28.4 L37.4 27.4 C40 30.2 45 30.8 49.4 28.2 L52.6 26.6 C55.8 28.6 57.6 32.8 57.6 37.4 C57.6 40.6 57 43.2 55.8 45 Z";
  const sole = "M7.6 45 H56.6 C56.8 46.9 56 47.9 54.4 47.9 H10 C8.4 47.9 7.4 46.9 7.6 45 Z";
  const stud = (x: number) => `<path d="M${x} 47.6 l1.1 3.5 h2.2 l1.1 -3.5 Z" fill="${c}" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>`;
  // laces: short bars across the lace area, set in from the top edge so they stay on the boot
  const lace = (t: number) => {
    const x = 16 + 17.6 * t + 0.99, y = 36.8 - 8.4 * t + 2.08;
    return `<path d="M${(x - 0.65).toFixed(2)} ${(y - 1.36).toFixed(2)} L${(x + 0.65).toFixed(2)} ${(y + 1.36).toFixed(2)}"/>`;
  };
  return `<g transform="translate(32 33) rotate(-16) scale(1.06) translate(-32.4 -37.5)">
    ${[10.6, 16.4, 22.2, 43.4, 49.6].map(stud).join("")}
    <path d="${sole}" fill="${c}" stroke="${INK}" stroke-width="0.85" stroke-linejoin="round"/>
    <path d="${upper}" fill="${c}" stroke="${INK}" stroke-width="0.85" stroke-linejoin="round"/>
    <g stroke="${d}" fill="none" stroke-linecap="round">
      <path d="M8.6 45 H56" stroke-width="0.9"/>
      <path d="M9 42.8 C9.6 41 11.4 40 14.2 39.6 M11.8 43.6 C12.4 42.3 13.8 41.6 16.2 41.2" stroke-width="0.75"/>
      <path d="M17.4 40.4 C22 39.2 26.4 37 30.4 34.4" stroke-width="0.7" opacity="0.85"/>
      <path d="M38 28.9 C40.6 31.4 45.2 31.9 49.4 29.8" stroke-width="1"/>
      <path d="M52.8 30.4 C55 32.4 55.8 36.4 55.2 42.6" stroke-width="0.8"/>
      <g stroke-width="0.95">${[0.3, 0.47, 0.64, 0.81].map(lace).join("")}</g>
    </g>
    <path d="M30.6 36 L33.4 34.6 L38.2 44.4 L35.2 44.4 Z M35.6 33.6 L38.4 32.4 L43.2 44.4 L40.2 44.4 Z" fill="${d}"/>
  </g>`;
}

/** Jersey (back): the colour, wide white raglan shoulder panels, two-tone cuffs, tall number, dots at the hem. */
function jersey(c: string, d: string, n: number): string {
  const body = "M26 10.5 C30 12.4 34 12.4 38 10.5 L47 13.4 L57 24 L51.6 31.2 L46 26.6 L46 53.6 C37 55 27 55 18 53.6 L18 26.6 L12.4 31.2 L7 24 L17 13.4 Z";
  const dots: string[] = [];
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4 - r; k++) {
    const rad = 0.75 - r * 0.15;
    const y = 52 - r * 2.1;
    dots.push(`<circle cx="${19.6 + k * 2.1}" cy="${y}" r="${rad}"/><circle cx="${44.4 - k * 2.1}" cy="${y}" r="${rad}"/>`);
  }
  const two = n > 9;
  return `<path d="${body}" fill="${c}" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M38 10.5 L47 13.4 L57 24 L55.8 25.4 L45.2 16.4 L37.4 13.8 Z M26 10.5 L17 13.4 L7 24 L8.2 25.4 L18.8 16.4 L26.6 13.8 Z" fill="${d}"/>
    <path d="M37.2 13.6 C40.5 17 43.6 21.6 46 26.6 M26.8 13.6 C23.5 17 20.4 21.6 18 26.6" stroke="${d}" stroke-width="0.7" fill="none" opacity="0.75"/>
    <path d="M55.6 23 L50.4 29.8 M8.4 23 L13.6 29.8" stroke="${shade(c, 0.6)}" stroke-width="2.4" fill="none"/>
    <path d="M56.4 24.2 L51.2 31 M7.6 24.2 L12.8 31" stroke="${d}" stroke-width="1" fill="none"/>
    <path d="M26 10.5 C30 12.4 34 12.4 38 10.5" stroke="${d}" stroke-width="2" fill="none"/>
    <g fill="${d}" opacity="0.45">${dots.join("")}</g>
    <text transform="translate(32 ${two ? 43 : 43.4}) scale(${two ? 0.62 : 0.78} 1)" text-anchor="middle" font-family="'Arial Black', 'Arial', system-ui, sans-serif" font-weight="900" font-size="25" fill="${d}">${n}</text>
    <path d="${body}" fill="none" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>`;
}

/** The icon's drawing (viewBox 0 0 64 64), on a white circle (components/TeamAvatar.tsx). */
export function teamIconSvg(icon: TeamIcon): string {
  const c = icon.colour;
  const d = detailColour(c);
  const body =
    icon.kind === "posts" ? posts(c) : icon.kind === "ball" ? ball(c) : icon.kind === "jersey" ? jersey(c, d, icon.number ?? 10) : boot(c, d);
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}
