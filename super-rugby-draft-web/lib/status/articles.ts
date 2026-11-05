// lib/status/articles.ts
// Reads the official Super Rugby Pacific articles released every Wednesday (4pm NZT):
//   - "Teams: Round N"       -> each team's starting XV (1-15) and replacements
//   - "Injury List: Round N" -> each team's injured / unavailable players
// Pure code: takes the article's HTML, returns team -> names. Matching names to players is in
// lib/status/match.ts.

export type TeamList = { team: string; starting: string[]; replacements: string[] };
export type InjuryEntry = { name: string; injury: string | null; timeframe: string | null };
export type InjuryList = { team: string; players: InjuryEntry[] };

/** Super Rugby team (as the articles write it) -> the site's team code. */
const TEAM_WORDS: Array<[RegExp, string]> = [
  [/blues/i, "BLU"],
  [/brumbies/i, "BRU"],
  [/chiefs/i, "CHI"],
  [/crusaders/i, "CRU"],
  [/drua/i, "DRU"],
  [/force/i, "FOR"],
  [/highlanders/i, "HIG"],
  [/hurricanes/i, "HUR"],
  [/moana/i, "MOA"],
  [/reds/i, "RED"],
  [/waratahs/i, "WAR"],
];
export function teamCodeFromName(name: string): string | null {
  return TEAM_WORDS.find(([re]) => re.test(name))?.[1] ?? null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", quot: '"', apos: "'",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", amacr: "ā", emacr: "ē", imacr: "ī", omacr: "ō", umacr: "ū",
};
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .trim();
}

/** "Ryan Lonergan (c)" -> "Ryan Lonergan" */
function cleanName(s: string): string {
  return s.replace(/\((?:c|vc|co-c|cc|captain|vice-captain)\)/gi, "").replace(/\s+/g, " ").trim();
}

/** Starting XVs and replacements from a "Teams: Round N" article. */
export function parseTeamLists(html: string): TeamList[] {
  const paras = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => htmlToText(m[1]));
  const out: TeamList[] = [];
  for (let i = 0; i < paras.length; i++) {
    const m = paras[i].match(/^([\s\S]+?)\s*\(1\s*-\s*15\)\s*:?\s*([\s\S]*)$/);
    if (!m) continue;
    const team = teamCodeFromName(m[1]);
    if (!team) continue;
    const starting = m[2].split(",").map(cleanName).filter(Boolean);
    let replacements: string[] = [];
    const next = paras[i + 1] ?? "";
    const r = next.match(/^replacements\s*:?\s*([\s\S]*)$/i);
    if (r) replacements = r[1].split(",").map(cleanName).filter(Boolean);
    out.push({ team, starting, replacements });
  }
  return out;
}

/** "Cameron Christie (knee, season)" -> name, injury "knee", timeframe "season" */
function parseInjuryLine(line: string): InjuryEntry | null {
  const m = line.match(/^(.+?)\s*(?:\((.*)\))?\s*$/);
  if (!m) return null;
  const name = cleanName(m[1]);
  if (!name) return null;
  const parts = (m[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { name, injury: parts[0] ?? null, timeframe: parts.slice(1).join(", ") || null };
}

/** Injured / unavailable players from an "Injury List: Round N" article. */
export function parseInjuryList(html: string): InjuryList[] {
  const out: InjuryList[] = [];
  // Each team: a heading with the team name, then a bulleted list.
  // (the heading text may not contain another heading, so a title heading just above the first
  // team doesn't swallow it)
  const re = /<h[2-4]\b[^>]*>((?:(?!<\/?h[1-6]\b)[\s\S])*?)<\/h[2-4]>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/gi;
  for (const m of html.matchAll(re)) {
    const heading = htmlToText(m[1]);
    const team = teamCodeFromName(heading);
    if (!team || heading.length > 40) continue;
    const players = [...m[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((li) => parseInjuryLine(htmlToText(li[1])))
      .filter((x): x is InjuryEntry => !!x);
    out.push({ team, players });
  }
  return out;
}

/** How an injury shows as a status, like the 2026 sheet: "Knee - Season", "Concussion", "Out". */
export function injuryStatus(e: InjuryEntry): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (!e.injury) return "Out";
  return e.timeframe ? `${cap(e.injury)} - ${cap(e.timeframe)}` : cap(e.injury);
}

const ROUND_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen"];

/**
 * Likely web addresses of a round's two articles (the site isn't consistent: "round-7",
 * "round-one", "injury-unavailability-list"...). The reader tries each until one exists.
 */
export function candidateArticleUrls(season: number, realRound: number): { teams: string[]; injuries: string[] } {
  const base = "https://super.rugby/superrugby/news/";
  const rounds = [String(realRound), ROUND_WORDS[realRound]].filter(Boolean);
  const teams = rounds.flatMap((r) => [`${base}${season}-super-rugby-pacific-teams-round-${r}/`]);
  const injuries = rounds.flatMap((r) => [
    `${base}${season}-super-rugby-pacific-injury-list-round-${r}/`,
    `${base}${season}-super-rugby-pacific-injury-unavailability-list-round-${r}/`,
    `${base}${season}-super-rugby-pacific-injuryunavailability-list-round-${r}/`,
  ]);
  return { teams, injuries };
}
