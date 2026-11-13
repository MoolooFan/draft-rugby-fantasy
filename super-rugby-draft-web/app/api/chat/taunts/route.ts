// app/api/chat/taunts/route.ts
// Taunts (Ethan, 13 Nov 2026, like ESPN fantasy). GET ?leagueId&week: what you can taunt your
// opponent about this round (your starters' tries, their starters' yellow / red cards), which
// you've already sent, and the ready-made lines. POST { leagueId, week, eventKey, lineId }: send
// one to your opponent's DM (checked on the server; one taunt per moment).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toHttpError } from "@/lib/league/serverAuth";
import { chatContext } from "@/lib/chat/access";
import { dmChannel, fillTaunt, tauntEvents, type TauntEvent } from "@/lib/chat/common";
import { postMessage } from "@/lib/chat/server";
import { getSeason, realRoundsForWeek, SEASONS } from "@/lib/season";
import { statCountsFromRaw } from "@/lib/scoring";
import { STARTER_SLOTS } from "@/lib/scoring/week";
import { getLeagueScoringRules } from "@/lib/scoring/leagueRules";
import { cardLine, pickArt, skinColour, teamColours, tryLine, type TauntGraphic } from "@/lib/chat/tauntArt";
import { loadSkinTones, loadTauntArt, loadTeamColours } from "@/lib/chat/tauntArtServer";

const TEAM_NAME: Record<string, string> = {
  BLU: "Blues", BRU: "Brumbies", CHI: "Chiefs", CRU: "Crusaders", DRU: "Drua", FOR: "Force",
  HIG: "Highlanders", HUR: "Hurricanes", MOA: "Moana", MOP: "Moana", RED: "Reds", WAR: "Waratahs",
};

export const dynamic = "force-dynamic";

