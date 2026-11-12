// lib/players/ids.ts
// Player ids (plan item F1, agreed with Ethan Nov 2026): Basketball-Reference style, no
// punctuation - the first 5 letters of the last name, the first 2 of the first name, then a
// number for players who'd otherwise clash: Damian McKenzie -> mckenda01, Tanielu Tele'a ->
// teleata01, Naitoa Ah Kuoi -> ahkuona01. Accents and macrons are dropped (Tāne -> tane).
// A player keeps his id every season (matched by his playfantasyrugby id, else his old id), so
// rosters, stats and history always line up. Numbers are never reused.

/** Lower-case a-z only (accents removed, spaces / hyphens / apostrophes dropped). */
export function idLetters(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** The id without its number, e.g. "mckenda". */
export function idStem(firstName: string | null | undefined, lastName: string | null | undefined): string {
  const last = idLetters(lastName);
  const first = idLetters(firstName);
  const stem = (last || first).slice(0, 5) + (last ? first.slice(0, 2) : "");
  return stem || "player";
}

export const PLAYER_ID_RE = /^[a-z]{1,7}\d{2,}$/;

/** A new id for this name that isn't in `taken` (stem + 01, 02, ...). Adds it to `taken`. */
export function newPlayerId(firstName: string, lastName: string, taken: Set<string>): string {
  const stem = idStem(firstName, lastName);
  for (let n = 1; ; n++) {
    const id = `${stem}${String(n).padStart(2, "0")}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

export type IdPlayer = {
  season: number;
  oldId: string;
  firstName: string;
  lastName: string;
  externalId: number | null;
  draftRank: number | null;
};

/**
 * New ids for every player (all seasons at once). The same person in several seasons gets one
 * id: matched by playfantasyrugby id, else by his old id. Earlier seasons and better draft
 * ranks get the lower numbers. Returns old id (lower case) -> new id, per season.
 */
export function assignPlayerIds(players: IdPlayer[], alreadyTaken: Iterable<string> = []): Map<string, string> {
  const personKey = (p: IdPlayer) => (p.externalId ? `x:${p.externalId}` : `o:${p.oldId.toLowerCase()}`);
  // one entry per person: the earliest season they appear in decides their place in the order
  const people = new Map<string, IdPlayer>();
  for (const p of players) {
    const k = personKey(p);
    const cur = people.get(k);
    if (!cur || p.season < cur.season || (p.season === cur.season && (p.draftRank ?? 1e9) < (cur.draftRank ?? 1e9))) people.set(k, p);
  }
  const order = [...people.entries()].sort(
    ([, a], [, b]) =>
      a.season - b.season ||
      (a.draftRank ?? 1e9) - (b.draftRank ?? 1e9) ||
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName) ||
      a.oldId.localeCompare(b.oldId)
  );
  const taken = new Set<string>(alreadyTaken);
  const idByPerson = new Map<string, string>();
  for (const [k, p] of order) {
    idByPerson.set(k, PLAYER_ID_RE.test(p.oldId) ? (taken.add(p.oldId), p.oldId) : newPlayerId(p.firstName, p.lastName, taken));
  }
  const out = new Map<string, string>();
  for (const p of players) out.set(`${p.season}|${p.oldId.toLowerCase()}`, idByPerson.get(personKey(p))!);
  return out;
}
