// The draft lottery (lib/draft/lottery; Ethan, 28 Nov 2026).
// 1. The race: the same seed gives the same order as Ethan's mock (prototypes/draft-lottery.html),
//    and it's fair: over 2,000 races every team takes pick 1 within 2% of an equal share.
// 2. On the server, in a throwaway league in the LOCAL test database (deleted after): setting,
//    moving and cancelling a time, running at the time (once, even if asked twice), a rerun,
//    a change by hand afterwards, and the draft starting before a lottery that's still waiting.
// Run (from super-rugby-draft-web, Docker + `npx supabase start` running):
//   NODE_OPTIONS=--experimental-websocket npx tsx scripts/tests/draft-lottery.test.ts
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { lotteryOrder, simulate } from "../../lib/draft/lottery/sim";
import { cancelLottery, getLotteries, runDueLottery, scheduleLottery } from "../../lib/draft/lottery/server";
import { advanceDraft, getDraftState, setDraftOrder } from "../../lib/draft/engine";

loadEnvConfig(process.cwd(), true);

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

function raceChecks() {
  // orders and times from Ethan's mock, run on the same seeds
  const known: Array<[number, number, number[], string]> = [
    [10, 12345, [7, 5, 4, 9, 6, 0, 1, 8, 2, 3], "24.1455"],
    [4, 1, [3, 0, 2, 1], "26.1640"],
    [12, 0xdeadbeef, [11, 0, 3, 1, 2, 5, 9, 4, 10, 8, 7, 6], "25.8867"],
    [20, 7, [18, 11, 5, 6, 14, 9, 4, 16, 12, 19, 15, 10, 0, 17, 1, 3, 8, 13, 2, 7], "26.7349"],
  ];
  for (const [n, seed, order, end] of known) {
    const r = simulate(n, seed);
    check(`race: ${n} teams, seed ${seed} gives the mock's order`, r.order.join() === order.join() && r.end.toFixed(4) === end, r.order.join());
  }
  check("race: the path recorded for the animation doesn't change the result", simulate(10, 12345, true).order.join() === simulate(10, 12345).order.join());
  check("race: lotteryOrder maps runners to teams", lotteryOrder(["a", "b", "c", "d"], 1).join() === "d,a,c,b");

  // fairness: 2,000 races each (seeds 1..2000, so the test always gives the same answer)
  for (const n of [2, 4, 6, 8, 10, 12, 16, 20]) {
    const N = 2000;
    const wins = new Array(n).fill(0);
    for (let s = 1; s <= N; s++) wins[simulate(n, s * 2654435761).order[0]]++;
    const fair = 100 / n;
    const worst = Math.max(...wins.map((w) => Math.abs((w / N) * 100 - fair)));
    check(`fair: ${n} teams, every team takes pick 1 within 2% of ${fair.toFixed(1)}%`, worst <= 2, `furthest off ${worst.toFixed(2)}%`);
  }
}

const L = "league_lottery_test";
const TEAMS = ["lt_a", "lt_b", "lt_c", "lt_d", "lt_e", "lt_f"];

