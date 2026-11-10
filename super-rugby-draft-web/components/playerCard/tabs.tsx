"use client";
// components/playerCard/tabs.tsx
// (moved out of PlayerCardModal.tsx unchanged)
import { useMemo } from "react";

import { FixtureRow, TabCard, computeGames, totalDerived, playerGetsScrumPointsForCard, StatRow, perGameDerived, teamLogoSrc, formatKickoffLocal, fdrTheme } from "./helpers";

export function StatsTab({
  player,
  rounds,
  gamesPlayed,
  starts,
}: {
  player: {
    posAbbrev?: string;
    secondaryPosAbbrev?: string;
  };
  rounds: any[];
  gamesPlayed?: number;
  starts?: number;
}) {
  const gp =
    typeof gamesPlayed === "number" && gamesPlayed > 0
      ? gamesPlayed
      : computeGames(rounds);

  const st = typeof starts === "number" ? starts : undefined;

  // Top totals
  const triesTotal = totalDerived(rounds, "tries");
  const tryAssistsTotal = totalDerived(rounds, "tryAssists");

  // Per-game single-value rows (match screenshot order)
    const allPerGameRows: { label: string; key: string }[] = [
    { label: "Line Breaks", key: "lineBreaks" },
    { label: "Line Break Assists", key: "lineBreakAssists" },
    { label: "Defenders Beaten", key: "defendersBeaten" },
    { label: "Metres Gained", key: "metresGained" },
    { label: "Offloads", key: "offloads" },
    { label: "Tackles", key: "tackles" },
    { label: "Turnovers Forced", key: "turnoversForced" },
    { label: "Interceptions", key: "interceptions" },
    { label: "Successful 50:22s", key: "fiftyTwentyTwos" },
    { label: "Penalties Conceded", key: "penaltiesConceded" },
    { label: "Errors", key: "errors" },
    { label: "Lineouts Won", key: "lineoutsWon" },
    { label: "Lineout Steals", key: "lineoutSteals" },
    { label: "Lineout Errors", key: "lineoutErrors" },
    { label: "Scrums Won", key: "scrumsWon" },
    { label: "Conversions", key: "conversions" },
    { label: "Penalty Goals", key: "penaltyGoals" },
    { label: "Drop Goals", key: "dropGoals" },
  ];

  const shouldShowPerGameRow = (key: string) => {
    const total = totalDerived(rounds, key);

    // Only props / hookers should see scrums won
    if (key === "scrumsWon") {
      return playerGetsScrumPointsForCard(player) && total > 0;
    }

    // Only show these if non-zero
    if (
      key === "interceptions" ||
      key === "fiftyTwentyTwos" ||
      key === "lineoutsWon" ||
      key === "lineoutSteals" ||
      key === "lineoutErrors"
    ) {
      return total > 0;
    }

    // Show kicking rows if either made OR missed is non-zero
    if (key === "conversions") {
      return totalDerived(rounds, "conversions") > 0 || totalDerived(rounds, "conversionsMissed") > 0;
    }

    if (key === "penaltyGoals") {
      return totalDerived(rounds, "penaltyGoals") > 0 || totalDerived(rounds, "penaltyGoalsMissed") > 0;
    }

    if (key === "dropGoals") {
      return totalDerived(rounds, "dropGoals") > 0 || totalDerived(rounds, "dropGoalsMissed") > 0;
    }

    // Everything else stays visible
    return true;
  };

  const perGameRows = allPerGameRows.filter((r) => shouldShowPerGameRow(r.key));

  // Map which rows have "Missed"
  const missedKeyByMadeKey: Record<string, string> = {
    tackles: "tacklesMissed",
    conversions: "conversionsMissed",
    penaltyGoals: "penaltyGoalsMissed",
    dropGoals: "dropGoalsMissed",
  };

  // Totals section
  const totalRows: { label: string; key: string }[] = [
    { label: "Yellow Cards", key: "yellowCards" },
    { label: "Red Cards", key: "redCards" },
  ];

  // Formatting to match screenshot (mostly 1dp, but "-" when no games)
  function fmtPerGame(val: number) {
    if (!gp) return "-";
    // If it’s basically an integer, show 0dp? Screenshot shows decimals often, so keep 1dp always.
    return val.toFixed(1);
  }

  return (
    <TabCard>
      <div
        style={{
          display: "grid",
          gap: 0,
          borderTop: "1px solid rgba(0,0,0,0.18)", // top rule like screenshot
        }}
      >
        {/* === Top rows === */}
        <StatRow
          label="Games Played"
          right={gp ? String(gp) : "-"}
          right2={typeof st === "number" ? String(st) : "-"}
          right2Label="Starts"
        />
        <StatRow label="Tries Scored" right={triesTotal ? String(triesTotal) : "-"} />
        <StatRow label="Try Assists" right={tryAssistsTotal ? String(tryAssistsTotal) : "-"} />

        {/* divider */}
        <div style={{ height: 10 }} />

        {/* Per Game header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px",
            padding: "6px 0",
            borderBottom: "1px solid rgba(0,0,0,0.18)",
            alignItems: "end",
          }}
        >
          <div />
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.6, fontWeight: 800 }}>
            Per Game
          </div>
        </div>

        {/* === Per game rows === */}
        {perGameRows.map((r) => {
          const missedKey = missedKeyByMadeKey[r.key];
          const made = gp ? perGameDerived(rounds, r.key) : 0;

          // If it's a "missed" row, show missed underneath like screenshot
          if (missedKey) {
            const missed = gp ? perGameDerived(rounds, missedKey) : 0;

            return (
              <StatRow
                key={r.key}
                label={r.label}
                right={gp ? fmtPerGame(made) : "-"}
                subRight={gp ? fmtPerGame(missed) : "-"}

              />
            );
          }

          return (
            <StatRow
              key={r.key}
              label={r.label}
              right={gp ? fmtPerGame(made) : "-"}
            />
          );
        })}

        {/* divider */}
        <div style={{ height: 10 }} />

        {/* Total header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px",
            padding: "6px 0",
            borderBottom: "1px solid rgba(0,0,0,0.18)",
            alignItems: "end",
          }}
        >
          <div />
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.6, fontWeight: 800 }}>
            Total
          </div>
        </div>

        {/* === Totals === */}
        {totalRows.map((r) => (
          <StatRow
            key={r.key}
            label={r.label}
            right={String(totalDerived(rounds, r.key) || "-")}
          />
        ))}
      </div>
    </TabCard>
  );
}

