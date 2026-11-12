// Run: npx tsx scripts/tests/player-ids.test.ts — new player ids (F1), checked on the real 2026 list.
import fs from "node:fs";
import path from "node:path";
import { assignPlayerIds, idStem, newPlayerId, PLAYER_ID_RE, type IdPlayer } from "../../lib/players/ids";

let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

check("McKenzie", idStem("Damian", "McKenzie") === "mckenda");
check("apostrophe", idStem("Tanielu", "Tele'a") === "teleata");
check("space", idStem("Naitoa", "Ah Kuoi") === "ahkuona");
check("hyphen + apostrophes", idStem("Feleti", "Sae-Ta'ufo'ou") === "saetafe");
check("macron", idStem("Tāne", "Edmed") === "edmedta");
check("short last name", idStem("Sam", "Ng") === "ngsa");
const taken = new Set<string>();
check("numbers go up on a clash", newPlayerId("Will", "Jordan", taken) === "jordawi01" && newPlayerId("William", "Jordan", taken) === "jordawi02");

// the real 2026 list
const csv = fs.readFileSync(path.resolve(__dirname, "../../data/players.csv"), "utf8").trim().split(/\r?\n/).slice(1);
const players: IdPlayer[] = csv.map((line, i) => {
  const c = line.split(",");
  return { season: 2026, oldId: c[0], firstName: c[2], lastName: c[3], externalId: null, draftRank: Number(c[8]) || i + 1 };
});
const both = [...players, ...players.map((p) => ({ ...p, season: 2027 }))];
const map = assignPlayerIds(both);
const ids2026 = players.map((p) => map.get(`2026|${p.oldId.toLowerCase()}`)!);
check("every 2026 player gets an id", ids2026.every(Boolean), `${players.length} players`);
check("all ids clean (letters then a number)", ids2026.every((id) => PLAYER_ID_RE.test(id)), ids2026.filter((id) => !PLAYER_ID_RE.test(id)).slice(0, 3).join(", "));
check("all ids different", new Set(ids2026).size === ids2026.length);
check("same id in 2027", players.every((p) => map.get(`2027|${p.oldId.toLowerCase()}`) === map.get(`2026|${p.oldId.toLowerCase()}`)));
check("D.McKenzie -> mckenda01", map.get("2026|d.mckenzie") === "mckenda01", map.get("2026|d.mckenzie"));
check("running it again keeps the new ids", (() => {
  const again = assignPlayerIds(players.map((p) => ({ ...p, oldId: map.get(`2026|${p.oldId.toLowerCase()}`)! })));
  return ids2026.every((id) => again.get(`2026|${id}`) === id);
})());
const clashes = ids2026.filter((id) => !id.endsWith("01"));
console.log(`      (${clashes.length} players needed 02 or higher, e.g. ${clashes.slice(0, 4).join(", ")})`);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASS");
process.exit(failures ? 1 : 0);
