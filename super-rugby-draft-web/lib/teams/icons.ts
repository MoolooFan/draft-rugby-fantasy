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
  const ch = (x: number) => Math.round(x * f).toString(16).padStart(2, "0");
  return `#${ch((v >> 16) & 255)}${ch((v >> 8) & 255)}${ch(v & 255)}`;
}

const OUT = `stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"`;

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

/** Ball: always white, the trim (a band just inside the edge) in the colour. */
function ball(c: string): string {
  return `<g transform="rotate(-35 32 32)">
    <ellipse cx="32" cy="32" rx="14.5" ry="22" fill="#f1f5f9"/>
    <path d="M32 10 C22 10 17.5 21 17.5 32 C17.5 43 22 54 32 54 C26 50 23.5 41 23.5 32 C23.5 23 26 14 32 10 Z" fill="#ffffff"/>
    <path d="M39.5 13.5 C44 18 46.5 25 46.5 32 C46.5 43 41 52 32 54 C38 48.5 41.5 41 41.5 32 C41.5 25 40.8 19 39.5 13.5 Z" fill="#cbd5e1" opacity="0.8"/>
    <ellipse cx="32" cy="32" rx="11.4" ry="18.6" fill="none" stroke="${INK}" stroke-width="3.5"/>
    <ellipse cx="32" cy="32" rx="11.4" ry="18.6" fill="none" stroke="${c}" stroke-width="2.6"/>
    <ellipse cx="32" cy="32" rx="9.2" ry="16.3" fill="none" stroke="${shade(c, 0.7)}" stroke-width="1"/>
    <ellipse cx="32" cy="32" rx="14.5" ry="22" fill="none" stroke="${INK}" stroke-width="1.5"/>
    <ellipse cx="24.8" cy="20.5" rx="1.5" ry="4.2" fill="#ffffff" transform="rotate(14 24.8 20.5)"/>
  </g>`;
}

/** Boot, side on (toe to the right): the colour, with white / black details and two stripes. */
function boot(c: string, d: string): string {
  const upper =
    "M13 27.5 C15 26.5 17 26.8 19 28.2 C21 29.5 23 28.6 24.5 25.5 L27 24.8 C30 29 36 32.5 44 34.6 C51 36.4 56.5 37.6 57.5 40.2 C58 41.6 57.2 42.8 55.5 43 L14 44 C12.2 40 12 33 13 27.5 Z";
  const sole = "M14 44 L55.5 43 C57.2 42.8 58 41.6 57.6 40.6 C58.6 41.6 58.8 43.6 57.6 44.8 C56.6 45.8 55.2 46 53.8 46 L15.6 46.8 C14 46.8 13.2 45.8 14 44 Z";
  const stud = (x: number, y: number) => `<path d="M${x} ${y} h3.6 l-0.6 3.3 h-2.4 Z" fill="${c}" ${OUT}/>`;
  const lace = (x: number, y: number) => `<path d="M${x - 1.3} ${y + 1.8} L${x + 1.3} ${y - 1.8}"/>`;
  return `<g transform="translate(32 33) scale(1.12) translate(-35.5 -36)">
    <path d="${upper}" fill="${c}" ${OUT}/>
    <path d="${sole}" fill="${c}" ${OUT}/>
    <path d="M14 44 L55.5 43" stroke="${d}" stroke-width="1.1"/>
    <path d="M13.5 28.4 C15.3 27.6 17.1 27.9 18.9 29.2 C20.9 30.5 22.9 29.6 24.3 26.6" stroke="${d}" stroke-width="1" fill="none"/>
    <path d="M14.3 31.5 C17.2 33 18.6 36.6 18.2 43.4" stroke="${d}" stroke-width="1" fill="none"/>
    <path d="M47.4 35.8 C50.4 37.6 51.6 40.2 51.2 42.6" stroke="${d}" stroke-width="0.8" fill="none" opacity="0.9"/>
    <path d="M33.2 30.6 L36.4 31.8 L32.4 43.3 L29 43.4 Z M39 32.8 L42.2 33.9 L38.6 43.1 L35.2 43.2 Z" fill="${d}"/>
    <g stroke="${d}" stroke-width="1.15" stroke-linecap="round" fill="none">${lace(27.6, 27.2)}${lace(30.1, 29)}</g>
    ${stud(16.2, 46.4)}${stud(22, 46.3)}${stud(34.5, 46.1)}${stud(41, 46)}${stud(47.5, 45.9)}${stud(53, 45.8)}
    <path d="${upper}" fill="none" ${OUT}/>
  </g>`;
}

/** Jersey, from the back: the colour, white / black trim on the shoulders, cuffs and collar, a big number. */
function jersey(c: string, d: string, n: number): string {
  const body = "M20 14 L27 11 C29 12.8 35 12.8 37 11 L44 14 L55 22.5 L50 31.5 L45 28.5 L45 53 L19 53 L19 28.5 L14 31.5 L9 22.5 Z";
  const two = n > 9;
  return `<path d="${body}" fill="${c}" ${OUT}/>
    <path d="M37.6 12.9 L43.8 15.5 L54 23.3 M26.4 12.9 L20.2 15.5 L10 23.3" stroke="${d}" stroke-width="1.5" fill="none" stroke-linejoin="round"/>
    <path d="M53.9 21.5 L48.9 30.5 M10.1 21.5 L15.1 30.5" stroke="${d}" stroke-width="1.7" fill="none"/>
    <path d="M52.6 20.4 L47.6 29.4 M11.4 20.4 L16.4 29.4" stroke="${d}" stroke-width="0.6" fill="none"/>
    <path d="M27 11 C29 12.8 35 12.8 37 11" stroke="${d}" stroke-width="1.8" fill="none"/>
    <path d="M19.6 50.8 H44.4" stroke="${d}" stroke-width="0.7" opacity="0.7"/>
    <text transform="translate(32 ${two ? 46.5 : 47}) scale(${two ? 0.68 : 0.82} 1)" text-anchor="middle" font-family="'Arial Black', 'Arial', system-ui, sans-serif" font-weight="900" font-size="25" fill="${d}">${n}</text>
    <path d="${body}" fill="none" ${OUT}/>`;
}

/** The icon's drawing (viewBox 0 0 64 64), on a white circle (components/TeamAvatar.tsx). */
export function teamIconSvg(icon: TeamIcon): string {
  const c = icon.colour;
  const d = detailColour(c);
  const body =
    icon.kind === "posts" ? posts(c) : icon.kind === "ball" ? ball(c) : icon.kind === "jersey" ? jersey(c, d, icon.number ?? 10) : boot(c, d);
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}