async function context(leagueId: string, week: number) {
  const ctx = await chatContext(leagueId);
  const { data: lg } = await supabaseAdmin.from("leagues").select("season").eq("id", leagueId).maybeSingle();
  const season = Number(lg?.season);
  const { data: games } = await supabaseAdmin.from("league_matchups").select("weeks, home_team_id, away_team_id").eq("league_id", leagueId);
  const game = (games ?? []).find((g) => (g.weeks ?? []).map(Number).includes(week) && (g.home_team_id === ctx.teamId || g.away_team_id === ctx.teamId) && g.home_team_id && g.away_team_id);
  const opponentId = game ? (game.home_team_id === ctx.teamId ? game.away_team_id : game.home_team_id) : null;
  if (!opponentId || !SEASONS[season]) return { ctx, season, opponentId: null, events: [] as TauntEvent[], names: new Map<string, string>(), teamOf: new Map<string, string>(), totals: new Map<string, { tries: number; yellowCards: number; redCards: number }>() };

  // each team's starters this round (its saved lineup, or its latest earlier one)
  const starters = async (teamId: string) => {
    const { data } = await supabaseAdmin.from("team_selections").select("lineup, week").eq("league_id", leagueId).eq("team_id", teamId).lte("week", week).order("week", { ascending: false }).limit(1);
    const lineup = (data?.[0]?.lineup ?? {}) as Record<string, { id?: string } | null>;
    return STARTER_SLOTS.map((s) => lineup[s]?.id).filter((x): x is string => !!x);
  };
  const [mine, theirs] = await Promise.all([starters(ctx.teamId), starters(opponentId)]);
  const rounds = realRoundsForWeek(getSeason(season), week);
  const ids = [...mine, ...theirs];
  const { data: rows } = ids.length
    ? await supabaseAdmin.from("player_round_stats").select("internal_player_id, raw_json").eq("season", season).in("round", rounds).in("internal_player_id", ids)
    : { data: [] };
  const totals = new Map<string, { tries: number; yellowCards: number; redCards: number }>();
  for (const r of rows ?? []) {
    const c = statCountsFromRaw((r.raw_json as { stats?: unknown })?.stats);
    const t = totals.get(r.internal_player_id) ?? { tries: 0, yellowCards: 0, redCards: 0 };
    t.tries += Number(c.tries) || 0;
    t.yellowCards += Number(c.yellowCards) || 0;
    t.redCards += Number(c.redCards) || 0;
    totals.set(r.internal_player_id, t);
  }
  const events = tauntEvents({ week, myStarters: mine, opponentStarters: theirs, statsOf: (id) => totals.get(id) ?? null });
  const { data: players } = ids.length ? await supabaseAdmin.from("players").select("id, first_name, last_name, team_code").eq("season", season).in("id", ids) : { data: [] };
  const names = new Map((players ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const teamOf = new Map((players ?? []).map((p) => [p.id, String(p.team_code ?? "")]));
  return { ctx, season, opponentId, events, names, teamOf, totals };
}

/** The graphic sent with a taunt (lib/chat/tauntArt.ts): points card, then TRY! or the card. */
async function tauntGraphic(input: {
  leagueId: string;
  season: number;
  week: number;
  ev: TauntEvent;
  name: string;
  teamCode: string;
  tries: number;
}): Promise<TauntGraphic | null> {
  try {
    const [rules, saved] = await Promise.all([getLeagueScoringRules(supabaseAdmin, input.leagueId), loadTeamColours(supabaseAdmin)]);
    const colours = teamColours(input.teamCode, saved);
    const teamName = TEAM_NAME[input.teamCode.toUpperCase()] ?? input.teamCode;
    if (input.ev.kind === "card") {
      const card = input.ev.card === "red" ? "red" : "yellow";
      const points = card === "red" ? rules.perEvent.redCards : rules.perEvent.yellowCards;
      return { type: "card", card, points, line: cardLine(input.name, card), teamName, colours };
    }
    const [arts, tones, status] = await Promise.all([
      loadTauntArt(supabaseAdmin, { activeOnly: true }),
      loadSkinTones(supabaseAdmin, [input.ev.playerId]),
      supabaseAdmin.from("player_week_status").select("status").eq("season", input.season).eq("week", input.week).eq("player_id", input.ev.playerId).maybeSingle(),
    ]);
    const num = String(status.data?.status ?? "").match(/#\s*(\d{1,2})/);
    return {
      type: "try",
      points: rules.perEvent.tries * Math.max(1, input.tries),
      line: tryLine(input.name, Math.max(1, input.tries)),
      teamName,
      colours,
      skin: skinColour(tones.get(input.ev.playerId)),
      art: pickArt(arts, input.ev.playerId),
      number: num ? Number(num[1]) : null,
    };
  } catch {
    return null; // the taunt still goes, just without the graphic
  }
}

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams;
    const leagueId = String(q.get("leagueId") ?? "").trim();
    const week = Number(q.get("week"));
    if (!leagueId || !Number.isInteger(week)) return NextResponse.json({ ok: false, error: "Missing leagueId/week" }, { status: 400 });
    const { ctx, opponentId, events, names } = await context(leagueId, week);
    const { data: sent } = await supabaseAdmin
      .from("chat_messages")
      .select("dedupe_key")
      .eq("league_id", leagueId)
      .like("dedupe_key", `taunt:${ctx.teamId}:%`);
    const sentKeys = new Set((sent ?? []).map((s) => String(s.dedupe_key).replace(`taunt:${ctx.teamId}:`, "")));
    const { data: lines } = await supabaseAdmin.from("taunt_lines").select("id, kind, text").eq("active", true).order("created_at");
    return NextResponse.json({
      ok: true,
      opponentId,
      events: events.map((e) => ({ ...e, playerName: names.get(e.playerId) ?? e.playerId, sent: sentKeys.has(e.key) })),
      lines: lines ?? [],
    });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const leagueId = String(b?.leagueId ?? "").trim();
    const week = Number(b?.week);
    const eventKey = String(b?.eventKey ?? "").trim();
    const lineId = String(b?.lineId ?? "").trim();
    if (!leagueId || !Number.isInteger(week) || !eventKey || !lineId) return NextResponse.json({ ok: false, error: "Missing details" }, { status: 400 });
    const { ctx, season, opponentId, events, names, teamOf, totals } = await context(leagueId, week);
    const ev = events.find((e) => e.key === eventKey);
    if (!opponentId || !ev) return NextResponse.json({ ok: false, error: "Nothing to taunt about there" }, { status: 400 });
    const { data: line } = await supabaseAdmin.from("taunt_lines").select("text, kind").eq("id", lineId).eq("active", true).maybeSingle();
    if (!line || line.kind !== ev.kind) return NextResponse.json({ ok: false, error: "Pick a taunt" }, { status: 400 });
    const opponent = ctx.teams.find((t) => t.id === opponentId)?.name ?? "mate";
    await postMessage(supabaseAdmin, {
      leagueId,
      channel: dmChannel(ctx.teamId, opponentId),
      senderTeamId: ctx.teamId,
      kind: "taunt",
      body: fillTaunt(line.text, { player: names.get(ev.playerId) ?? "your man", opponent, card: ev.card }),
      meta: {
        event: ev,
        week,
        graphic: await tauntGraphic({
          leagueId,
          season,
          week,
          ev,
          name: names.get(ev.playerId) ?? "Your man",
          teamCode: teamOf.get(ev.playerId) ?? "",
          tries: totals.get(ev.playerId)?.tries ?? 1,
        }),
      },
      dedupeKey: `taunt:${ctx.teamId}:${ev.key}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { msg, status } = toHttpError(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
