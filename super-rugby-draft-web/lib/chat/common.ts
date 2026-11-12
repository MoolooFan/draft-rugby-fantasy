// lib/chat/common.ts
// League chat and direct messages (Ethan, 13 Nov 2026): conversation keys, automated post text,
// and taunts. Pure code (tested in scripts/tests/chat.test.ts); the database side is
// lib/chat/server.ts.
//
// Conversations ("channels"):
//   "league"                 the league chat: everyone, plus automated posts
//   "dm:<teamA>:<teamB>"     a one-to-one chat (the two team ids in alphabetical order)

export const LEAGUE_CHANNEL = "league";

export function dmChannel(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

/** The two teams of a direct-message channel, or null for the league chat / anything else. */
export function dmTeams(channel: string): [string, string] | null {
  const m = /^dm:([^:]+):([^:]+)$/.exec(channel);
  return m ? [m[1], m[2]] : null;
}

/** Can this team read and write this conversation? */
export function canUseChannel(channel: string, teamId: string, leagueTeamIds: string[]): boolean {
  if (channel === LEAGUE_CHANNEL) return true;
  const t = dmTeams(channel);
  return !!t && t[0] !== t[1] && t.includes(teamId) && t.every((x) => leagueTeamIds.includes(x));
}

export type ChatKind = "text" | "image" | "trade" | "system" | "taunt";

/** Which notification setting (lib/notifications/types.ts) mutes a message. */
export function muteKeyFor(m: { channel: string; kind: ChatKind; sender_team_id: string | null }): "chat_dm" | "chat_league" | "chat_auto" | "taunts" {
  if (m.kind === "taunt") return "taunts";
  if (m.channel === LEAGUE_CHANNEL) return m.sender_team_id ? "chat_league" : "chat_auto";
  return "chat_dm";
}

// ---------------------------------------------------------------------------
// Automated posts

type Move = { teamName: string; added: string | null; dropped: string | null };

const moveText = (m: Move) =>
  m.added ? `${m.teamName}: +${m.added}${m.dropped ? ` (−${m.dropped})` : ""}` : `${m.teamName}: −${m.dropped} (dropped)`;

/** Waiver report, sent when a round's waivers have run (null = nothing to report). */
export function waiverReportText(roundName: string, moves: Move[]): string | null {
  if (!moves.length) return null;
  return [`Waivers for ${roundName}:`, ...moves.map(moveText)].join("\n");
}

/** Free agent report, sent at the lineup deadline: every add / drop since waivers ran. */
export function freeAgentReportText(roundName: string, moves: Move[]): string | null {
  if (!moves.length) return null;
  return [`Free agent moves before ${roundName}:`, ...moves.map(moveText)].join("\n");
}

/** A trade accepted, for the league chat. */
export function tradeText(a: { teamName: string; gets: string[] }, b: { teamName: string; gets: string[] }): string {
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "nothing");
  return `Trade done: ${a.teamName} get ${list(a.gets)}; ${b.teamName} get ${list(b.gets)}.`;
}

/** The league's weekly recap for the league chat. */
export function leagueRecapText(input: {
  roundName: string;
  games: Array<{ home: string; away: string | null; homeScore: number | null; awayScore: number | null; label?: string | null }>;
  crown?: { teams: string[]; score: number } | null;
  spoon?: { teams: string[]; score: number } | null;
  topPlayer?: { name: string; points: number; teamName: string } | null;
  ladderTop?: string[];
}): string {
  const lines = [`${input.roundName} results:`];
  for (const g of input.games) {
    if (!g.away) lines.push(`${g.home}: bye`);
    else lines.push(`${g.label ? `${g.label}: ` : ""}${g.home} ${g.homeScore ?? "–"} – ${g.awayScore ?? "–"} ${g.away}`);
  }
  if (input.crown) lines.push(`👑 Top score: ${input.crown.teams.join(" & ")} (${input.crown.score})`);
  if (input.spoon) lines.push(`🥄 Lowest score: ${input.spoon.teams.join(" & ")} (${input.spoon.score})`);
  if (input.topPlayer) lines.push(`⭐ Player of the round: ${input.topPlayer.name}, ${input.topPlayer.points} pts for ${input.topPlayer.teamName}`);
  if (input.ladderTop?.length) lines.push(`Top of the ladder: ${input.ladderTop.map((t, i) => `${i + 1}. ${t}`).join("  ")}`);
  return lines.join("\n");
}

/** The shield after a round: kept or taken. */
export function shieldReportText(name: string, e: { kind: "awarded" | "defended" | "won"; holder: string; other: string | null; homeScore: number | null; awayScore: number | null; defences: number }): string {
  const score = e.homeScore != null && e.awayScore != null ? ` ${e.homeScore}–${e.awayScore}` : "";
  if (e.kind === "awarded") return `🛡️ ${e.holder} win ${name} with the top score of the round.`;
  if (e.kind === "won") return `🛡️ ${e.holder} take ${name} off ${e.other}!${score ? ` (${score.trim()})` : ""}`;
  return `🛡️ ${e.holder} keep ${name}, beating ${e.other}${score ? ` ${score.trim()}` : ""}. ${e.defences} defence${e.defences === 1 ? "" : "s"}.`;
}

// ---------------------------------------------------------------------------
// Taunts (like ESPN fantasy): when your player scores a try, or your opponent's player gets a
// yellow / red card, you can send your opponent a ready-made taunt.

export type TauntKind = "try" | "card";
export type TauntEvent = { key: string; kind: TauntKind; playerId: string; card?: "yellow" | "red" };

/** The events you can taunt about this week, from your starters' and your opponent's starters' stats. */
export function tauntEvents(input: {
  week: number;
  myStarters: string[];
  opponentStarters: string[];
  statsOf: (playerId: string) => { tries?: number; yellowCards?: number; redCards?: number } | null;
}): TauntEvent[] {
  const out: TauntEvent[] = [];
  for (const id of input.myStarters) {
    const s = input.statsOf(id);
    if (s && Number(s.tries) > 0) out.push({ key: `try:${input.week}:${id}`, kind: "try", playerId: id });
  }
  for (const id of input.opponentStarters) {
    const s = input.statsOf(id);
    if (s && Number(s.redCards) > 0) out.push({ key: `card:${input.week}:${id}`, kind: "card", playerId: id, card: "red" });
    else if (s && Number(s.yellowCards) > 0) out.push({ key: `card:${input.week}:${id}`, kind: "card", playerId: id, card: "yellow" });
  }
  return out;
}

/** Fill in a taunt line: {player}, {opponent}, {card}. */
export function fillTaunt(line: string, v: { player: string; opponent: string; card?: string }): string {
  return line.replace(/\{player\}/g, v.player).replace(/\{opponent\}/g, v.opponent).replace(/\{card\}/g, v.card ?? "");
}
