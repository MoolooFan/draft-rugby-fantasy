// Run: npx tsx scripts/tests/season-recap.test.ts — the season recap (lib/league/seasonRecap.ts).
import { buildSeasonRecap, type SeasonMatchup, type SeasonWeekResult } from "../../lib/league/seasonRecap";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// 4 teams, 9 regular weeks (each pair 3 times), then a grand final. "me" starts badly, then wins
// every game from week 4 on.
const teams = ["me", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));
const pairs: Array<[string, string, string, string]> = [["me", "b", "c", "d"], ["me", "c", "b", "d"], ["me", "d", "b", "c"]];
const matchups: SeasonMatchup[] = [];
const results: SeasonWeekResult[] = [];
for (let w = 1; w <= 9; w++) {
  const [a, b, c, d] = pairs[(w - 1) % 3];
  for (const [h, x] of [[a, b], [c, d]]) {
    const meIn = h === "me" || x === "me";
    const hs = meIn ? (w <= 3 ? 300 : 500) : 400 + w;
    const as = meIn ? 400 : 390;
    matchups.push({ kind: "regular", status: "final", weeks: [w], label: null, home_team_id: h, away_team_id: x, home_score: hs, away_score: as, playoff_key: null, decides: null, winner_team_id: hs > as ? h : x });
    for (const [t, sc] of [[h, hs], [x, as]] as Array<[string, number]>) {
      // me: "star" added in week 4 scores big; "bust" (round 1 pick) scores little; "late" (round 8 pick) scores well
      const pts: Record<string, number> = t === "me"
        ? { bust: 5, late: 60, ...(w >= 4 ? { star: 100 } : {}), filler1: 30, filler2: 28, filler3: 25 }
        : { [`${t}p`]: 40 };
      results.push({ week: w, team_id: t, score: sc, player_points: pts });
    }
  }
}
matchups.push({ kind: "finals", status: "final", weeks: [10], label: "Grand Final", home_team_id: "me", away_team_id: "c", home_score: 600, away_score: 500, playoff_key: "GF", decides: "champion", winner_team_id: "me" });
const picks = [
  { team_id: "me", player_id: "bust", pick_number: 1 },
  { team_id: "me", player_id: "filler1", pick_number: 8 },
  { team_id: "me", player_id: "filler2", pick_number: 9 },
  { team_id: "me", player_id: "late", pick_number: 29 },
  { team_id: "me", player_id: "filler3", pick_number: 16 },
];
const r = buildSeasonRecap({ season: 2027, myTeamId: "me", teams, matchups, results, picks, playerName: (id) => id });

check("your season: champion", r.you.honour === "champion");
check("record: lost 3, then won 6", r.you.wins === 6 && r.you.losses === 3, `${r.you.wins}-${r.you.losses}`);
check("top player: the in-season pickup", r.topPlayers[0]?.id === "star", JSON.stringify(r.topPlayers));
check("story: pickup who became a star", r.stories.some((s) => s.kind === "pickup" && s.text.includes("star") && s.text.includes("round 4")));
check("story: late draft steal", r.stories.some((s) => s.kind === "steal" && s.text.includes("late")));
check("story: early draft bust", r.stories.some((s) => s.kind === "bust" && s.text.includes("bust")));
check("story: comeback up the ladder", r.stories.some((s) => s.kind === "comeback"), JSON.stringify(r.stories.map((s) => s.kind)));
check("story: 6-game winning streak", r.stories.some((s) => s.kind === "streak" && s.text.includes("6")));
check("league roundup: champion is me", r.league.champion === "me");
check("best single game: the pickup's 100", r.bestGame?.points === 100);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