export function ResultsTab({
  rounds,
  fixtures,
  seasonWeeks,
  lastCompletedWeek,
  teamCode,
  onOpenBreakdown,
}: {
  rounds: any[];
  fixtures: FixtureRow[];
  seasonWeeks: number[];
  lastCompletedWeek: number; // ✅ add
  teamCode: string;
  onOpenBreakdown: (r: any) => void;
}) {

  // Map player rounds by week so we can show "-" if they didn't play
  const roundByWeek = useMemo(() => {
    const m = new Map<number, any>();
    for (const r of rounds ?? []) {
      const w = Number(r?.week) || 0;
      if (w > 0) m.set(w, r);
    }
    return m;
  }, [rounds]);

  // Map team fixtures by week so we can show opponent/bye
  const fixtureByWeek = useMemo(() => {
    const m = new Map<number, FixtureRow>();
    for (const f of fixtures ?? []) {
      const w = Number(f?.week) || 0;
      if (w > 0) m.set(w, f);
    }
    return m;
  }, [fixtures]);

  // Build one row per season week
const rows = useMemo(() => {

  // ✅ Only show weeks up to last completed week
  const weeks = (seasonWeeks ?? [])
    .map((w) => Number(w) || 0)
    .filter((w) => w > 0 && w <= lastCompletedWeek)
    .sort((a, b) => b - a);

  const TEAM_NAME_BY_CODE: Record<string, string> = {
    BLU: "Blues",
    BRU: "Brumbies",
    CHI: "Chiefs",
    CRU: "Crusaders",
    DRU: "Drua",
    FOR: "Force",
    HIG: "Highlanders",
    HUR: "Hurricanes",
    MOA: "Moana Pasifika",
    RED: "Reds",
    WAR: "Waratahs",
  };

  return weeks.map((w) => {
    const fx = fixtureByWeek.get(w);
    const isBye = !fx || !fx.opponent;

    const oppCode = isBye ? "" : String(fx.opponent);
    const oppName = TEAM_NAME_BY_CODE[oppCode] ?? oppCode;
    const ha = isBye ? "" : fx.homeAway ? ` (${fx.homeAway})` : "";

    const r = roundByWeek.get(w) ?? null;

    let gameScoreLabel = "";
    if (fx && !isBye) {
      const hs = fx.homeScore;
      const as = fx.awayScore;

      const hasScore =
        hs != null &&
        as != null &&
        Number.isFinite(Number(hs)) &&
        Number.isFinite(Number(as));

      if (hasScore) {
        gameScoreLabel = fx.homeAway === "A" ? `${as} - ${hs}` : `${hs} - ${as}`;
      }
    }

    return {
      week: w,
      opponentLabel: isBye ? "BYE" : `v ${oppName}${ha}`,
      gameScoreLabel,
      isBye,
      oppCode: isBye ? null : oppCode,
      round: r,
    };
  });
}, [fixtures, seasonWeeks, fixtureByWeek, roundByWeek]);

  if (!rows.length) return <TabCard>No results yet.</TabCard>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((row) => {
  if (row.isBye) {
    return (
      <div
        key={`wk${row.week}`}
        style={{
          borderRadius: 12,
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          padding: 10,
          display: "grid",
          gridTemplateColumns: "34px 1fr",
          gap: 10,
          alignItems: "center",
          fontSize: 12,
          fontWeight: 900,
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", opacity: 0.6 }}>
          {row.week}
        </div>
        <div style={{ opacity: 0.75 }}>BYE</div>
      </div>
    );
  }

  const hasPlayed = !!row.round;
  const pts = hasPlayed ? (row.round.points ?? 0) : null;

  return (
    <div
      key={`wk${row.week}`}
      style={{
        borderRadius: 12,
        background: "white",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: 10,
        display: "grid",
        gridTemplateColumns: "34px 1fr 40px",
        gap: 10,
        alignItems: "center",
        fontSize: 12,
        fontWeight: 900,
      }}
    >
          
            {/* week number (far left) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
  <div style={{ opacity: 0.6 }}>{row.week}</div>
  {row.oppCode ? (
    <img
      src={teamLogoSrc(row.oppCode)}
      alt=""
      draggable={false}
      style={{ width: 20, height: 20, objectFit: "contain", display: "block" }}
    />
  ) : null}
</div>

            {/* opponent / bye */}
            <div style={{ opacity: 0.75 }}>
  <div>{row.opponentLabel}</div>
  {row.gameScoreLabel ? (
    <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
      {row.gameScoreLabel}
    </div>
  ) : null}
</div>

            {/* points (hidden on BYE rows) */}
{row.isBye ? null : (
  <button
    onClick={() => {
      if (hasPlayed) onOpenBreakdown(row.round);
    }}
    disabled={!hasPlayed}
    style={{
      height: 32,
      borderRadius: 10,
      background: hasPlayed ? "rgba(5,150,105,0.12)" : "rgba(15,23,42,0.06)",
      border: hasPlayed
        ? "1px solid rgba(5,150,105,0.35)"
        : "1px solid rgba(0,0,0,0.10)",
      fontWeight: 900,
      cursor: hasPlayed ? "pointer" : "default",
      opacity: hasPlayed ? 1 : 0.8,
    }}
  >
    {hasPlayed ? String(pts) : "-"}
  </button>
)}

          </div>
        );
      })}
    </div>
  );
}

