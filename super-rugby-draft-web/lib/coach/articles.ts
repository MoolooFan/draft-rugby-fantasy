// lib/coach/articles.ts
// Articles Ethan shares with the AI coach (Ethan, 21 Nov 2026): he pastes a link in Admin → Coach,
// the site reads the article and finds the players and teams it mentions (he can untick or add
// any). If the site can't read it (a paywall, or the site blocks it) it says so and he pastes the
// article's text instead. Each coach note then gets the paragraphs about that player (or his
// team) from active articles.
// The reading and matching here is pure code (tests); fetchArticle runs on the server.

export type ArticleRead = {
  ok: boolean;
  title: string;
  text: string;
  source: string;
  /** why it couldn't be read (or only partly): shown to Ethan, who can paste the text */
  problem: string | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** The article's text body from JSON-LD (most news sites have it), or null. */
function jsonLdBody(html: string): { title?: string; body?: string } | null {
  const blocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const b of blocks) {
    const json = b.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(json);
      const items: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.["@graph"]) ? data["@graph"] : [data];
      for (const it of items) {
        const o = it as Record<string, unknown>;
        if (typeof o?.articleBody === "string" && o.articleBody.length > 200) return { title: typeof o.headline === "string" ? o.headline : undefined, body: o.articleBody };
      }
    } catch {
      /* not valid JSON: skip */
    }
  }
  return null;
}

/** Title and readable text from an article page. */
export function extractArticle(html: string): { title: string; text: string } {
  const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1];
  const ld = jsonLdBody(html);
  const title = clean(ld?.title ?? meta("og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (ld?.body) return { title, text: decodeEntities(ld.body).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() };
  // otherwise the paragraphs (inside <article> if there is one), without scripts / menus
  const stripped = html.replace(/<(script|style|noscript|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ");
  const scope = stripped.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? stripped;
  const paras = (scope.match(/<p[\s>][\s\S]*?<\/p>/gi) ?? []).map(clean).filter((p) => p.length > 40);
  return { title, text: paras.join("\n\n") };
}

const PAYWALL = /(subscribe (now )?to (continue|read)|premium (content|article)|already a subscriber|sign in to (continue|read)|this (article|story) is for subscribers)/i;
export const MIN_ARTICLE_CHARS = 600;

/** What's wrong with what was read, if anything. */
export function articleProblem(text: string, html = ""): string | null {
  if (!text) return "No article text was found on that page.";
  if (text.length < MIN_ARTICLE_CHARS) {
    return PAYWALL.test(html) || PAYWALL.test(text)
      ? "Only the start of the article could be read: it looks like it's behind a paywall."
      : "Only a little text could be read from that page (it may be behind a paywall).";
  }
  return null;
}

/** Only ordinary web addresses (not this computer or a private network). */
export function checkArticleUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^\[?::1\]?$/.test(h)) return null;
  if (/^(127|10|0)\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
  return u;
}

/** Read an article from the web (server). Never throws; problems come back in `problem`. */
export async function fetchArticle(rawUrl: string, timeoutMs = 12000): Promise<ArticleRead> {
  const u = checkArticleUrl(rawUrl);
  if (!u) return { ok: false, title: "", text: "", source: "", problem: "That doesn't look like a web link (it should start with https://)." };
  const source = u.hostname.replace(/^www\./, "");
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DraftRugbyCoach/1.0)", Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return { ok: false, title: "", text: "", source, problem: `The site wouldn't let the article be read (error ${res.status}).` };
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(type)) return { ok: false, title: "", text: "", source, problem: "That link isn't a web page (it may be a PDF or a video)." };
    const html = (await res.text()).slice(0, 3_000_000);
    const { title, text } = extractArticle(html);
    const problem = articleProblem(text, html);
    return { ok: !problem, title, text, source, problem };
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
    return { ok: false, title: "", text: "", source, problem: timedOut ? "The site took too long to answer." : "The site couldn't be reached." };
  }
}

// ---------------------------------------------------------------------------
// Who an article is about

export const TEAM_NAMES: Record<string, string[]> = {
  BLU: ["Blues"],
  BRU: ["Brumbies"],
  CHI: ["Chiefs"],
  CRU: ["Crusaders"],
  DRU: ["Fijian Drua", "Drua"],
  FOR: ["Western Force", "Force"],
  HIG: ["Highlanders"],
  HUR: ["Hurricanes", "Canes"],
  MOA: ["Moana Pasifika"],
  RED: ["Queensland Reds", "Reds"],
  WAR: ["Waratahs", "Tahs"],
};

/** Lower case, no accents or punctuation (so "Fainga'anuku" matches "Faingaanuku"). */
export const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'`-]/g, "").toLowerCase();
const has = (hay: string, needle: string) => new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(hay);

type NamedPlayer = { id: string; firstName: string; lastName: string; teamCode: string };

/** Teams named in the text (case matters: "the Blues" yes, "the blues" no). */
export function findTeams(text: string): string[] {
  return Object.entries(TEAM_NAMES)
    .filter(([, names]) => names.some((n) => new RegExp(`(^|[^A-Za-z])${n}([^A-Za-z]|$)`).test(text)))
    .map(([code]) => code);
}

/**
 * Players named in the text: by full name, or by surname alone when no one else in the pool has
 * that surname and his team is mentioned too (articles often say "Barrett" after the first time).
 */
export function findPlayers<T extends NamedPlayer>(text: string, players: T[]): T[] {
  const hay = fold(text);
  const teams = new Set(findTeams(text));
  const surnameCount = new Map<string, number>();
  for (const p of players) surnameCount.set(fold(p.lastName), (surnameCount.get(fold(p.lastName)) ?? 0) + 1);
  return players.filter((p) => {
    const last = fold(p.lastName);
    if (!last) return false;
    if (has(hay, `${fold(p.firstName)} ${last}`)) return true;
    return last.length >= 5 && surnameCount.get(last) === 1 && teams.has(p.teamCode) && has(hay, last);
  });
}

/** The paragraphs that mention any of these names (else the start), at most `max` characters. */
export function articleExcerpt(text: string, names: string[], max = 1500): string {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const keys = names.map(fold).filter((n) => n.length >= 3);
  const hits = paras.filter((p) => keys.some((k) => has(fold(p), k)));
  const chosen = hits.length ? hits : paras.slice(0, 3);
  let out = "";
  for (const p of chosen) {
    if (out.length + p.length + 2 > max) {
      if (!out) out = p.slice(0, max - 1) + "…";
      break;
    }
    out += (out ? "\n\n" : "") + p;
  }
  return out;
}
