// lib/status/match.ts
// Matches names from the official articles to players in the database, allowing for spelling
// slips. Anything that isn't a clear match is returned as a flag for Ethan to check.

export type MatchPlayer = { id: string; firstName: string; lastName: string; teamCode: string };
export type MatchResult =
  | { kind: "match"; player: MatchPlayer }
  | { kind: "flag"; problem: string; suggestion: MatchPlayer | null };

/** "Joshua Fusitu’a" -> "joshua fusitua"; accents, macrons, apostrophes and hyphens ignored. */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[‘’'`’.]/g, "")
    .replace(/[-–]/g, " ")
    .replace(/[^a-z ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const full = (p: MatchPlayer) => normName(`${p.firstName} ${p.lastName}`);

/** Find the player a name refers to, preferring the given team. */
export function matchName(rawName: string, teamCode: string, players: MatchPlayer[]): MatchResult {
  const name = normName(rawName);
  const words = name.split(" ");
  const last = words.slice(1).join(" ") || words[0];
  const first = words[0];
  const team = players.filter((p) => p.teamCode === teamCode);

  // 1. exact full name in the team
  const exact = team.filter((p) => full(p) === name);
  if (exact.length === 1) return { kind: "match", player: exact[0] };

  // 2. same surname and first initial in the team (e.g. "Tom" / "Thomas")
  const initial = team.filter((p) => normName(p.lastName) === last && normName(p.firstName)[0] === first[0]);
  if (initial.length === 1) return { kind: "match", player: initial[0] };

  // 2b. extra or missing names, e.g. "Seuseu Naitoa Ah Kuoi" = "Naitoa Ah Kuoi": the player's
  //     whole surname ends the article name and his first name appears in it
  const contained = team.filter((p) => {
    const ln = normName(p.lastName);
    const fn = normName(p.firstName).split(" ")[0];
    return (name.endsWith(` ${ln}`) || name === ln) && words.includes(fn);
  });
  if (contained.length === 1) return { kind: "match", player: contained[0] };

  // 3. exact name but listed for another team (moved clubs?) -> flag
  const elsewhere = players.filter((p) => full(p) === name);
  if (elsewhere.length === 1) {
    return { kind: "flag", problem: `Named for ${teamCode} but our list has him at ${elsewhere[0].teamCode}`, suggestion: elsewhere[0] };
  }

  // 4. close spelling in the team -> flag with a suggestion
  const close = team
    .map((p) => ({ p, d: editDistance(full(p), name) }))
    .filter((x) => x.d <= 3)
    .sort((a, b) => a.d - b.d);
  if (close.length && (close.length === 1 || close[0].d < close[1].d)) {
    return { kind: "flag", problem: `Spelt differently: is "${rawName}" ${close[0].p.firstName} ${close[0].p.lastName}?`, suggestion: close[0].p };
  }

  return { kind: "flag", problem: `"${rawName}" isn't in our ${teamCode} players`, suggestion: null };
}
