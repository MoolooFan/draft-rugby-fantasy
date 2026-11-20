// Run: npx tsx scripts/tests/fantasy-feed.test.ts — late team changes from the official fantasy
// game (lib/status/fantasyFeed.ts) and the saved starting / bench record (lib/status/roles.ts).
import { feedRole, planTeamChanges, type FeedEntry, type OurStatus } from "../../lib/status/fantasyFeed";
import { savedRoleStatus } from "../../lib/status/roles";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// --- the feed's words
check("not-selected is not playing", feedRole("not-selected") === "none");
check("injured / eliminated are not playing", feedRole("injured") === "none" && feedRole("eliminated") === "none");
check("bench is bench", feedRole("bench") === "bench" && feedRole("Benched") === "bench");
check("available (Selected to play) is starting", feedRole("available") === "starting" && feedRole("selected") === "starting");
check("an unknown word isn't guessed", feedRole("mystery") === null && feedRole("") === null);

// --- a team: s1..s15 named to start (#1-15), b16..b23 on the bench (#16-23), x a squad player
const ours = new Map<string, OurStatus>();
for (let i = 1; i <= 15; i++) ours.set(`s${i}`, { status: `Starting - #${i}`, source: "team-list" });
for (let i = 16; i <= 23; i++) ours.set(`b${i}`, { status: `Bench - #${i}`, source: "team-list" });
const feedFrom = (start: string[], bench: string[], out: string[] = []): FeedEntry[] => [
  ...start.map((id) => ({ playerId: id, name: id, role: "starting" as const })),
  ...bench.map((id) => ({ playerId: id, name: id, role: "bench" as const })),
  ...out.map((id) => ({ playerId: id, name: id, role: "none" as const })),
];
const S = Array.from({ length: 15 }, (_, i) => `s${i + 1}`);
const B = Array.from({ length: 8 }, (_, i) => `b${i + 16}`);

{
  const plan = planTeamChanges(feedFrom(S, B, ["x"]), ours);
  check("same as the team list: nothing changes", plan.ready && plan.changes.length === 0, JSON.stringify(plan.changes));
}
{
  // s12 pulls out; b23 moves up to the XV; x comes onto the bench
  const plan = planTeamChanges(feedFrom([...S.filter((id) => id !== "s12"), "b23"], [...B.filter((id) => id !== "b23"), "x"], ["s12"]), ours);
  const byId = new Map(plan.changes.map((c) => [c.playerId, c]));
  const up = byId.get("b23");
  const late = byId.get("x");
  check("late swap: the replacement starts in the withdrawn starter's jersey", up?.kind === "set" && up.status === "Starting - #12", JSON.stringify(up));
  check("late swap: the new bench player takes the free bench jersey", late?.kind === "set" && late.status === "Bench - #23", JSON.stringify(late));
  check("late swap: the withdrawn starter is taken off", byId.get("s12")?.kind === "clear");
  check("late swap: three changes", plan.changes.length === 3, String(plan.changes.length));
}
{
  // a half-updated feed (only 10 starters) changes nothing
  const plan = planTeamChanges(feedFrom(S.slice(0, 10), B), ours);
  check("an incomplete feed changes nothing", !plan.ready && plan.changes.length === 0);
}
{
  // a player the fantasy game doesn't have stays as he is
  const plan = planTeamChanges(feedFrom([...S.filter((id) => id !== "s5"), "x"], B), ours);
  check("a player missing from the feed isn't taken off", !plan.changes.some((c) => c.playerId === "s5"));
  const x = plan.changes.find((c) => c.playerId === "x");
  check("no clear one-for-one swap: no jersey guessed", x?.kind === "set" && x.status === "Starting", JSON.stringify(x));
}
{
  // Ethan's own status wins
  const mine = new Map(ours);
  mine.set("s3", { status: "Starting - #3", source: "manual" });
  const plan = planTeamChanges(feedFrom([...S.filter((id) => id !== "s3"), "b16"], [...B.filter((id) => id !== "b16")], ["s3"]), mine);
  check("a manual status isn't changed", !plan.changes.some((c) => c.playerId === "s3"));
}
{
  // a name that doesn't match anyone
  const feed = feedFrom(S.slice(0, 14), B);
  feed.push({ playerId: null, name: "New Guy", role: "starting" });
  const plan = planTeamChanges(feed, ours);
  check("an unmatched name is reported", plan.unmatched.length === 1 && plan.unmatched[0].name === "New Guy");
}
{
  // an injured player (status from the injury list) named to start late
  const inj = new Map(ours);
  inj.delete("s7");
  inj.set("x", { status: "Knee - TBC", source: "injury-list" });
  const plan = planTeamChanges(feedFrom([...S.filter((id) => id !== "s7"), "x"], B, ["s7"]), inj);
  check("a player back from injury named late is set to start", plan.changes.some((c) => c.playerId === "x" && c.kind === "set" && c.status.startsWith("Starting")));
}

// --- the saved record's status text
check("saved role with a jersey", savedRoleStatus({ role: "starting", jersey: 12 }) === "Starting - #12");
check("saved bench role without a jersey", savedRoleStatus({ role: "bench", jersey: null }) === "Bench");

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