async function dbChecks() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("This test only runs against the local test database");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const cleanup = async () => {
    for (const t of ["draft_lotteries", "draft_picks", "draft_state", "draft_queue"]) await db.from(t).delete().eq("league_id", L);
    await db.from("teams").delete().eq("league_id", L);
    await db.from("leagues").delete().eq("id", L);
  };
  await cleanup();
  try {
    const now = Date.now();
    const draftAt = now + 3 * 60 * 60_000; // in 3 hours
    await db.from("leagues").insert({ id: L, name: "Lottery test", code: "LOTTOT", created_by: "ethanaccount", season: 2027, playoff_format: "final2", draft_at: new Date(draftAt).toISOString(), draft_status: "scheduled" });
    await db.from("teams").insert(TEAMS.map((id, i) => ({ id, league_id: L, user_id: id, owner_username: id, name: `Team ${i + 1}`, created_at: new Date(now - (10 - i) * 1000).toISOString() })));
    await getDraftState(db, L);

    const threw = async (f: () => Promise<unknown>) => {
      try {
        await f();
        return "";
      } catch (e) {
        return (e as Error).message;
      }
    };
    check("schedule: not in the past", /minute from now/.test(await threw(() => scheduleLottery(db, L, "ethanaccount", now - 1000, now))));
    check("schedule: not too close to the draft", /5 minutes before/.test(await threw(() => scheduleLottery(db, L, "ethanaccount", draftAt - 60_000, now))));

    const at1 = now + 60 * 60_000;
    await scheduleLottery(db, L, "ethanaccount", at1, now);
    await scheduleLottery(db, L, "ethanaccount", at1 + 60_000, now); // moved
    let runs = await getLotteries(db, L);
    check("schedule: moving it keeps one waiting run", runs.length === 1 && runs[0].run_number === 1 && new Date(runs[0].scheduled_at).getTime() === at1 + 60_000);
    check("schedule: nothing about the result exists before it runs", runs[0].seed === null && runs[0].result_team_ids === null);
    check("run: not before its time", (await runDueLottery(db, L, at1)) === null);

    // two phones asking at the same moment: only one runs it
    const [x, y] = await Promise.all([runDueLottery(db, L, at1 + 61_000), runDueLottery(db, L, at1 + 61_000)]);
    check("run: at its time, once", [x, y].filter(Boolean).length === 1);
    const first = (x ?? y)!;
    let st = await getDraftState(db, L);
    check("run: the order is the race's order", st.draft_order_team_ids?.join() === lotteryOrder(first.team_ids!, first.seed!).join() && first.result_team_ids?.join() === st.draft_order_team_ids?.join());
    check("run: timed from when it was due", new Date(first.ran_at!).getTime() === at1 + 60_000);
    check("run: lanes are the teams in the order they joined", first.team_ids?.join() === TEAMS.join());
    check("run: marked as the lottery's order", st.order_source === "lottery");

    // by hand afterwards
    await setDraftOrder(db, L, [...TEAMS].reverse());
    st = await getDraftState(db, L);
    check("by hand: still allowed, and marked as the commissioner's", st.order_source === "commissioner" && st.draft_order_team_ids?.join() === [...TEAMS].reverse().join());

    // a rerun
    const at2 = at1 + 10 * 60_000;
    await scheduleLottery(db, L, "ethanaccount", at2, at1 + 2 * 60_000);
    runs = await getLotteries(db, L);
    check("rerun: kept as run 2, run 1 still listed", runs.length === 2 && runs[1].run_number === 2 && !runs[1].ran_at && !!runs[0].ran_at);
    await cancelLottery(db, L, at1 + 3 * 60_000);
    check("cancel: the waiting run goes, run 1 stays", (await getLotteries(db, L)).length === 1);
    await scheduleLottery(db, L, "ethanaccount", at2, at1 + 3 * 60_000);
    // a cancel after its time has come is too late: it runs
    await cancelLottery(db, L, at2 + 1000);
    runs = await getLotteries(db, L);
    check("cancel: too late once it's due (it runs instead)", runs.length === 2 && !!runs[1].ran_at);
    st = await getDraftState(db, L);
    check("rerun: sets the order again", st.order_source === "lottery" && st.draft_order_team_ids?.join() === runs[1].result_team_ids?.join());

    // the draft time moved before a waiting lottery: it runs as the draft starts
    const at3 = at2 + 10 * 60_000;
    await scheduleLottery(db, L, "ethanaccount", at3, at2 + 60_000);
    await db.from("leagues").update({ draft_at: new Date(at2 + 2 * 60_000).toISOString() }).eq("id", L);
    await advanceDraft(db, L, at2 + 3 * 60_000);
    runs = await getLotteries(db, L);
    st = await getDraftState(db, L);
    check("draft first: the waiting lottery runs, and the draft uses its order", !!runs[2]?.ran_at && st.phase === "live" && st.draft_order_team_ids?.join() === runs[2].result_team_ids?.join());
    check("after the draft starts: no more lotteries", /started/.test(await threw(() => scheduleLottery(db, L, "ethanaccount", at3 + 60 * 60_000, at2 + 4 * 60_000))));
  } finally {
    await cleanup();
  }
}

async function main() {
  raceChecks();
  if (process.argv.includes("--race-only")) return;
  await dbChecks();
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
    process.exit(failures ? 1 : 0);
  });
