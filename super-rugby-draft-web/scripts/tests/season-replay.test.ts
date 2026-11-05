// Replays the 2026 season through the automatic results job, on a COPY of the 2026 league
// in the LOCAL test database (the copy is deleted at the end).
// Run (from super-rugby-draft-web, Docker + `npx supabase start` running):
//   NODE_OPTIONS=--experimental-websocket npx tsx scripts/tests/season-replay.test.ts
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { buildScheduleForLeague, lockWeek, runResultsTick } from "../../lib/results/engine";
import { buildLadder } from "../../lib/league/ladder";
import { getSeason, weekFinaliseAtMs, weekDeadlineMs, weekLabel } from "../../lib/season";

loadEnvConfig(process.cwd(), true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("This test only runs against the local test database");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw error;
  return data as T;
}

const SRC_OWNER = "ethanaccount";
const TEST_LEAGUE = "league_replay_test";

async function cleanup() {
  await q(db.from("team_selections").delete().eq("league_id", TEST_LEAGUE));
  await q(db.from("rosters").delete().eq("league_id", TEST_LEAGUE));
  await q(db.from("league_matchups").delete().eq("league_id", TEST_LEAGUE));
  await q(db.from("team_week_results").delete().eq("league_id", TEST_LEAGUE));
  await q(db.from("league_week_finalisations").delete().eq("league_id", TEST_LEAGUE));
  await q(db.from("teams").delete().eq("league_id", TEST_LEAGUE));
  await q(db.from("leagues").delete().eq("id", TEST_LEAGUE));
}

