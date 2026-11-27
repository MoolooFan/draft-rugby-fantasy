"use client";

import { useStatSeason } from "@/lib/players/useStatSeason";
import { useStatViewStore, type StatView } from "@/lib/players/statView";
import { useCoachName } from "@/lib/coach/name";
import { useEffect, useMemo, useState } from "react";

import { usePlayersStore, usePlayers } from "@/lib/players/store";
import { useCompareStore } from "@/lib/players/compareStore";
import { currentSeasonYear, statsSeasonYear } from "@/lib/season";
import { cachedJson } from "@/lib/cachedJson";
import { FixtureRow, TabCard } from "./playerCard/helpers";
import { buildFixturesForTeam, buildRoundsFromSheetRows, isFixtureCompleteAny, type PlayerRound } from "./playerCard/cardData";
import { CardHeader } from "./playerCard/CardHeader";
import { ActionBar, StatStrip } from "./playerCard/CardBars";
import { RoundBreakdownPopup } from "./playerCard/RoundBreakdownPopup";
import { HistoryTab, CoachTab } from "./playerCard/HistoryTab";
import { useLeagueStore } from "@/lib/league/store";
import { ResultsTab, StatsTab, FixturesTab } from "./playerCard/tabs";
import { playerPositions, positionsLabel } from "@/lib/players/positions";
import { POS_NAME } from "@/lib/draft/constants";
import { currentStatusText, jerseyLabel, statusKind, STATUS_TAG } from "@/lib/status/kind";

export type PlayerStatus = "starting" | "benched" | "out" | null;

export type PlayerCardTab = "Results" | "Stats" | "Fixtures" | "Transactions" | "AI Coach";

export type PlayerCardPlayer = {
  id: string;
  firstName: string;
  lastName: string;

  posAbbrev: string;
  posName: string;

  secondaryPosAbbrev?: string;
  secondaryPosName?: string;

  teamCode: string;
  teamName?: string;

  status?: "starting" | "benched" | string | null;
  weeklyStatus?: Record<string, string>; // can be {W1:..} or {statusW1:..}

  stats?: Record<string, number>;
};

export type PlayerCardAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
};

type PlayerCardModalProps = {
  open?: boolean;
  player: PlayerCardPlayer | null;
  status?: PlayerStatus;
  stats?: Record<string, number>;

  teamLabel?: string;
  initialTab?: PlayerCardTab;
  actions?: PlayerCardAction[];
  hideActions?: boolean;
  onClose: () => void;
};

/**
 * Shows nothing when closed or when there's no player; otherwise the card.
 * (Kept separate so the card's React hooks always run in the same order;
 * returning early in the middle of them could crash the page.)
 */
export function PlayerCardModal(props: PlayerCardModalProps) {
  if (props.open === false || !props.player) return null;
  return <PlayerCardModalInner {...props} player={props.player} />;
}

