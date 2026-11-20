// Run: npx tsx scripts/tests/game-status.test.ts — each game's points status and when its stats
// are pulled (lib/stats/gameStatus.ts).
import { gameFinalRunAtMs, gameStatus, gameSyncDue } from "../../lib/stats/gameStatus";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const H = 3600_000;
const k = Date.UTC(2027, 1, 13, 6, 5);

check("before kickoff: not started", gameStatus(k, k - 1, false) === "not_started");
check("at kickoff: live", gameStatus(k, k, false) === "live");
check("2h59 in: live", gameStatus(k, k + 2.98 * H, false) === "live");
check("3h after: complete", gameStatus(k, k + 3 * H, false) === "complete");
check("a day later without its last run: still complete", gameStatus(k, k + 24 * H, false) === "complete");
check("last run recorded: finalised", gameStatus(k, k + 14 * H, true) === "finalised");

check("no stats before kickoff", gameSyncDue(k, k - 1, false, true) === null);
check("live: every run", gameSyncDue(k, k + H, false, false) === "live");
check("finished: only on the hour", gameSyncDue(k, k + 5 * H, false, false) === null && gameSyncDue(k, k + 5 * H, false, true) === "hourly");
check("13.5h after kickoff: the last run", gameSyncDue(k, gameFinalRunAtMs(k), false, false) === "final");
check("after the last run: never again", gameSyncDue(k, k + 20 * H, true, true) === null);

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
