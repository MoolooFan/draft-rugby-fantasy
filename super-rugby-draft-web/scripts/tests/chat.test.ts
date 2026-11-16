// Run: npx tsx scripts/tests/chat.test.ts — chat conversations and automated posts (lib/chat/common.ts).
import {
  canUseChannel, dmChannel, dmTeams, freeAgentReportText, leagueRecapText, muteKeyFor, shieldReportText,
  tradeText, waiverReportText,
} from "../../lib/chat/common";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// conversations
check("a DM is the same whichever team starts it", dmChannel("b", "a") === dmChannel("a", "b") && dmChannel("a", "b") === "dm:a:b");
check("DM teams read back", JSON.stringify(dmTeams("dm:a:b")) === '["a","b"]' && dmTeams("league") === null);
const teams = ["a", "b", "c"];
check("everyone can use the league chat", canUseChannel("league", "c", teams));
check("only the two teams can read their DM", canUseChannel("dm:a:b", "a", teams) && !canUseChannel("dm:a:b", "c", teams));
check("no DM with a team outside the league, or with yourself", !canUseChannel("dm:a:z", "a", teams) && !canUseChannel("dm:a:a", "a", teams));

// muting
check("mute: DMs / league chat / automated posts", muteKeyFor({ channel: "dm:a:b", kind: "text", sender_team_id: "a" }) === "chat_dm"
  && muteKeyFor({ channel: "league", kind: "text", sender_team_id: "a" }) === "chat_league"
  && muteKeyFor({ channel: "league", kind: "system", sender_team_id: null }) === "chat_auto");

// automated posts
check("no waiver report when nothing went through", waiverReportText("Round 3", []) === null);
const w = waiverReportText("Round 3", [{ teamName: "Josh", added: "Will Jordan", dropped: "Sam Cane" }])!;
check("waiver report lists each move", w.includes("Round 3") && w.includes("Josh: +Will Jordan (−Sam Cane)"), w);
const fa = freeAgentReportText("Round 3", [{ teamName: "Noah", added: null, dropped: "Aaron Smith" }])!;
check("free agent report includes plain drops", fa.includes("Noah: −Aaron Smith (dropped)"), fa);
check("trade post", tradeText({ teamName: "A", gets: ["X"] }, { teamName: "B", gets: ["Y", "Z"] }) === "Trade done: A get X; B get Y, Z.");
const r = leagueRecapText({ roundName: "Round 4", games: [{ home: "A", away: "B", homeScore: 500, awayScore: 450 }, { home: "C", away: null, homeScore: null, awayScore: null }], crown: { teams: ["A"], score: 500 } });
check("league recap: results, byes, crown", r.includes("A 500 – 450 B") && r.includes("C: bye") && r.includes("Top score: A (500)"), r);
check("shield report: kept", shieldReportText("The Shield", { kind: "defended", holder: "A", other: "B", homeScore: 500, awayScore: 480, defences: 3 }).includes("keep The Shield"));
check("shield report: taken", shieldReportText("The Shield", { kind: "won", holder: "B", other: "A", homeScore: 450, awayScore: 480, defences: 0 }).includes("take The Shield off A"));

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
