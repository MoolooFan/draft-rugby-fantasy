// Run: npx tsx scripts/tests/draft-grades.test.ts — draft grades (lib/draft/grades.ts, Ethan 25 Nov
// 2026): curved within the league, below C- only for a deliberately poor draft, balance and
// boom / bust count, and the coach's reply is checked (lib/coach/draftGrades.ts).
import { GRADES, gradeDraft, gradeFor, playerOutlooks, scoreTeam, type GradePick, type GradePlayer } from "../../lib/draft/grades";
import { cleanBullets } from "../../lib/coach/draftGrades";
import { rosterFits, teamForPick } from "../../lib/draft/rules";
import { STANDARD_SQUAD, rosterSize } from "../../lib/league/squad";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// a pool: 60 of each position, ranked across positions; points a game fall with the rank
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const POS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"];
const players: GradePlayer[] = [];
const history = new Map<string, number[]>();
for (let i = 0; i < 480; i++) {
  const pos = POS[i % 8];
  const p: GradePlayer = { id: `p${i}`, name: `Player ${i}`, posAbbrev: pos, draftRank: i + 1 };
  players.push(p);
  const ppg = 30 - (i / 480) * 24;
  history.set(p.id, Array.from({ length: 10 }, () => Math.max(0, ppg + (rnd() - 0.5) * 12)));
}
const byId = new Map(players.map((p) => [p.id, p]));
const size = rosterSize(STANDARD_SQUAD);
const order = ["A", "B", "C", "D", "E", "F"];

/** a draft where each team picks with its own rule */
function draft(choose: Record<string, (avail: GradePlayer[], roster: GradePlayer[]) => GradePlayer | undefined>): GradePick[] {
  const taken = new Set<string>();
  const rosters = new Map(order.map((t) => [t, [] as GradePlayer[]]));
  const picks: GradePick[] = [];
  for (let n = 1; n <= order.length * size; n++) {
    const t = teamForPick(order, n)!;
    const roster = rosters.get(t)!;
    const avail = players.filter((p) => !taken.has(p.id) && rosterFits([...roster, p], STANDARD_SQUAD));
    const p = (choose[t] ?? choose.default)(avail, roster) ?? avail[0];
    taken.add(p.id);
    roster.push(p);
    picks.push({ pick: n, round: Math.ceil(n / order.length), teamId: t, playerId: p.id });
  }
  return picks;
}
const byRank = (avail: GradePlayer[]) => [...avail].sort((a, b) => (a.draftRank ?? 0) - (b.draftRank ?? 0))[0];
const worst = (avail: GradePlayer[]) => [...avail].sort((a, b) => (b.draftRank ?? 0) - (a.draftRank ?? 0))[0];
const names = new Map(order.map((t) => [t, `Team ${t}`]));
const run = (picks: GradePick[]) => gradeDraft({ order, teamNames: names, picks, players, history, format: STANDARD_SQUAD, size });

// everyone drafts sensibly (by Draft Rank, with some randomness)
const sensible = run(draft({ default: (a) => a[Math.floor(rnd() * Math.min(3, a.length))] }));
const rankOf = (g: string) => GRADES.indexOf(g as never);
check("sensible drafts: nobody below C-", sensible.every((g) => rankOf(g.grade) <= rankOf("C-")), sensible.map((g) => g.grade).join(" "));
check("sensible drafts: the best team gets a B+ or better", sensible.some((g) => rankOf(g.grade) <= rankOf("B+")));
check("ranks 1..6, best score first", sensible.map((g) => g.rank).sort().join() === "1,2,3,4,5,6" && sensible.find((g) => g.rank === 1)!.score >= Math.max(...sensible.map((g) => g.score)) - 1e-9);
check("every team has 2-3 bullet points", sensible.every((g) => g.bullets.length >= 2 && g.bullets.length <= 3), sensible[0].bullets.join(" | "));

check("bullet points are full sentences, not \"Label: ...\"", [...sensible].every((g) => g.bullets.every((b) => !/^[A-Z][a-z ]+:/.test(b) && /[.]$/.test(b))), sensible.flatMap((g) => g.bullets).find((b) => /^[A-Z][a-z ]+:/.test(b)) ?? "");

// team F drafts the worst players on purpose
const tank = run(draft({ default: byRank, F: worst }));
const f = tank.find((g) => g.teamId === "F")!;
check("deliberately drafting the worst players: below C-", rankOf(f.grade) > rankOf("C-"), f.grade);
check("...and the rest are still C- or better", tank.filter((g) => g.teamId !== "F").every((g) => rankOf(g.grade) <= rankOf("C-")), tank.map((g) => g.grade).join(" "));

// the curve: a close league doesn't swing from A+ to C-
check("a very close league: everyone B- to B+", [100, 101, 99, 100.5].every((s) => ["B-", "B", "B+"].includes(gradeFor(s, [100, 101, 99, 100.5], 100))));

// balance: the same points, but stacking the bench with outside backs costs
const outlook = playerOutlooks(players, history);
const balanced = draft({ default: byRank })
  .filter((p) => p.teamId === "A")
  .map((p) => byId.get(p.playerId)!);
const startersOnly = scoreTeam("A", balanced, STANDARD_SQUAD, outlook);
const stackedRoster = [...balanced.filter((p) => startersOnly.starters.includes(p.id)), ...players.filter((p) => p.posAbbrev === "OB" && !balanced.includes(p)).slice(20, 25)];
const stacked = scoreTeam("A", stackedRoster, STANDARD_SQUAD, outlook);
check("balance: 5 outside backs on the bench is flagged and costs", stacked.stacked.some((s) => s.pos === "OB") && stacked.balance < startersOnly.balance, `${startersOnly.balance.toFixed(3)} v ${stacked.balance.toFixed(3)}`);

// boom / bust: an injured starter has no floor
const hurt = balanced.map((p, i) => (i === 0 ? { ...p, unavailable: true } : p));
check("an injured starter lowers the floor (and the score)", scoreTeam("A", hurt, STANDARD_SQUAD, outlook).floor < startersOnly.floor && scoreTeam("A", hurt, STANDARD_SQUAD, outlook).score < startersOnly.score);
// a player with no history is "unknown" with a wide spread
const rookie = playerOutlooks([...players, { id: "new", name: "New", posAbbrev: "OB", draftRank: 10 }], history).get("new")!;
check("no history: leans on the Draft Rank with a wide spread", rookie.games === 0 && rookie.exp > 20 && rookie.sd >= 0.5 * rookie.exp - 1e-9, `${rookie.exp.toFixed(1)} ± ${rookie.sd.toFixed(1)}`);

// the coach's reply
const ids = new Set(["A", "B"]);
const cleaned = cleanBullets({ teams: [
  { team_id: "A", bullets: ["• Steady front row with a reliable floor.", "- Big steal: Player 40 at pick 61.", "Third.", "Fourth point, too many."] },
  { team_id: "B", bullets: ["Only one bullet here."] },
  { team_id: "Z", bullets: ["Not in the league at all.", "Another one."] },
] }, ids);
check("coach reply: bullets tidied, max 3, too-short dropped", cleaned.get("A")?.length === 3 && cleaned.get("A")![0] === "Steady front row with a reliable floor." && cleaned.get("A")![2] === "Fourth point, too many.");
check("coach reply: a team with under 2 bullets keeps its plain ones; unknown teams ignored", !cleaned.has("B") && !cleaned.has("Z"));
check("coach reply: rubbish is ignored", cleanBullets("nope", ids).size === 0 && cleanBullets({ teams: "x" }, ids).size === 0);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
if (failures) process.exit(1);
