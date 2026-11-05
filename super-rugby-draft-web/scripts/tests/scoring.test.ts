// Run: npx tsx scripts/tests/scoring.test.ts — Standard and Alternate scoring, worked by hand.
import { ALTERNATE_SCORING, STANDARD_SCORING, completeRules, isFrontRow, playerPoints, pointsBreakdown, type StatCounts } from "../../lib/scoring";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const prop = { posAbbrev: "PR" };
const hooker = { posAbbrev: "HO" };
// 60 minutes, 1 try, 1 try assist, 1 line break, 3 defenders beaten, 23 m, 2 offloads,
// 10 tackles, 1 missed tackle, 1 penalty conceded, 2 scrums won
const counts: StatCounts = {
  minutesPlayed: 60, tries: 1, tryAssists: 1, lineBreaks: 1, defendersBeaten: 3, metresGained: 23,
  offloads: 2, tackles: 10, tacklesMissed: 1, penaltiesConceded: 1, scrumsWon: 2,
};

// Alternate: 2 (60 min) + 7 + 4 + 3.5 + 3.6 + 0.8 (4 x 5 m) + 1.6 + 5 - 1 - 2.5 + 5 (2 scrums, prop) = 29
const altProp = playerPoints(counts, isFrontRow(prop, ALTERNATE_SCORING), ALTERNATE_SCORING);
check("Alternate, prop: 29", altProp === 29, String(altProp));
const altHooker = playerPoints(counts, isFrontRow(hooker, ALTERNATE_SCORING), ALTERNATE_SCORING);
check("Alternate, hooker: no scrum points (24)", altHooker === 24, String(altHooker));
check("Alternate: 59 minutes is appearance only", playerPoints({ minutesPlayed: 59 }, false, ALTERNATE_SCORING) === 1);
check("Alternate: 60 minutes gets the extra point", playerPoints({ minutesPlayed: 60 }, false, ALTERNATE_SCORING) === 2);
check("Alternate: metres per complete 5 m (24 m = 0.8)", playerPoints({ minutesPlayed: 1, metresGained: 24 }, false, ALTERNATE_SCORING) === 1.8);
check("Alternate: decimals stay tidy (3 x 0.1-style values)", playerPoints({ minutesPlayed: 1, lineoutsWon: 3, offloads: 3 }, false, ALTERNATE_SCORING) === 4.6);

// Standard, prop: 1 (under 61) + 15 + 9 + 7 + 6 + 2 (20 m of 23) + 4 + 10 - 1 - 1 + 6 = 58
const stdProp = playerPoints(counts, isFrontRow(prop, STANDARD_SCORING), STANDARD_SCORING);
check("Standard, prop: 58", stdProp === 58, String(stdProp));
check("Standard, hooker still gets scrum points", isFrontRow(hooker, STANDARD_SCORING) && !isFrontRow(hooker, ALTERNATE_SCORING));

// breakdown adds up to the total
const sum = pointsBreakdown(counts, true, ALTERNATE_SCORING).reduce((a, b) => a + b.points, 0);
check("breakdown adds up to the total", Math.round(sum * 10) / 10 === altProp);

// custom / saved rules missing newer fields are filled from Standard
const partial = completeRules({ perEvent: { tries: 20 } } as never);
check("custom rules: changed values kept, missing ones from Standard", partial.perEvent.tries === 20 && partial.perEvent.tackles === 1 && partial.metresPer === 10);

console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
