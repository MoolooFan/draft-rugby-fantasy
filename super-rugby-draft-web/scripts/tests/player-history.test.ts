// Run: npx tsx scripts/tests/player-history.test.ts — player card Transactions tab (C3).
import { playerHistory } from "../../lib/league/playerHistory";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const P = "T.Tele'a";
const ev = playerHistory(P, {
  picks: [{ team_id: "A", pick_number: 14, round: 2, created_at: "2027-02-01T08:00:00Z" }],
  transfers: [
    { team_id: "A", add_player_id: "X.Other", drop_player_id: P, status: "PROCESSED", created_at_ms: Date.parse("2027-03-01T00:00:00Z") },
    { team_id: "B", add_player_id: P, drop_player_id: "Y.Other", status: "PROCESSED", created_at_ms: Date.parse("2027-03-05T00:00:00Z") },
    { team_id: "C", add_player_id: P, drop_player_id: null, status: "FAILED", created_at_ms: Date.parse("2027-03-06T00:00:00Z") },
    { team_id: "B", add_player_id: null, drop_player_id: P, status: "PROCESSED", created_at_ms: Date.parse("2027-04-01T00:00:00Z") },
  ],
  claims: [
    { team_id: "D", add_player_id: P, drop_player_id: "Z.Other", status: "PROCESSED", processed_at_ms: Date.parse("2027-04-03T00:00:00Z"), updated_at_ms: null },
    { team_id: "C", add_player_id: P, drop_player_id: null, status: "FAILED", processed_at_ms: Date.parse("2027-04-03T00:00:00Z"), updated_at_ms: null },
  ],
  trades: [
    { from_team_id: "E", to_team_id: "D", offer_player_ids: ["Q.Q"], request_player_ids: [P], status: "accepted", updated_at: "2027-04-10T00:00:00Z" },
    { from_team_id: "D", to_team_id: "E", offer_player_ids: [P], request_player_ids: [], status: "declined", updated_at: "2027-04-09T00:00:00Z" },
  ],
});

check("newest first, failed / declined moves left out", JSON.stringify(ev.map((e) => e.kind)) === '["traded","claimed","dropped","added","dropped","drafted"]', JSON.stringify(ev.map((e) => e.kind)));
check("traded: requested player goes from D to E", ev[0].kind === "traded" && ev[0].fromTeamId === "D" && ev[0].toTeamId === "E");
check("claimed on waivers with the drop", ev[1].kind === "claimed" && ev[1].teamId === "D" && ev[1].droppedId === "Z.Other");
check("drop with no add (IR activation) listed", ev[2].kind === "dropped" && ev[2].teamId === "B" && ev[2].forId === null);
check("free agent add with the drop", ev[3].kind === "added" && ev[3].teamId === "B" && ev[3].droppedId === "Y.Other");
check("dropped for another player", ev[4].kind === "dropped" && ev[4].forId === "X.Other");
check("drafted round and pick", ev[5].kind === "drafted" && ev[5].round === 2 && ev[5].pick === 14);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