function PlayerCardModalInner({
  open = true,
  player,
  status = null,
  stats = {},

  teamLabel = "Stouty's Studs",
  initialTab = "Stats",
  actions = [
    { label: "Watch", onClick: () => {}, variant: "secondary" },
    { label: "Submit Claim", onClick: () => {}, variant: "primary" },
  ],
  hideActions = false,
  onClose,
}: PlayerCardModalProps & { player: PlayerCardPlayer }) {

const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const [rounds, setRounds] = useState<PlayerRound[]>([]);
const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
const [allRoundRows, setAllRoundRows] = useState<Record<string, any>[]>([]);
const [seasonWeeks, setSeasonWeeks] = useState<number[]>([]);
const [lastCompletedWeek, setLastCompletedWeek] = useState<number>(0);
// Results/Stats use the stats season (last season's until this season's first kickoff); the
// Fixtures tab always shows this season's draw.
const [statSeason, setStatSeason] = useState<number>(() => statsSeasonYear());
const { season: chosenStatSeason } = useStatSeason();
// The Stats tab's Per game / Total / Per 80 and 2026 / 2027 switches belong to this card: they
// start as the page has them, change only the Stats tab, and don't change the page's filters or
// the four numbers above the tabs (Ethan, 25 Nov 2026).
const [cardView, setCardView] = useState<StatView>(() => useStatViewStore.getState().view);
const [cardSeason, setCardSeason] = useState<number>(chosenStatSeason);
// another season's rounds for the Stats tab, labelled with whose and which season they are, so
// they can't show for the wrong player (React 19 rules: no clearing them in an effect)
const [cardSeasonData, setCardSeasonData] = useState<{ key: string; rounds: PlayerRound[] } | null>(null);
const [upcomingFixtures, setUpcomingFixtures] = useState<FixtureRow[]>([]);
const [upcomingWeeks, setUpcomingWeeks] = useState<number[]>([]);
const [upcomingLastCompleted, setUpcomingLastCompleted] = useState<number>(0);

// for the Results score breakdown popup
const [openBreakdown, setOpenBreakdown] = useState(false);
const [selectedRound, setSelectedRound] = useState<PlayerRound | null>(null);

  // Transactions (C3) are this league's, so only shown when you're in a league; AI Coach (C4) is a placeholder
  const leagueId = useLeagueStore((s) => s.activeLeagueId);
  const coachName = useCoachName();
  const tabs: PlayerCardTab[] = useMemo(
  () => (leagueId ? ["Stats", "Results", "Fixtures", "Transactions", "AI Coach"] : ["Stats", "Results", "Fixtures", "AI Coach"]),
  [leagueId]
);

  const [tab, setTab] = useState<PlayerCardTab>(initialTab);
  const openCompare = useCompareStore((s) => s.openWith);

// player is always set here (PlayerCardModal only renders this when it is)
const p = player;

// ensure sheet players are loaded (no-op if already loaded)
usePlayers();

// pull the authoritative player from sheets (status comes from the "status" column)
const sheetP = usePlayersStore((s) => s.getById(p.id));
const statusFromSheet = sheetP?.status ?? null;
const weeklyFromSheet = sheetP?.weeklyStatus ?? null;

// This week's status (team list / injury list), else the card status. A caller can force
// starting / benched.
const statusText = useMemo<string | null>(() => {
  if (status === "starting" || status === "benched") return status;
  return currentStatusText({ status: statusFromSheet, weeklyStatus: weeklyFromSheet ?? p.weeklyStatus });
}, [status, statusFromSheet, weeklyFromSheet, p.weeklyStatus]);
const statusK = statusKind(statusText);


// back to the tab asked for when the card opens again or shows another player (set while drawing)
const tabKey = `${initialTab}|${open ? 1 : 0}|${p.id}`;
const [tabFor, setTabFor] = useState(tabKey);
if (tabFor !== tabKey) {
  setTabFor(tabKey);
  setTab(initialTab);
}

// the Stats tab's own season, when it's not the one the rest of the card shows
useEffect(() => {
  if (!open || cardSeason === chosenStatSeason) return;
  let cancelled = false;
  const key = `${p.id}|${cardSeason}`;
  cachedJson<{ rows?: Record<string, unknown>[] }>(`/api/players/round-stats?season=${cardSeason}`)
    .then((j) => {
      if (!cancelled) setCardSeasonData({ key, rounds: buildRoundsFromSheetRows(Array.isArray(j?.rows) ? (j.rows as never) : [], p) });
    })
    .catch(() => {
      if (!cancelled) setCardSeasonData({ key, rounds: [] });
    });
  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, p.id, cardSeason, chosenStatSeason]);
const cardSeasonRounds = cardSeasonData?.key === `${p.id}|${cardSeason}` ? cardSeasonData.rounds : null;
const statsTabRounds = useMemo(() => (cardSeason === chosenStatSeason ? rounds : cardSeasonRounds ?? []), [cardSeason, chosenStatSeason, rounds, cardSeasonRounds]);
// Games Played / Starts for the season shown (Ethan, 20 Nov 2026): a game is a round he played
// in (minutes in the stats); a start is one of those where the team list (or a late change) had
// him in the starting XV. A player named to start who pulled out doesn't get either.
const statsTabCounts = useMemo(() => {
  const played = statsTabRounds.filter((r) => Number(r.minutes) > 0);
  return { gamesPlayed: played.length, starts: played.filter((r) => r.role === "starting").length };
}, [statsTabRounds]);

useEffect(() => {
  if (!open) return;

  let cancelled = false;

  async function load() {
    try {
      setLoading(true);
      setError(null);

      // shared with the rest of the site (lib/cachedJson): opening a card doesn't re-download them
      const statsYear = chosenStatSeason; // the 2026 / 2027 switch (default: lib/season statsSeasonYear)
      const thisYear = currentSeasonYear();
      const [roundJson, fixJson, upcomingJson] = await Promise.all([
        cachedJson<any>(`/api/players/round-stats?season=${statsYear}`),
        cachedJson<any>(`/api/fixtures/season?season=${statsYear}`),
        statsYear === thisYear ? Promise.resolve(null) : cachedJson<any>(`/api/fixtures/season?season=${thisYear}`),
      ]);

// /api/players/round-stats -> { ok: true, rows: [...] }
const roundRows: Record<string, any>[] = Array.isArray(roundJson?.rows) ? roundJson.rows : [];

// /api/fixtures/season -> { ok: true, fixtures: [...] }
const allFixtures: any[] = Array.isArray(fixJson?.fixtures) ? fixJson.fixtures : [];
// ✅ GLOBAL last completed week (from ALL fixtures, not team-only)
const completedWeeksGlobal = allFixtures
  .filter((f) => isFixtureCompleteAny(f))
  .map((f) => Number(f.week) || 0)
  .filter((w) => w > 0);

const lastW = completedWeeksGlobal.length ? Math.max(...completedWeeksGlobal) : 0;

// ✅ season weeks = every week number that exists in the fixtures sheet
const weeks = Array.from(
  new Set(
    allFixtures
      .map((f) => Number(f.week) || 0)
      .filter((w) => w > 0)
  )
).sort((a, b) => b - a); // newest first

// Convert to what the UI expects
const parsedRounds = buildRoundsFromSheetRows(roundRows, p);
const parsedFix = buildFixturesForTeam(allFixtures, p.teamCode);

// this season's draw for the Fixtures tab (the same as above once the season has started)
const upcomingAll: any[] = upcomingJson ? (Array.isArray(upcomingJson?.fixtures) ? upcomingJson.fixtures : []) : allFixtures;
const upcomingDone = upcomingAll.filter((f) => isFixtureCompleteAny(f)).map((f) => Number(f.week) || 0).filter((w) => w > 0);
const upcomingWeekList = Array.from(new Set(upcomingAll.map((f) => Number(f.week) || 0).filter((w) => w > 0))).sort((a, b) => b - a);

if (!cancelled) {
  setRounds(parsedRounds);
  setFixtures(parsedFix);
  setAllRoundRows(roundRows);
  setSeasonWeeks(weeks);
  setLastCompletedWeek(lastW); // ✅ add this
  setStatSeason(statsYear);
  setUpcomingFixtures(upcomingJson ? buildFixturesForTeam(upcomingAll, p.teamCode) : parsedFix);
  setUpcomingWeeks(upcomingJson ? upcomingWeekList : weeks);
  setUpcomingLastCompleted(upcomingJson ? (upcomingDone.length ? Math.max(...upcomingDone) : 0) : lastW);
}

    } catch (e: any) {
      if (!cancelled) setError(e?.message ?? "Failed to load data");
    } finally {
      if (!cancelled) setLoading(false);
    }
  }

  load();
  return () => {
    cancelled = true;
  };
}, [open, p.id, p.teamCode, chosenStatSeason]);

// Status strip: the tag, then the details (e.g. "Knee - 2 weeks", "Out - Personal reasons").
const statusStyle = !statusK
  ? null
  : statusK === "starting"
  ? { bg: "#bbf7d0", text: "#111827", chipBg: STATUS_TAG.starting.bg, chipFg: STATUS_TAG.starting.fg, label: jerseyLabel("Starting", statusText) }
  : statusK === "bench"
  ? { bg: "#FFE65B", text: "#111827", chipBg: "#3b2f00", chipFg: "#FFE65B", label: jerseyLabel("Bench", statusText) }
  : {
      bg: "#C0020D",
      text: "#ffffff",
      chipBg: "#ffffff",
      chipFg: "#C0020D",
      label: /^(out|suspended|injured)$/i.test(String(statusText).trim()) ? STATUS_TAG[statusK].name : String(statusText).trim(),
    };

  // e.g. "CE, OB, FH" (the full player record has all three positions); a player with only one
  // position has it written out, e.g. "Outside Back" (Ethan, 20 Nov 2026)
  const cardPositions = playerPositions(sheetP ?? p);
  const positionLabel = cardPositions.length === 1 ? POS_NAME[cardPositions[0]] ?? cardPositions[0] : positionsLabel(sheetP ?? p);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
      {/* Backdrop */}
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "94%",
          maxWidth: 520,
          maxHeight: "92svh",
        }}
      >
        <div
  key={p.id} // ✅ add this
  style={{
    borderRadius: 14,
    background: "rgba(255,255,255,0.20)",
    backdropFilter: "blur(12px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    overflow: "hidden",
    color: "white",
    display: "flex",
    flexDirection: "column",
    maxHeight: "92svh",
  }}
