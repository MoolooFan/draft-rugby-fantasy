// A whole draft on the server, in a throwaway league in the LOCAL test database (deleted after).
// Run (from super-rugby-draft-web, Docker + `npx supabase start` running):
//   NODE_OPTIONS=--experimental-websocket npx tsx scripts/tests/draft.test.ts
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { advanceDraft, getDraftState, loadDraftContext, makePick, refreshDraftOrder, setDraftOrder, setDraftQueue, DraftError } from "../../lib/draft/engine";
import { FAST_PICK_SECONDS, PICK_SECONDS, ROSTER_SIZE, rosterFits, teamForPick } from "../../lib/draft/rules";

loadEnvConfig(process.cwd(), true);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("This test only runs against the local test database");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const L = "league_draft_test";
const TEAMS = ["dt_a", "dt_b", "dt_c", "dt_d"];

async function cleanup() {
  for (const t of ["draft_queue", "draft_picks", "rosters", "draft_state", "league_matchups", "league_week_finalisations"]) await db.from(t).delete().eq("league_id", L);
  await db.from("teams").delete().eq("league_id", L);
  await db.from("leagues").delete().eq("id", L);
}

async function main() {
  // rules
  const P = (pos: string, pos2?: string, pos3?: string) => ({ posAbbrev: pos, secondaryPosAbbrev: pos2, thirdPosAbbrev: pos3 });
  check("snake order: pick 5 of 4 teams goes to the last team", teamForPick(TEAMS, 5) === "dt_d" && teamForPick(TEAMS, 8) === "dt_a");
  check("roster rules: 7 props don't fit (2 PR + 5 wildcards)", rosterFits(Array(7).fill(P("PR"))) && !rosterFits(Array(8).fill(P("PR"))));
  const full = [...Array(8).fill(P("OB")), P("FH"), P("PR"), P("PR")]; // OB + wildcards, FH and PR spots full
  check("roster rules: a player who only fits by his third position fits", rosterFits([...full, P("FH", "PR", "LK")]));
  check("roster rules: ...and without it he doesn't", !rosterFits([...full, P("FH", "PR")]));

  await cleanup();
  const t0 = Date.now() - 60 * 60 * 1000; // draft started an hour ago
  await db.from("leagues").insert({ id: L, name: "Draft test", code: "DRAFTT", created_by: "ethanaccount", season: 2027, playoff_format: "final2", draft_at: new Date(t0).toISOString(), draft_status: "scheduled" });
  await db.from("teams").insert(TEAMS.map((id, i) => ({ id, league_id: L, user_id: id, owner_username: id, name: `Team ${i + 1}` })));

  // order
  const shuffledOrder = await refreshDraftOrder(db, L, { reshuffle: true });
  check("order has every team", [...shuffledOrder].sort().join() === [...TEAMS].sort().join());
  await setDraftOrder(db, L, TEAMS);
  check("commissioner can set the order before the draft", (await getDraftState(db, L)).draft_order_team_ids?.join() === TEAMS.join());

  // start (just after the draft time)
  await advanceDraft(db, L, t0 + 1000);
  let st = await getDraftState(db, L);
  check("draft starts at its time with a 90 second clock", st.phase === "live" && new Date(st.pick_deadline_at!).getTime() === t0 + PICK_SECONDS * 1000);
  let threw = "";
  try { await setDraftOrder(db, L, [...TEAMS].reverse()); } catch (e) { threw = (e as Error).message; }
  check("order is locked once the draft starts", /started/.test(threw));

  // a manual pick, a wrong-team pick, a taken player
  const ctx = await loadDraftContext(db, L);
  const best = [...ctx.players.values()].sort((a, b) => a.draftRank - b.draftRank)[0];
  await makePick(db, L, "dt_a", best.id, t0 + 20_000);
  threw = "";
  try { await makePick(db, L, "dt_a", [...ctx.players.keys()][5], t0 + 21_000); } catch (e) { threw = (e as Error).message; }
  check("can't pick out of turn", /isn't your pick/.test(threw));
  threw = "";
  try { await makePick(db, L, "dt_b", best.id, t0 + 22_000); } catch (e) { threw = (e as Error).message; }
  check("can't pick a player already taken", /already been picked/.test(threw));

  // team B's watchlist: two lower-ranked players
  const ranked = [...ctx.players.values()].sort((a, b) => a.draftRank - b.draftRank);
  const wanted = [ranked[150].id, ranked[151].id];
  await setDraftQueue(db, L, "dt_b", wanted);

  // nobody else turns up: run the clock forward a long way
  const r = await advanceDraft(db, L, t0 + 6 * 60 * 60 * 1000);
  st = await getDraftState(db, L);
  check("auto-picks carry the draft to the end with nobody watching", st.phase === "complete", `${r.autoPicks} auto-picks`);

  const picks = (await db.from("draft_picks").select("*").eq("league_id", L).order("pick_number")).data ?? [];
  check(`all ${TEAMS.length * ROSTER_SIZE} picks made, no player twice`, picks.length === TEAMS.length * ROSTER_SIZE && new Set(picks.map((p) => p.player_id)).size === picks.length);
  const bPicks = picks.filter((p) => p.team_id === "dt_b");
  check("team B's first auto-picks came from its watchlist, in order", bPicks[0].player_id === wanted[0] && bPicks[1].player_id === wanted[1]);
  const end = await loadDraftContext(db, L);
  const fitsAll = TEAMS.every((t) => {
    const roster = (end.rosters.get(t) ?? []).map((id) => end.players.get(id)!);
    return roster.length === ROSTER_SIZE && rosterFits(roster);
  });
  check("every roster has 20 players and fits the position rules", fitsAll);
  const rosterRows = (await db.from("rosters").select("data").eq("league_id", L)).data ?? [];
  check("rosters saved for the season", rosterRows.length === 4 && rosterRows.every((r) => (r.data as { playerIds: string[] }).playerIds.length === ROSTER_SIZE));

  // the 10-second rule: team C missed every pick. Its 4th pick onwards should come 10s after due.
  const cPicks = picks.filter((p) => p.team_id === "dt_c");
  check("missed picks are marked as auto", cPicks.every((p) => p.auto));
  const lg = (await db.from("leagues").select("draft_status, schedule_built_at").eq("id", L).single()).data;
  check("draft complete builds the schedule", lg?.draft_status === "complete" && !!lg?.schedule_built_at);
  const fast = st.missed_in_row["dt_c"] >= 3;
  check(`after 3 misses a team is on the ${FAST_PICK_SECONDS}s clock`, fast, `dt_c missed ${st.missed_in_row["dt_c"]}`);

}

main()
  .catch((e) => { failures++; console.error(e instanceof DraftError ? e.message : e); })
  .finally(async () => {
    await cleanup().catch(() => {});
    console.log(failures ? `\n${failures} FAILED` : "\nALL CHECKS PASSED");
    process.exit(failures ? 1 : 0);
  });
