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

/** "Cameron Christie (knee/season)" -> name + the bracket text, standardised below. */
function parseInjuryLine(line: string): InjuryEntry | null {
  const m = line.match(/^(.+?)\s*(?:\((.*)\))?\s*$/);
  if (!m) return null;
  const name = cleanName(m[1]);
  if (!name) return null;
  const { injury, timeframe } = splitInjury(m[2] ?? "");
  return { name, injury, timeframe };
}

// Teams write injuries many ways: "knee/season", "knee, season", "Hamstring/ 6-8 weeks",
// "concussion 1-2 weeks", "ankle/Rd 12", "HIA", "head knock", even typos ("nkle", "food").
// Everything is turned into one shape: "Injury - Timeframe" (e.g. "Hamstring - 6-8 weeks").

const INJURY_WORDS: Array<[RegExp, string]> = [
  [/^(hia|hia protocols?|head knock|head injury|concussion)$/i, "Concussion"],
  [/^(rest|rested|all rested|resting policy|rest policy)$/i, "Rested"],
  [/^(paternity leave|birth of (first |second |third )?child)$/i, "Paternity leave"],
  [/^compassionate( grounds| leave)?$/i, "Compassionate leave"],
  [/^nkle$/i, "Ankle"],
  [/^food$/i, "Foot"],
  [/^cork(ed)?( thigh)?$/i, "Corked thigh"],
  [/^hands$/i, "Hand"],
  [/^(\w+) (tightness|strain|contusion|soreness)$/i, "$1"],
  [/^acl$/i, "ACL"],
  [/^sc joint$/i, "SC joint"],
];

function standardInjuryWord(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  for (const [re, out] of INJURY_WORDS) if (re.test(s)) return s.replace(re, out).replace(/^\w/, (c) => c.toUpperCase());
  if (/^[A-Z]{2,4}$/.test(s)) return s; // other abbreviations, as written
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const ROUND_WORD = /\b(?:rd|rnd|round)s?\.?\s*/gi;

function standardTimeframe(raw: string): string {
  let s = raw.trim().replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").toLowerCase();
  if (!s || /^(tbc|tba|unknown|rtp protocols?|return to play protocols?)$/.test(s)) return "TBC";
  if (/^(season|rest of (the )?season|season-ending|out for (the )?season)$/.test(s)) return "Season";
  if (/^(short|medium|long)[ -]term$/.test(s)) return s.charAt(0).toUpperCase() + s.slice(1).replace("-", " ");
  s = s.replace(/(\d)\s*-\s*(\d)/g, "$1-$2");
  // weeks / days: "4weeks", "1 weeks", "1-2 week", "min 12 days"
  const wk = s.match(/^(?:min(?:imum)?\.?\s*)?(\d+(?:-\d+)?)\s*(week|day)s?$/);
  if (wk) {
    const min = /^min/.test(s) ? "+" : "";
    const plural = wk[1] === "1" && !min ? "" : "s";
    return `${wk[1]}${min} ${wk[2]}${plural}`;
  }
  // rounds: "rd 8", "rnd 8-10", "round 16-finals", "round 16/quarter-finals"
  if (/^(rd|rnd|round)/.test(s)) {
    const rest = s.replace(ROUND_WORD, "").replace(/\//g, "-").replace(/quarter[- ]?finals?/g, "quarter-finals").replace(/semi[- ]?finals?/g, "semi-finals");
    const range = /\d+-\d+|-(finals|quarter-finals|semi-finals)/.test(rest);
    return `${range ? "Rounds" : "Round"} ${rest.replace(/-(finals|quarter-finals|semi-finals)/, (m) => m.replace(/\b\w/g, (c) => c.toUpperCase()))}`;
  }
  if (/^(quarter|semi)[- ]?finals?$/.test(s)) return s.startsWith("quarter") ? "Quarter-finals" : "Semi-finals";
  if (/^(grand )?final$/.test(s)) return "Final";
  // free text about coming back ("integrating back into team units this week")
  if (/integrat|return|back in|back into|available|this week|next week/.test(s)) return "Returning";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Split the bracket text into injury + timeframe, however the team wrote it. */
export function splitInjury(inner: string): { injury: string | null; timeframe: string | null } {
  const s = inner.trim();
  if (!s) return { injury: null, timeframe: null };
  // "knee/season", "knee, season", "foot - back in training this week"
  let m = s.match(/^([^/,]+?)\s*(?:\/|,|\s-\s)\s*(.+)$/);
  // "concussion 1-2 weeks", "knee season"
  if (!m) m = s.match(/^(.+?)\s+((?:min(?:imum)?\.?\s*)?\d[\d\s-]*\s*(?:weeks?|days?)|season|tbc|(?:rd|rnd|round)s?\.?\s*\d.*)$/i);
  if (m) return { injury: standardInjuryWord(m[1]), timeframe: standardTimeframe(m[2]) };
  return { injury: standardInjuryWord(s), timeframe: null };
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

/** The status shown for an injury, always "Injury - Timeframe" (e.g. "Knee - Season", "Knee - TBC"), or "Out" if no reason is given. */
export function injuryStatus(e: InjuryEntry): string {
  if (!e.injury) return "Out";
  return `${e.injury} - ${e.timeframe ?? "TBC"}`;
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