>

          <CardHeader p={p} statusStyle={statusStyle} statusK={statusK} positionLabel={positionLabel} teamLabel={teamLabel} onClose={onClose} />

{/* Stat strip */}
<StatStrip p={p} rounds={rounds} allRoundRows={allRoundRows} />

{/* Tabs + content */}
<div
  style={{
    background: "rgba(255,255,255,0.92)",
    color: "#0f172a",
    position: "relative",
    zIndex: 6,

    // ✅ fixed white section height across all tabs
    height: "48svh", //content size area
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }}
>

            <div
              style={{
                padding: 10,
                display: "flex",
                gap: 6,
                overflowX: "auto",
                borderBottom: "1px solid rgba(0,0,0,0.10)",
              }}
            >
              {tabs.map((t) => {
                const active = t === tab;
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      flex: "1 0 auto",
                      padding: "0 8px",
                      height: 28,
                      borderRadius: 10,
                      background: active ? "rgba(15, 35, 83, 0.1)" : "rgba(0,0,0,0.05)",
                      border: active
                        ? "1px solid rgba(15,23,42,0.35)"
                        : "1px solid rgba(0,0,0,0.12)",
                      color: "#0f172a",
                      fontWeight: 500,
                      fontSize: tabs.length > 4 ? 11 : 12,
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                    }}
                  >
                    {t === "AI Coach" ? coachName : t}
                  </button>
                );
              })}
            </div>

            <div
  style={{
    padding: 10,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    flex: 1,        // ✅ take remaining space in the white area
    minHeight: 0,   // ✅ important so flex scrolling works correctly
  }}
