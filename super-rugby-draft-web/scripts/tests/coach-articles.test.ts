// Run: npx tsx scripts/tests/coach-articles.test.ts — articles shared with the AI coach
// (lib/coach/articles.ts): reading the text from a page, spotting a paywall, who it's about,
// the paragraphs about a player, and only ordinary web links.
import { articleExcerpt, articleProblem, checkArticleUrl, extractArticle, findPlayers, findTeams, MIN_ARTICLE_CHARS } from "../../lib/coach/articles";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const para = (s: string) => `<p>${s}</p>`;
const long = "The Chiefs coach confirmed the side for Saturday's game at FMG Stadium Waikato in front of a sell-out crowd. ";

// --- reading pages
const ldPage = `<html><head><title>Ignore me</title><script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [{ "@type": "WebPage" }, { "@type": "NewsArticle", headline: "McKenzie back at 10 for the Chiefs", articleBody: "Damian McKenzie returns at first five &amp; will kick.\n\n" + long.repeat(4) }],
})}</script></head><body><p>menu stuff that is long enough to count as a paragraph here</p></body></html>`;
const a = extractArticle(ldPage);
check("JSON-LD: headline and body", a.title === "McKenzie back at 10 for the Chiefs" && a.text.startsWith("Damian McKenzie returns at first five & will kick."), a.title);

const pPage = `<html><head><meta property="og:title" content="Reds name side &amp; bench"></head><body><nav><p>Home · Sport · Rugby · Super Rugby · More links here</p></nav>
<article>${para("Harry Wilson will captain the Queensland Reds against the Waratahs on Friday night.")}${para("Short.")}${para(long)}</article>
<script>var p = "<p>not this one either, it is inside a script tag</p>";</script></body></html>`;
const b = extractArticle(pPage);
check("paragraphs: og:title, inside <article>, no menus / scripts / short bits", b.title === "Reds name side & bench" && b.text.split("\n\n").length === 2 && b.text.startsWith("Harry Wilson"), JSON.stringify(b));

check("paywall: a short teaser behind 'subscribe to continue' is flagged", /paywall/.test(articleProblem("Teaser only.", "<div>Subscribe now to continue reading</div>") ?? ""));
check("problem: nothing read", !!articleProblem(""));
check("no problem: a full article", articleProblem("x".repeat(MIN_ARTICLE_CHARS + 1)) === null);

// --- links
check("links: https news site ok", !!checkArticleUrl("https://www.rugbypass.com/news/some-story/"));
check("links: not this computer / private networks / other kinds", ["http://localhost:3000/api", "http://127.0.0.1/", "http://192.168.1.5/", "http://10.0.0.1/x", "file:///c:/x", "ftp://x.com/a", "not a link"].every((u) => !checkArticleUrl(u)));

// --- who it's about
const pool = [
  { id: "dm", firstName: "Damian", lastName: "McKenzie", teamCode: "CHI" },
  { id: "lf", firstName: "Leicester", lastName: "Fainga'anuku", teamCode: "CRU" },
  { id: "bb", firstName: "Beauden", lastName: "Barrett", teamCode: "BLU" },
  { id: "jb", firstName: "Jordie", lastName: "Barrett", teamCode: "HUR" },
  { id: "ss", firstName: "Sevu", lastName: "Reece", teamCode: "CRU" },
  { id: "hw", firstName: "Harry", lastName: "Wilson", teamCode: "RED" },
  { id: "tc", firstName: "Tupou", lastName: "Vaa'i", teamCode: "CHI" },
];
const text = "Damian McKenzie starts for the Chiefs. Leicester Faingaanuku is out for the Crusaders, and Reece will play on the wing. Barrett was named too. Wilson trained well.";
const found = findPlayers(text, pool).map((p) => p.id).sort();
check("players: full names (accents / apostrophes ignored), a unique surname with his team named", JSON.stringify(found) === JSON.stringify(["dm", "lf", "ss"]), JSON.stringify(found));
check("players: a shared surname alone (Barrett) and a team not named (Reds) don't count", !found.includes("bb") && !found.includes("jb") && !found.includes("hw"));
check("teams: named teams, case matters", JSON.stringify(findTeams("The Chiefs beat the Crusaders; the blues of the sky; Fijian Drua next")) === JSON.stringify(["CHI", "CRU", "DRU"]));

// --- the paragraphs for a player
const article = ["The Crusaders made five changes.", "Sevu Reece returns on the right wing after his hamstring injury.", "The forwards are unchanged.", "Reece has scored 40 tries for the club."].join("\n\n");
const ex = articleExcerpt(article, ["Sevu Reece", "Reece"]);
check("excerpt: only the paragraphs about him", ex === "Sevu Reece returns on the right wing after his hamstring injury.\n\nReece has scored 40 tries for the club.", JSON.stringify(ex));
check("excerpt: nobody named -> the start", articleExcerpt(article, ["Nobody Here"]).startsWith("The Crusaders made five changes."));
check("excerpt: capped", articleExcerpt("Reece " + "a".repeat(3000), ["Reece"], 500).length <= 500);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
if (failures) process.exit(1);