export function FixturesTab({
  fixtures,
  teamCode,
  seasonWeeks,
  lastCompletedWeek,
}: {
  fixtures: FixtureRow[];
  teamCode: string;
  seasonWeeks: number[];
  lastCompletedWeek: number; // ✅ add
}) {

  const TEAM_NAME_BY_CODE: Record<string, string> = {
    BLU: "Blues",
    BRU: "Brumbies",
    CHI: "Chiefs",
    CRU: "Crusaders",
    DRU: "Drua",
    FOR: "Force",
    HIG: "Highlanders",
    HUR: "Hurricanes",
    MOA: "Moana Pasifika",
    RED: "Reds",
    WAR: "Waratahs",
  };

  // Weeks AFTER the last completed week (upcoming period)
  const weeksToShow = useMemo(() => {
  return (seasonWeeks ?? [])
    .map((w) => Number(w) || 0)
    .filter((w) => w > lastCompletedWeek)
    .sort((a, b) => a - b);
}, [seasonWeeks, lastCompletedWeek]);

  // Map non-complete fixtures by week (upcoming fixtures)
  const upcomingByWeek = useMemo(() => {
    const m = new Map<number, FixtureRow>();
    for (const f of fixtures ?? []) {
      const w = Number(f?.week) || 0;
      if (w > 0 && !f?.isComplete) m.set(w, f);
    }
    return m;
  }, [fixtures]);

  if (!weeksToShow.length) return <TabCard>No upcoming fixtures.</TabCard>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {weeksToShow.map((w) => {
        const fx = upcomingByWeek.get(w);
        const isBye = !fx || fx.isBye || !fx.opponent;

        // ✅ BYE rows: ONLY week + BYE
        if (isBye) {
          return (
            <div
              key={`wk${w}`}
              style={{
                borderRadius: 12,
                background: "white",
                border: "1px solid rgba(0,0,0,0.08)",
                padding: 10,
                display: "grid",
                gridTemplateColumns: "34px 1fr",
                gap: 10,
                alignItems: "center",
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", opacity: 0.6 }}>
                {w}
              </div>
              <div style={{ opacity: 0.75 }}>BYE</div>
            </div>
          );
        }

        const oppCode = String(fx.opponent);
        const oppName = TEAM_NAME_BY_CODE[oppCode] ?? oppCode;
        const ha = fx.homeAway ? ` (${fx.homeAway})` : "";
        const opponentLabel = `v ${oppName}${ha}`;

        const fdrValRaw = fx.fdr;
        const fdrVal =
          fdrValRaw == null || !Number.isFinite(Number(fdrValRaw)) ? null : Number(fdrValRaw);

        return (
          <div
            key={`wk${fx.week}`}
            style={{
              borderRadius: 12,
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              display: "grid",
              gridTemplateColumns: "34px 1fr 56px",
              gap: 10,
              alignItems: "center",
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {/* week number + opponent logo (same as Results) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <div style={{ opacity: 0.6 }}>{fx.week}</div>
              {oppCode ? (
                <img
                  src={teamLogoSrc(oppCode)}
                  alt=""
                  draggable={false}
                  style={{ width: 20, height: 20, objectFit: "contain", display: "block" }}
                />
              ) : null}
            </div>

            {/* opponent + kickoff */}
            <div style={{ opacity: 0.75 }}>
              <div>{opponentLabel}</div>
              {fx.kickoff ? (
                <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                  {formatKickoffLocal(fx.kickoff)}
                </div>
              ) : null}
            </div>

            {/* FDR box (unchanged) */}
            {(() => {
              const theme = fdrTheme(fdrVal);

              return (
                <div
                  style={{
                    height: 32,
                    borderRadius: 10,
                    background: theme.bg,
                    color: theme.text,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 950,
                    width: 50,
                    justifySelf: "end",
                  }}
                >
                  {fdrVal != null ? String(fdrVal) : "-"}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