>

              {error ? (
  <TabCard>
    <div style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</div>
  </TabCard>
) : loading ? (
  <TabCard>
    <div style={{ opacity: 0.7 }}>Loading…</div>
  </TabCard>
) : tab === "Results" ? (
  <ResultsTab
  rounds={rounds}
  fixtures={fixtures}
  seasonWeeks={seasonWeeks}
  lastCompletedWeek={lastCompletedWeek}  // ✅ add
  teamCode={p.teamCode}
  onOpenBreakdown={(r) => {
    setSelectedRound(r);
    setOpenBreakdown(true);
  }}
/>

) : tab === "Stats" ? (
  <StatsTab
    player={p}
    rounds={statsTabRounds}
    gamesPlayed={statsTabCounts.gamesPlayed}
    starts={statsTabCounts.starts}
    onCompare={() => openCompare(p.id)}
    view={cardView}
    onView={setCardView}
    season={cardSeason}
    onSeason={setCardSeason}
  />

) : tab === "Fixtures" ? (
  <FixturesTab
  fixtures={upcomingFixtures}
  teamCode={p.teamCode}
  seasonWeeks={upcomingWeeks}
  lastCompletedWeek={upcomingLastCompleted}
/>

) : tab === "Transactions" && leagueId ? (
  <HistoryTab leagueId={leagueId} playerId={p.id} />

) : tab === "AI Coach" ? (
  <CoachTab playerId={p.id} />

) : null

}
            </div>
          </div>

          {/* Footer actions */}
          <ActionBar actions={actions} hideActions={hideActions} />

        </div>
      </div>      
      <RoundBreakdownPopup open={openBreakdown} onClose={() => setOpenBreakdown(false)} selectedRound={selectedRound} fixtures={fixtures} p={p} statSeason={statSeason} />

    </div>
  );
}

