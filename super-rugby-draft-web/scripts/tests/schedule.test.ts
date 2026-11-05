// Run: npx tsx scripts/tests/schedule.test.ts  — checks the schedule maker for 4-12 teams and every finals option.
import { buildLeagueSchedule, pickRoundForWeek, resolveSource, type FinalsSize, type PlayoffResult, type RegularGame } from "../../lib/league/schedule";
const weeks = Array.from({ length: 16 }, (_, i) => i + 1);
let failures = 0;
const fail = (m: string) => { failures++; if (failures < 30) console.log("FAIL", m); };
const idleReport: string[] = [];
for (let n = 4; n <= 12; n++) {
  for (const F of [0, 2, 3, 4, 6] as FinalsSize[]) {
    if (F > n) continue;
    const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
    const sch = buildLeagueSchedule({ teamIds: teams, weeks, finals: F });
    // fill in the ladder-decided weeks using a fixed ladder (T1 top ... Tn bottom)
    const regular: RegularGame[] = [...sch.regular];
    if (sch.regularToDecide) {
      if (n % 2 === 0) fail(`n=${n} F=${F}: even league has weeks to decide`);
      const used: number[] = [];
      for (const w of sch.regularToDecide.weeks) {
        const p = pickRoundForWeek(sch.regularToDecide, w, teams, used);
        used.push(p.roundIndex); regular.push(...p.games);
      }
    }
    // byes: in odd leagues counts differ by at most 1, and extra byes go to the top of the ladder
    if (n % 2 === 1) {
      const byes = teams.map((t) => regular.filter((x) => x.homeTeamId === t && x.awayTeamId === null).length);
      if (Math.max(...byes) - Math.min(...byes) > 1) fail(`n=${n} F=${F}: byes ${byes}`);
      for (let i = 1; i < n; i++) if (byes[i] > byes[i - 1]) fail(`n=${n} F=${F}: extra bye went to a lower team ${byes}`);
    }
    // regular season: every team exactly once per week (bye counts), all pairs met roughly evenly
    for (const w of sch.regularWeeks) {
      const g = regular.filter((x) => x.week === w);
      const seen = g.flatMap((x) => [x.homeTeamId, x.awayTeamId]).filter(Boolean) as string[];
      if (seen.length !== n || new Set(seen).size !== n) fail(`n=${n} F=${F} week ${w}: ${seen.length} slots`);
    }
    const meet = new Map<string, number>();
    for (const x of regular) if (x.awayTeamId) { const k = [x.homeTeamId, x.awayTeamId].sort().join("-"); meet.set(k, (meet.get(k) ?? 0) + 1); }
    const counts = [...meet.values()];
    const pairsTotal = (n * (n - 1)) / 2;
    if (Math.max(...counts) - (meet.size < pairsTotal ? 0 : Math.min(...counts)) > 1 + 0) {
      // allowed spread: each pair meets floor or ceil times
      const lo = meet.size < pairsTotal ? 0 : Math.min(...counts);
      if (Math.max(...counts) - lo > 1) fail(`n=${n} F=${F}: uneven meetings ${lo}..${Math.max(...counts)}`);
    }
    if (sch.playoffWeeks.length !== ({ 0: 0, 2: 1, 3: 2, 4: 2, 6: 3 } as any)[F]) fail(`n=${n} F=${F}: playoff weeks ${sch.playoffWeeks.length}`);
    // playoffs: simulate random results many times
    let maxIdle = 0;
    for (let trial = 0; trial < 300; trial++) {
      const ladder = [...teams].sort(() => Math.random() - 0.5); // ladder[0] = 1st
      const seedToTeam = (s: number) => ladder[s - 1] ?? null;
      const results: Record<string, PlayoffResult> = {};
      const teamsIn = new Map<string, string[]>(); // game key -> [home, away]
      for (const w of sch.playoffWeeks) {
        const active = sch.playoffs.filter((g) => g.weeks.includes(w));
        const playing: string[] = [];
        for (const g of active) {
          if (!teamsIn.has(g.key)) {
            const h = resolveSource(g.home, seedToTeam, results), a = resolveSource(g.away, seedToTeam, results);
            if (!h || !a) { fail(`n=${n} F=${F} ${g.key} week ${w}: team not known yet`); continue; }
            if (h === a) fail(`n=${n} F=${F} ${g.key}: team plays itself`);
            teamsIn.set(g.key, [h, a]);
          }
          playing.push(...teamsIn.get(g.key)!);
        }
        if (new Set(playing).size !== playing.length) fail(`n=${n} F=${F} week ${w}: a team has two games`);
        // byes this week among teams out of contention in finals are expected; count consolation idles
        const consTeams = ladder.slice(F);
        if (F === 4 || F === 6) { const finalsIdle = ladder.slice(0, F).filter((t) => !playing.includes(t)).length; const allowed = F === 6 && w === sch.playoffWeeks[0] ? 2 : 0; if (finalsIdle > allowed) fail(`n=${n} F=${F} week ${w}: ${finalsIdle} finals teams without a game`); }
        const idle = consTeams.filter((t) => !playing.includes(t)).length;
        maxIdle = Math.max(maxIdle, idle);
        for (const g of active) if (Math.max(...g.weeks) === w && teamsIn.has(g.key)) {
          const [h, a] = teamsIn.get(g.key)!; const hw = Math.random() < 0.5;
          results[g.key] = { winnerTeamId: hw ? h : a, loserTeamId: hw ? a : h };
        }
      }
      const gf = sch.playoffs.find((g) => g.decides === "champion");
      const ws = sch.playoffs.find((g) => g.decides === "spoon");
      const champ = F === 0 ? ladder[0] : results[gf!.key]?.winnerTeamId;
      const spoon = F === 0 ? ladder[n - 1] : sch.spoonSeedWithoutGame ? ladder[sch.spoonSeedWithoutGame - 1] : ws ? results[ws.key]?.loserTeamId : null;
      if (!champ || ladder.indexOf(champ) >= Math.max(F, 1)) fail(`n=${n} F=${F}: bad champion`);
      if (n - F >= 1 || F === 0) { if (!spoon || (F > 0 && ladder.indexOf(spoon) < F)) fail(`n=${n} F=${F}: bad spoon ${spoon}`); }
    }
    idleReport.push(`n=${n} F=${F}: regular ${sch.regularWeeks.length} wks, most consolation teams idle in a playoff week: ${maxIdle}`);
  }
}
console.log(idleReport.join("\n"));
console.log(failures ? `\n${failures} FAILURES` : "\nALL CHECKS PASSED");
const show = (n: number, F: FinalsSize) => {
  const sch = buildLeagueSchedule({ teamIds: Array.from({ length: n }, (_, i) => `T${i + 1}`), weeks, finals: F });
  const fmt = (s: any) => ("seed" in s ? `${s.seed}${["th","st","nd","rd"][s.seed % 10 > 3 || [11,12,13].includes(s.seed % 100) ? 0 : s.seed % 10]}` : "winnerOf" in s ? `winner ${s.winnerOf}` : "loserOf" in s ? `loser ${s.loserOf}` : `${s.pick} seed ${"winnerOf_" in s ? "winner" : "loser"} of ${(s.winnerOf_ ?? s.loserOf_).join("/")}`);
  console.log(`\n${n} teams, ${F}-team finals (weeks ${sch.playoffWeeks.join(",")}):`);
  for (const g of sch.playoffs) console.log(`  wk ${g.weeks.join("+")}  ${g.key.padEnd(4)} ${g.label}: ${fmt(g.home)} v ${fmt(g.away)}`);
  if (sch.spoonSeedWithoutGame) console.log(`  ${sch.spoonSeedWithoutGame}th gets the spoon (no game)`);
};
show(7, 4); show(6, 6);
// bye example: 5 teams, 14 regular weeks (rotation of 5 doesn't divide 14)
const five = buildLeagueSchedule({ teamIds: ["T1", "T2", "T3", "T4", "T5"], weeks, finals: 2 });
console.log(`
5 teams, 2-team final: ${five.regular.length ? five.regularWeeks.length : 0} regular weeks, last ${five.regularToDecide?.weeks.length ?? 0} decided from the ladder`);
