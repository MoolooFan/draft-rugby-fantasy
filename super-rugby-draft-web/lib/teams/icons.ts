// lib/teams/icons.ts
// Default team pictures (Ethan, 16 Nov 2026): instead of uploading a photo, a team can pick a
// rugby boot, goal posts (like the ones on the Shield), a ball, or a jersey with a number
// (1-23), in a colour of their choice. The icon is the chosen colour with white details (laces
// and studs, post pads and flags, the ball's stitching, the jersey's collar and number), on the
// usual dark blue circle. Saved in teams.picture_url as "icon:<kind>:<rrggbb>[:<number>]", so
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

/** The details' colour: white, or dark navy on a very light icon (so they still show). */
export function detailColour(colour: string): string {
  return luminance(colour) > 0.6 ? "#0f172a" : "#ffffff";
}

/** The icon's drawing (viewBox 0 0 64 64, sits inside the round avatar). */
export function teamIconSvg(icon: TeamIcon): string {
  const c = icon.colour;
  const d = detailColour(c);
  // a soft white edge so dark colours still stand out on the dark blue circle
  const edge = `stroke="rgba(255,255,255,0.85)" stroke-width="1.6" stroke-linejoin="round"`;
  let body = "";
  if (icon.kind === "ball") {
    const stitches = [24, 28, 32, 36, 40].map((y) => `<path d="M29.3 ${y} H34.7"/>`).join("");
    body = `<g transform="rotate(-35 32 32)">
      <ellipse cx="32" cy="32" rx="13.5" ry="21" fill="${c}" ${edge}/>
      <g stroke="${d}" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M32 16.5 V47.5"/>${stitches}</g>
      <path d="M22.5 20 C26 23 38 23 41.5 20 M22.5 44 C26 41 38 41 41.5 44" stroke="${d}" stroke-width="1.4" fill="none" opacity="0.7"/>
    </g>`;
  } else if (icon.kind === "posts") {
    // like the Shield's posts: two uprights and a crossbar, flags on top, padded bases
    const posts = "M22 11 V52 M42 11 V52 M22 34 H42";
    body = `<path d="${posts}" stroke="rgba(255,255,255,0.85)" stroke-width="7.2" stroke-linecap="butt" fill="none"/>
      <path d="${posts}" stroke="${c}" stroke-width="4.4" stroke-linecap="butt" fill="none"/>
      <path d="M22 9.5 L31 12.5 L22 15.5 Z M42 9.5 L51 12.5 L42 15.5 Z" fill="${d}" ${d === "#ffffff" ? "" : edge}/>
      <rect x="17.8" y="40.5" width="8.4" height="13" rx="2.6" fill="${d}"/>
      <rect x="37.8" y="40.5" width="8.4" height="13" rx="2.6" fill="${d}"/>`;
  } else if (icon.kind === "jersey") {
    const n = icon.number ?? 10;
    body = `<path d="M20 14 L27 11 C29 15.5 35 15.5 37 11 L44 14 L55 22.5 L50 31.5 L45 28.5 L45 53 L19 53 L19 28.5 L14 31.5 L9 22.5 Z" fill="${c}" ${edge}/>
      <path d="M27 11 C29 15.5 35 15.5 37 11" stroke="${d}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M14.6 30.4 L9.6 21.7 M49.4 30.4 L54.4 21.7" stroke="${d}" stroke-width="2" fill="none" stroke-linecap="round"/>
      <text x="32" y="${n > 9 ? 45.5 : 46}" text-anchor="middle" font-family="'Arial Black', 'Arial', system-ui, sans-serif" font-weight="900" font-size="${n > 9 ? 17 : 19}" fill="${d}">${n}</text>`;
  } else {
    // boot, side on, toe to the right: laces and studs in white
    const laces = [[28.6, 27.4], [32.2, 29.6], [35.8, 31.5], [39.6, 33.2]]
      .map(([x, y]) => `<path d="M${x - 1.2} ${y + 2.2} L${x + 1.2} ${y - 2.2}"/>`)
      .join("");
    body = `<path d="M13 19 L26 19 C27.5 25 31.5 28.5 39 30.5 L50 33 C56 34.3 58.5 38 57.5 42.5 L11.5 42.5 C10.5 34 11 25 13 19 Z" fill="${c}" ${edge}/>
      <path d="M10.8 42.5 H58 C58 45.6 56 47.2 53 47.2 H14 C12 47.2 10.8 45.6 10.8 42.5 Z" fill="${c}" ${edge}/>
      <path d="M11.5 42.5 H57.5" stroke="${d}" stroke-width="1.4"/>
      <g stroke="${d}" stroke-width="1.9" stroke-linecap="round" fill="none">${laces}</g>
      <path d="M13 23 C16 23.5 19 23.5 22 23" stroke="${d}" stroke-width="1.4" fill="none" opacity="0.8"/>
      <g fill="${d}"><rect x="15" y="47" width="4.4" height="4.6" rx="1.2"/><rect x="22.5" y="47" width="4.4" height="4.6" rx="1.2"/><rect x="39" y="47" width="4.4" height="4.6" rx="1.2"/><rect x="46" y="47" width="4.4" height="4.6" rx="1.2"/><rect x="52.4" y="46.6" width="3.8" height="4.2" rx="1.2"/></g>`;
  }
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}