async function main() {
  await cleanup();
  // ---- copy the 2026 league
  const srcTeam = await q<{ league_id: string }>(db.from("teams").select("league_id").eq("owner_username", SRC_OWNER).limit(1).single());
  const src = srcTeam.league_id;
  const league = await q<Record<string, unknown>>(db.from("leagues").select("*").eq("id", src).single());
  await q(db.from("leagues").insert({
    ...league, id: TEST_LEAGUE, code: "REPLAY", name: "Replay test", season: 2026, playoff_format: "final4", bonus_points: true,
    first_week: null, schedule_plan: null, schedule_built_at: null, settings_locked_at: null,
  }));
  const teams = await q<Array<Record<string, unknown> & { id: string; owner_username: string }>>(db.from("teams").select("*").eq("league_id", src));
  const idMap = new Map(teams.map((t) => [t.id, `replay_${t.id}`]));
  await q(db.from("teams").insert(teams.map((t) => ({ ...t, id: idMap.get(t.id), league_id: TEST_LEAGUE }))));
  const rosters = await q<Array<Record<string, unknown> & { team_id: string }>>(db.from("rosters").select("*").eq("league_id", src));
  await q(db.from("rosters").insert(rosters.map((r) => ({ ...r, league_id: TEST_LEAGUE, team_id: idMap.get(r.team_id) }))));
  const sels = await q<Array<Record<string, unknown> & { team_id: string; week: number }>>(db.from("team_selections").select("*").eq("league_id", src));
  // Keep the 2026 lineups as they were (already locked), except one team's week 12, which is
  // removed to test "use the last saved lineup".
  const josh = teams.find((t) => t.owner_username === "joshaccount")!.id;
  await q(db.from("team_selections").insert(
    sels.filter((s) => idMap.has(s.team_id) && !(s.team_id === josh && s.week === 12))
      .map((s) => ({ ...s, league_id: TEST_LEAGUE, team_id: idMap.get(s.team_id), locked_at: "2026-01-01T00:00:00Z" }))
  ));
  console.log(`Copied the 2026 league: ${teams.length} teams, ${sels.length - 1} lineups`);

  // ---- draft finishes 15 Feb 2026 -> schedule
  const season = getSeason(2026);
  const draftDone = new Date("2026-02-15T12:00:00+08:00").getTime();
  const built = await buildScheduleForLeague(db, TEST_LEAGUE, draftDone);
  console.log("Schedule:", built);
  const lg = await q<{ first_week: number; schedule_plan: { weeks: number[]; regularWeeks: number[]; playoffWeeks: number[]; regularToDecide: { weeks: number[] } | null } }>(
    db.from("leagues").select("first_week, schedule_plan").eq("id", TEST_LEAGUE).single()
  );
  check("league starts at the first round after the draft (week 2)", lg.first_week === 2, String(lg.first_week));
  check("regular season weeks 2-14, finals 15-16", JSON.stringify(lg.schedule_plan.playoffWeeks) === "[15,16]" && lg.schedule_plan.regularWeeks.length === 13);
  console.log(`  ladder-picked weeks (byes can't come out even with 7 teams over 13 weeks): ${lg.schedule_plan.regularToDecide?.weeks.join(", ") ?? "none"}`);

  // ---- before the week-12 deadline nothing is locked for Josh; at the deadline his last lineup is used
  const dl12 = weekDeadlineMs(season, 12)!;
  const r1 = await runResultsTick(db, 2026, dl12 - 60_000);
  check("nothing is finalised before its time", !r1.finalised.some((x) => x.endsWith("week 12")));
  // replay every round: one tick just after each deadline and just after each finalise time
  const times: number[] = [];
  for (const w of lg.schedule_plan.weeks) times.push(weekDeadlineMs(season, w)! + 60_000, weekFinaliseAtMs(season, w)! + 60_000);
  times.sort((a, b) => a - b);
  const errors: string[] = [...r1.errors];
  let finalisedCount = r1.finalised.length; // weeks 2-11 were already due at that first tick
  for (const t of times) {
    const r = await runResultsTick(db, 2026, t);
    errors.push(...r.errors);
    finalisedCount += r.finalised.length;
  }
  check("every week finalised exactly once", finalisedCount === lg.schedule_plan.weeks.length, `${finalisedCount}`);
  check("no errors", errors.length === 0, errors[0]);
  const josh12 = await q<Array<{ locked_at: string; lineup: Record<string, unknown> }>>(
    db.from("team_selections").select("locked_at, lineup").eq("league_id", TEST_LEAGUE).eq("team_id", idMap.get(josh)!).eq("week", 12)
  );
  check("team with no week-12 lineup got one at the deadline", josh12.length === 1 && Object.values(josh12[0].lineup).filter(Boolean).length === 20);

  // ---- running the tick again changes nothing
  const again = await runResultsTick(db, 2026, times[times.length - 1] + 3600_000);
  check("running again does nothing new", again.finalised.length === 0 && again.locked.length === 0);

  // ---- results
  const ms = await q<Array<{ kind: string; status: string; playoff_key: string | null; label: string | null; weeks: number[]; home_team_id: string | null; away_team_id: string | null; home_score: number | null; away_score: number | null; home_bonus: number; away_bonus: number; winner_team_id: string | null; decides: string | null }>>(
    db.from("league_matchups").select("*").eq("league_id", TEST_LEAGUE)
  );
  check("every matchup has a result", ms.every((m) => m.status === "final"), `${ms.filter((m) => m.status !== "final").length} not final`);
  const teamIds = teams.map((t) => idMap.get(t.id)!);
  const ownerOf = new Map(teams.map((t) => [idMap.get(t.id)!, t.owner_username.replace("account", "")]));
  for (const w of lg.schedule_plan.regularWeeks) {
    const wk = ms.filter((m) => m.kind === "regular" && m.weeks.includes(w));
    const ids = wk.flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean);
    if (ids.length !== 7 || new Set(ids).size !== 7) check(`week ${w}: every team once`, false, `${ids.length}`);
  }
  const ladder = buildLadder(teamIds, ms);
  console.log("\nLadder after the regular season (bonus points ON for this test):");
  ladder.forEach((r, i) => console.log(`  ${i + 1}. ${ownerOf.get(r.teamId)!.padEnd(6)} W${r.won} D${r.drawn} L${r.lost} byes ${r.byes} bonus ${r.bonus}  pts ${r.ladderPoints}  PF ${r.pointsFor}`));
  const byes = ladder.map((r) => r.byes);
  check("byes differ by at most 1", Math.max(...byes) - Math.min(...byes) <= 1, byes.join(","));
  console.log("\nPlayoffs:");
  for (const m of ms.filter((m) => m.kind !== "regular").sort((a, b) => a.weeks[0] - b.weeks[0])) {
    console.log(`  ${weekLabel(season, m.weeks[0])} ${String(m.label).padEnd(22)} ${ownerOf.get(m.home_team_id!)} ${m.home_score} v ${m.away_score} ${ownerOf.get(m.away_team_id!)}  -> ${ownerOf.get(m.winner_team_id!)}`);
  }
  const gf = ms.find((m) => m.decides === "champion");
  const ws = ms.find((m) => m.decides === "spoon");
  check("grand final played by two of the top 4", !!gf && [gf.home_team_id, gf.away_team_id].every((t) => ladder.findIndex((r) => r.teamId === t) < 4));
  check("spoon game played by bottom-3 teams", !!ws && [ws.home_team_id, ws.away_team_id].every((t) => ladder.findIndex((r) => r.teamId === t) >= 4));
  console.log(`\nChampion: ${ownerOf.get(gf!.winner_team_id!)}   Wooden spoon: ${ownerOf.get(ws!.winner_team_id === ws!.home_team_id ? ws!.away_team_id! : ws!.home_team_id!)}`);
}

main()
  .catch((e) => { failures++; console.error(e); })
  .finally(async () => {
    await cleanup().catch(() => {});
    console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
    process.exit(failures ? 1 : 0);
  });

void lockWeek;
