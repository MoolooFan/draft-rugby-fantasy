// Run: npx tsx scripts/tests/push.test.ts — push notification wording and settings
// (lib/notifications). Sending itself was tested end to end on 26 Nov 2026 (Edge, Microsoft's
// push service): delivered, and not sent when the type is switched off.
import { lineupReminderText, LINEUP_REMINDER_MS, DRAFT_REMINDER_MS } from "../../lib/notifications/reminders";
import { withDefaults } from "../../lib/notifications/types";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const fine = lineupReminderText("Round 9", "Epstein Try League", 2, null);
check("lineup fine", fine.title === "Round 9: team selection closes soon" && fine.body === "Team selection closes in 2 hours (Epstein Try League).", JSON.stringify(fine));
const bad = lineupReminderText("Round 10/11", "L", 1, "1 starter isn't playing");
check("lineup problem first", bad.title === "Round 10/11: check your lineup" && bad.body === "1 starter isn't playing. Team selection closes in an hour (L).", JSON.stringify(bad));
check("reminder times (agreed): lineup 2 h, draft 30 min", LINEUP_REMINDER_MS === 2 * 3600_000 && DRAFT_REMINDER_MS === 30 * 60_000);

const s = withDefaults({ trade_offer: false, chat_dm: "nonsense" });
check("settings: off stays off, anything else on", s.trade_offer === false && s.chat_dm === true && s.lineup_reminder === true && s.draft_soon === true);
check("settings: nothing saved = all on", Object.values(withDefaults(null)).every(Boolean));

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
