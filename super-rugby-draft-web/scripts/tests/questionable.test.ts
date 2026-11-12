// Run: npx tsx scripts/tests/questionable.test.ts — Questionable (QUES) status rules.
import { dueQuestionable, questionableStatus, returnRound } from "../../lib/status/questionable";
import { STATUS_TAG, statusKind } from "../../lib/status/kind";
import { irEligible } from "../../lib/league/ir";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// return round, counted from the list's round
check("'1 week' on the Round 5 list: back Round 6", returnRound("Hamstring - 1 week", 5) === 6);
check("'1-2 weeks' on Round 5: the shortest time, Round 6", returnRound("Hamstring - 1-2 weeks", 5) === 6);
check("'4-6 weeks' on Round 3: Round 7", returnRound("Knee - 4-6 weeks", 3) === 7);
check("'2+ weeks' on Round 8: Round 10", returnRound("Calf - 2+ weeks", 8) === 10);
check("'10 days' on Round 4: rounded up to 2 weeks, Round 6", returnRound("Ankle - 10 days", 4) === 6);
check("'Round 9' on Round 5: Round 9", returnRound("Knee - Round 9", 5) === 9);
check("'Rounds 12-14' on Round 8: Round 12", returnRound("Shoulder - Rounds 12-14", 8) === 12);
check("'Round 16-Finals' on Round 10: Round 16", returnRound("Foot - Round 16-Finals", 10) === 16);
for (const vague of ["Knee - TBC", "Knee - Season", "Foot - Short term", "Foot - Medium term", "Knee - Long term", "Knee - Returning", "Concussion"]) {
  check(`vague / no time never turns QUES: "${vague}"`, returnRound(vague, 5) === null);
}
check("no list round known: nothing", returnRound("Hamstring - 1 week", null) === null);
check("already questionable: nothing", returnRound("Questionable - Hamstring", 5) === null);

// the text
check("status text keeps the injury", questionableStatus("Hamstring - 1-2 weeks") === "Questionable - Hamstring");
check("'Injury - 2 weeks' just reads Questionable", questionableStatus("Injury - 2 weeks") === "Questionable");

// timing: QUES once the round before his return is finished
const finished = (r: number) => (r <= 5 ? 1000 * r : null); // rounds 1-5 finished at 1000*r
check("Round 5 list, 1-2 weeks: QUES once Round 5 has finished", dueQuestionable("Hamstring - 1-2 weeks", 5, finished, 5000));
check("...not before Round 5 finishes", !dueQuestionable("Hamstring - 1-2 weeks", 5, finished, 4999));
check("Round 5 list, 2 weeks: not yet after Round 5 (back Round 7)", !dueQuestionable("Hamstring - 2 weeks", 5, finished, 9999));
check("relisted on the Round 6 list with '1 week': counted from Round 6", !dueQuestionable("Hamstring - 1 week", 6, finished, 9999));

// how QUES shows and works
check("'Questionable - Hamstring' is questionable", statusKind("Questionable - Hamstring") === "questionable");
check("QUES tag reads QUES, red like injured", STATUS_TAG.questionable.tag === "QUES" && STATUS_TAG.questionable.bg === STATUS_TAG.injured.bg);
check("questionable players can go in the IR spot", irEligible("Questionable - Hamstring"));

// jersey numbers in team-list statuses
check("'Starting - #12' is starting", statusKind("Starting - #12") === "starting");
check("'Bench - #22' is bench", statusKind("Bench - #22") === "bench");
check("'Suspended - 1 week' is still suspended", statusKind("Suspended - 1 week") === "suspended");

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
