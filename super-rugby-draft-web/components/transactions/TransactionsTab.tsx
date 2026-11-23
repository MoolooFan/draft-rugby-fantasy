"use client";
// components/transactions/TransactionsTab.tsx
// The Transactions page's "Transactions" tab: pending trades (received / proposed), league trades,
// waiver claims and free agent transfers for a round. Split out of app/transactions/page.tsx
// (21 Nov 2026); the page passes in the data it already has.
import React, { useMemo } from "react";
import { roundLabel } from "@/lib/season";
import type { League } from "@/lib/league/types";
import { getInitials, listBox, shortName, type AnyFixture, type Player } from "@/components/transactions/helpers";
import { StatusPill } from "@/components/transactions/bits";
import { useStableComponent } from "@/lib/hooks/useStableComponent";
import { getWeekDeadlineMs } from "@/lib/league/weekHelpers";
import { TeamAvatar } from "@/components/TeamAvatar";
import { ReverseControl, type ReverseKind } from "@/components/transactions/ReverseControl";

export type TransactionsTabProps = {
  activeLeague: League | null;
  yourDraftTeamId: string | null;
  allPlayers: Player[];
  nowMs: number;
  weeksSorted: number[];
  normalizedFixtures: Array<AnyFixture & { kickoffMs: number }>;
  liveWeek: number;
  liveWeekDeadlineMs: number;
  selectionWeek: number;
  waiverDeadlineMs: number;
  tradeWindowOpen: boolean;
  txWeek: number | null;
  setTxWeek: (week: number | null) => void;
  waiverShieldTeamId: string | null;
  /** a finals week with the waiver order flipped (1st seed first) */
  waiverFlipped?: boolean;
  waiverOrderRows: Array<{ teamId: string; rank: number }>;
  waiverOrderLoaded: boolean;
  waiverOrderIndexByTeamId: Map<string, number>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tradesForUi: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  claimsForUi: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  freeForUi: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setReviewTrade: (trade: any | null) => void;
  apiCancelTrade: (tradeId: string) => Promise<void>;
  /** the commissioner sees Reverse under trades, waiver claims and free agent moves */
  isCommissioner?: boolean;
  /** reverses one; resolves to an error message, or null when it worked */
  onReverse?: (kind: ReverseKind, id: string) => Promise<string | null>;
};

/** The Transactions tab: pending trades, league trades, waiver claims and free agent transfers. */
export function TransactionsTab({
  activeLeague, yourDraftTeamId, allPlayers, nowMs, weeksSorted, normalizedFixtures, liveWeek, liveWeekDeadlineMs,
  selectionWeek, waiverDeadlineMs, tradeWindowOpen, txWeek, setTxWeek, waiverShieldTeamId, waiverFlipped, waiverOrderRows,
  waiverOrderLoaded, waiverOrderIndexByTeamId, tradesForUi, claimsForUi, freeForUi, setReviewTrade, apiCancelTrade,
  isCommissioner = false, onReverse,
}: TransactionsTabProps) {
    // the commissioner's Reverse (lib/league/reverse.ts), under moves that went through
    const reverseFor = (kind: ReverseKind, id: string | undefined, status: string, explain: string) => {
      const s = String(status ?? "").toUpperCase();
      if (s === "REVERSED") return <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: "#b45309", textAlign: "right" }}>Reversed by the commissioner</div>;
      if (!isCommissioner || !onReverse || !id || (s !== "ACCEPTED" && s !== "PROCESSED")) return null;
      return <ReverseControl kind={kind} explain={explain} onReverse={() => onReverse(kind, id)} />;
    };
    const leagueId = activeLeague?.id ?? "";
    const yourId = yourDraftTeamId;

const yourWaiverRank = waiverOrderIndexByTeamId.get(String(yourId));
const yourWaiverRankText = typeof yourWaiverRank === "number" ? `#${yourWaiverRank + 1}` : "—";
const shieldPickText = !waiverShieldTeamId
  ? null
  : waiverShieldTeamId === String(yourId)
    ? "🛡️ You hold the Shield: you pick first in round 1 of the claims, then your usual spot."
    : `🛡️ ${(activeLeague?.teams ?? []).find((t) => t.id === waiverShieldTeamId)?.name ?? "The Shield holder"} picks first in round 1 (Shield holder), then the usual order.`;
// ---------- helpers (MOVE UP HERE) ----------
const teamById = (activeLeague?.teams ?? []).reduce((acc: any, t: any) => {
  acc[t.id] = t;
  return acc;
}, {});

const teamName = (teamId: string) => teamById?.[teamId]?.name ?? teamId;

const playerById = (id: string) => allPlayers.find((p) => p.id === id) ?? null;

// ✅ user initials (prefer DB columns from public.teams)
const userInitials = (teamId: string) => {
  const t: any = teamById?.[teamId] ?? null;
  if (!t) return getInitials(teamId);

  // 1) BEST: Supabase teams.initials
  if (t.initials) return String(t.initials).trim().toUpperCase();

  // 2) Next best: owner's actual name stored in teams.owner_name
  if (t.ownerName) return getInitials(String(t.ownerName));

  // 3) Then: username stored in teams.owner_username or teams.user_id
  if (t.ownerUsername) return getInitials(String(t.ownerUsername));
  if (t.userId) return getInitials(String(t.userId));

  // 4) Fallback: team display name
  return getInitials(String(t.name ?? teamId));
};

    // --------------------
// Confirm modal (Trades)
// --------------------

function LeagueTradeRow__render({ t }: { t: any }) {
  const from = teamName(t.fromTeamId);
  const to = teamName(t.toTeamId);

  const offerIds: string[] = t.offerPlayerIds ?? [];
  const requestIds: string[] = t.requestPlayerIds ?? [];

  // offer players go FROM -> TO, request players go TO -> FROM
  const receivedByFrom = requestIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p));

  const receivedByTo = offerIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p));

  const outer: React.CSSProperties = {
    padding: "10px 10px",
    borderTop: "1px solid rgba(0,0,0,0.08)",
  };

  const card: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(15,23,42,0.03)",
    padding: 10,
  };

  const colTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const item: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    opacity: 0.75,
    marginTop: 4,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div style={outer}>
      <div style={card}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={colTitle}>{from} received</div>
            {receivedByFrom.length ? (
              receivedByFrom.slice(0, 6).map((n: string, i: number) => (
                <div key={i} style={item}>
                  {n}
                </div>
              ))
            ) : (
              <div style={item}>—</div>
            )}
          </div>

          <div style={{ minWidth: 0, borderLeft: "1px solid rgba(0,0,0,0.10)", paddingLeft: 10 }}>
            <div style={colTitle}>{to} received</div>
            {receivedByTo.length ? (
              receivedByTo.slice(0, 6).map((n: string, i: number) => (
                <div key={i} style={item}>
                  {n}
                </div>
              ))
            ) : (
              <div style={item}>—</div>
            )}
          </div>
        </div>
        {reverseFor("trade", t.id, t.status, "Every player goes back to the team he came from.")}
      </div>
    </div>
  );
}
const LeagueTradeRow = useStableComponent(LeagueTradeRow__render);

    // Last “team selection deadline” that has PASSED (used for league trades cutoff)
    const lastSelectionDeadlineMs = useMemo(() => {
      if (!liveWeekDeadlineMs) return 0;

      // If we're still BEFORE the current live week deadline, the last passed deadline is previous week.
      if (nowMs < liveWeekDeadlineMs) {
        const idx = weeksSorted.indexOf(liveWeek);
        const prevWeek = weeksSorted[Math.max(0, idx - 1)] ?? null;
        return prevWeek ? getWeekDeadlineMs(normalizedFixtures as any, prevWeek) : 0;
      }

      // Otherwise, current live week deadline has passed and is the last one.
      return liveWeekDeadlineMs;
    }, [nowMs, liveWeekDeadlineMs, liveWeek, weeksSorted, normalizedFixtures]);

    // Most recent waiver deadline that has PASSED (used for waiver-claims feed)
    const lastWaiverDeadlineMs = useMemo(() => {
      // waiverDeadlineMs is for the current selectionWeek.
      if (!waiverDeadlineMs) return 0;

      // If we haven't reached this week's waiver deadline yet, show previous week’s.
      if (nowMs < waiverDeadlineMs) {
        const idx = weeksSorted.indexOf(selectionWeek);
        const prevWeek = weeksSorted[Math.max(0, idx - 1)] ?? null;
        if (!prevWeek) return 0;

        const prevSelectionDeadline = getWeekDeadlineMs(normalizedFixtures as any, prevWeek);
        return prevSelectionDeadline ? prevSelectionDeadline - 24 * 60 * 60 * 1000 : 0;
      }

      // Otherwise, current waiver deadline has passed
      return waiverDeadlineMs;
    }, [nowMs, waiverDeadlineMs, selectionWeek, weeksSorted, normalizedFixtures]);

    // Latest free agency period that has PASSED = (waiver deadline -> selection deadline) window
    // We show transfers created after the last waiver deadline.
    const freeAgencyCutoffMs = lastWaiverDeadlineMs;

    // An earlier round's moves: from the previous round's lineup deadline to that round's
    // (its waivers, free agent signings and trades). Rounds whose deadline has passed.
    const pastTxWeeks = weeksSorted.filter((w) => {
      const d = getWeekDeadlineMs(normalizedFixtures as Parameters<typeof getWeekDeadlineMs>[0], w);
      return !!d && d <= nowMs;
    });
    const viewWindow = (() => {
      if (txWeek == null) return null;
      const idx = weeksSorted.indexOf(txWeek);
      const prev = idx > 0 ? weeksSorted[idx - 1] : null;
      return {
        start: prev ? getWeekDeadlineMs(normalizedFixtures as Parameters<typeof getWeekDeadlineMs>[0], prev) || 0 : 0,
        end: getWeekDeadlineMs(normalizedFixtures as Parameters<typeof getWeekDeadlineMs>[0], txWeek) || Number.MAX_SAFE_INTEGER,
      };
    })();
    const viewStart = viewWindow?.start ?? null;
    const viewEnd = viewWindow?.end ?? null;
    const inView = (ms: number, latestFrom: number) =>
      viewStart == null || viewEnd == null ? ms >= (latestFrom || 0) : ms >= viewStart && ms < viewEnd;

    // ---------- Pending Trades split ----------
   const pendingTradesAll = (tradesForUi as any[])
  .filter((t) => t.leagueId === leagueId)
  .filter((t) => String(t.status ?? "").toLowerCase() === "pending");

    const offersReceived = pendingTradesAll
      .filter((t) => t.toTeamId === yourId)
      .slice()
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    const offersProposed = pendingTradesAll
      .filter((t) => t.fromTeamId === yourId)
      .slice()
      .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));

    // ---------- League Trades (accepted since last team selection deadline) ----------
    const leagueTradesSinceDeadline = (tradesForUi as any[])
  .filter((t) => t.leagueId === leagueId)
  .filter((t) => ["accepted", "reversed"].includes(String(t.status ?? "").toLowerCase()))
      .filter((t) => inView(t.acceptedAtMs ?? t.decidedAtMs ?? t.updatedAtMs ?? t.createdAtMs ?? 0, lastSelectionDeadlineMs))
      .slice()
      .sort(
        (a, b) =>
          (b.acceptedAtMs ?? b.decidedAtMs ?? b.updatedAtMs ?? b.createdAtMs ?? 0) -
          (a.acceptedAtMs ?? a.decidedAtMs ?? a.updatedAtMs ?? a.createdAtMs ?? 0)
      );

// ---------- Waiver claims feed (most recent waiver deadline) ----------
// Display order should mirror the waiver PROCESS DISPLAY order:
// in each pass, go team-by-team in waiver order,
// and for each team show claims until that team hits a PROCESSED claim.
// Then move to the next team, and repeat passes until all claims are shown.
const waiverClaimsFeed = useMemo(() => {
  const eligibleClaims = (claimsForUi as any[])
    .filter((c) => c.leagueId === leagueId)
    .filter((c) => {
      const s = String(c.status ?? "").toUpperCase();
      return s === "PROCESSED" || s === "FAILED" || s === "REVERSED";
    })
    .filter((c) => {
      const ms = c.processedAtMs ?? c.decidedAtMs ?? c.updatedAtMs ?? 0;
      if (!ms) return false;
      // (inView, written out so the memo only depends on what it lists)
      return viewStart == null || viewEnd == null ? ms >= (lastWaiverDeadlineMs || 0) : ms >= viewStart && ms < viewEnd;
    });

  // group claims by team
  const claimsByTeam = new Map<string, any[]>();

  for (const c of eligibleClaims) {
    const teamId = String(c.teamId ?? "");
    if (!teamId) continue;
    if (!claimsByTeam.has(teamId)) claimsByTeam.set(teamId, []);
    claimsByTeam.get(teamId)!.push(c);
  }

  // sort each team's claims by priority, then created time
  for (const [teamId, arr] of claimsByTeam.entries()) {
    arr.sort((a, b) => {
      const ap = typeof a.priority === "number" ? a.priority : 9999;
      const bp = typeof b.priority === "number" ? b.priority : 9999;
      if (ap !== bp) return ap - bp;
      return (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    });
  }

  // team order from waiver order table
  let orderedTeamIds = waiverOrderRows
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => String(r.teamId));

  // fallback if waiver order rows are missing
  if (!orderedTeamIds.length) {
    orderedTeamIds = Array.from(claimsByTeam.keys()).sort((a, b) => {
      const ai = waiverOrderIndexByTeamId.get(String(a)) ?? 9999;
      const bi = waiverOrderIndexByTeamId.get(String(b)) ?? 9999;
      if (ai !== bi) return ai - bi;
      return String(a).localeCompare(String(b));
    });
  }

  // include any teams that somehow have claims but are not in waiver order rows
  for (const teamId of claimsByTeam.keys()) {
    if (!orderedTeamIds.includes(teamId)) orderedTeamIds.push(teamId);
  }

  // make mutable queues per team
  const queues = new Map<string, any[]>();
  for (const teamId of orderedTeamIds) {
    queues.set(teamId, [...(claimsByTeam.get(teamId) ?? [])]);
  }

  const result: any[] = [];
  let madeProgress = true;
  // round 1 starts with the Shield holder (if the league has that reward), then the usual order
  const firstRoundIds = waiverShieldTeamId && orderedTeamIds.includes(waiverShieldTeamId)
    ? [waiverShieldTeamId, ...orderedTeamIds.filter((t) => t !== waiverShieldTeamId)]
    : orderedTeamIds;
  let feedRound = 0;

  while (madeProgress) {
    madeProgress = false;
    const roundIds = feedRound === 0 ? firstRoundIds : orderedTeamIds;
    feedRound++;

    for (const teamId of roundIds) {
      const queue = queues.get(teamId) ?? [];
      if (!queue.length) continue;

      madeProgress = true;

      // show this team's claims until first PROCESSED claim in this pass
      while (queue.length) {
        const claim = queue.shift()!;
        result.push(claim);

        const status = String(claim.status ?? "").toUpperCase();
        if (status === "PROCESSED" || status === "REVERSED") {
          break;
        }
      }
    }
  }

  return result;
}, [
  claimsForUi,
  leagueId,
  lastWaiverDeadlineMs,
  viewStart,
  viewEnd,
  waiverOrderRows,
  waiverOrderIndexByTeamId,
  waiverShieldTeamId,
]);

    // ---------- Free agent transfers feed (latest free agency period) ----------
    const freeAgentFeed = (freeForUi as any[])
      .filter((x) => x.leagueId === leagueId)
      .filter((x) => inView(x.createdAtMs ?? x.updatedAtMs ?? 0, freeAgencyCutoffMs))
      .slice()
      .sort((a, b) => (b.createdAtMs ?? b.updatedAtMs ?? 0) - (a.createdAtMs ?? a.updatedAtMs ?? 0));

    // ---------- UI pieces ----------
    const miniHeader: React.CSSProperties = {
      padding: "6px 10px",
      fontSize: 10,
      fontWeight: 700,
      opacity: 0.7,
      borderTop: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(15,23,42,0.03)",
    };

    const rowWrap: React.CSSProperties = {
      padding: "10px 10px",
      borderTop: "1px solid rgba(0,0,0,0.08)",
      display: "grid",
      gridTemplateColumns: "44px 1fr 110px",
      gap: 10,
      alignItems: "center",
    };

    const pill: React.CSSProperties = {
      height: 28,
      padding: "0 10px",
      borderRadius: 999,
      border: "none",
      fontWeight: 700,
      fontSize: 12,
      cursor: "pointer",
      whiteSpace: "nowrap",
    };

    function TradeSummary__render({ t, mode }: { t: any; mode: "RECEIVED" | "PROPOSED" | "LEAGUE" }) {
  const from = teamName(t.fromTeamId);
  const to = teamName(t.toTeamId);

  const offerIds: string[] = t.offerPlayerIds ?? [];
  const requestIds: string[] = t.requestPlayerIds ?? [];

  const offerNames = offerIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p))
    .slice(0, 3);

  const requestNames = requestIds
    .map((id) => playerById(id))
    .filter(Boolean)
    .map((p: any) => shortName(p))
    .slice(0, 3);

  const topLine =
    mode === "RECEIVED"
      ? `From ${from}`
      : mode === "PROPOSED"
      ? `To ${to}`
      : `${from} ↔ ${to}`;

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {topLine}
      </div>

      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
        Offer: {offerNames.length ? offerNames.join(", ") : "—"}
        {offerIds.length > 3 ? "…" : ""}
      </div>

      <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
        Request: {requestNames.length ? requestNames.join(", ") : "—"}
        {requestIds.length > 3 ? "…" : ""}
      </div>
    </div>
  );
}
const TradeSummary = useStableComponent(TradeSummary__render);

    function InitialBadge__render({ text, teamId }: { text: string; teamId?: string }) {
      // the team's picture (E5) if it has one, otherwise its initials
      const pic = teamId ? (teamById as any)?.[teamId]?.pictureUrl : null;
      const stars = teamId ? (teamById as any)?.[teamId]?.stars ?? 0 : 0;
      if (pic || stars) return <TeamAvatar pictureUrl={pic} initials={text} size={34} stars={stars} />;
      return (
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: "#2563EB",
            color: "white",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          {text}
        </div>
      );
    }
const InitialBadge = useStableComponent(InitialBadge__render);

    // ---------- Render ----------
    // (This check sits after all the hooks above: returning before them could crash the page.)
    if (!leagueId || !yourId) {
      return (
        <div style={{ ...listBox, padding: 12, fontSize: 12, fontWeight: 700, opacity: 0.8 }}>
          No league/team selected.
        </div>
      );
    }

    return (
      <>
{/* Which round's moves */}
<div style={{ ...listBox, padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
  <span style={{ fontSize: 12, fontWeight: 700 }}>Round</span>
  <select
    id="tx-week"
    aria-label="Show moves from"
    value={txWeek == null ? "" : String(txWeek)}
    onChange={(e) => setTxWeek(e.target.value ? Number(e.target.value) : null)}
    style={{ height: 30, borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", padding: "0 8px", fontSize: 12, fontWeight: 600, color: "#0f172a", background: "white" }}
  >
    <option value="">Current</option>
    {[...pastTxWeeks].reverse().map((w) => (
      <option key={w} value={w}>{roundLabel(w)}</option>
    ))}
  </select>
</div>

{/* Pending Trades FIRST (only with the latest moves) */}
{txWeek == null ? (
<div style={{ ...listBox, marginTop: 10 }}>
  <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700 }}>
    Pending Trades
  </div>

  {/* RECEIVED */}
  <div style={miniHeader}>Trade Offers Received</div>

  {offersReceived.length === 0 ? (
    <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
      None.
    </div>
  ) : (
    offersReceived.map((t: any) => (
      <div key={t.id} style={rowWrap}>
        <InitialBadge text={userInitials(t.fromTeamId)} teamId={t.fromTeamId} />

        <TradeSummary t={t} mode="RECEIVED" />

        <div style={{ display: "grid", gap: 8, justifyContent: "end" }}>
          <>
  {tradeWindowOpen ? (
    <button
      style={{
        ...pill,
        background: "rgba(37,99,235,0.12)",
        color: "rgba(37,99,235,0.95)",
        border: "1px solid rgba(37,99,235,0.35)",
      }}
      onClick={() => setReviewTrade(t)}
    >
      Review
    </button>
  ) : (
    <StatusPill status="Expired" />
  )}
</>

        </div>
      </div>
    ))
  )}

  {/* PROPOSED */}
  <div style={miniHeader}>Trade Offers Proposed</div>

  {offersProposed.length === 0 ? (
    <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>
      None.
    </div>
  ) : (
    offersProposed.map((t: any) => (
      <div key={t.id} style={rowWrap}>
        <InitialBadge text={userInitials(t.toTeamId)} teamId={t.toTeamId} />

        <TradeSummary t={t} mode="PROPOSED" />

        <div style={{ display: "grid", justifyContent: "end" }}>
          {tradeWindowOpen ? (
  <button
    style={{
      ...pill,
      background: "rgba(239,68,68,0.10)",
      color: "rgba(239,68,68,0.95)",
      border: "1px solid rgba(239,68,68,0.30)",
    }}
    onClick={() => {
  apiCancelTrade(t.id);
}}

  >
    Cancel
  </button>
) : (
  <StatusPill status="Expired" />
)}

        </div>
      </div>
    ))
  )}
</div>

) : null}

        {/* League Trades since last team selection deadline (or in the chosen round) */}
        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700 }}>League Trades</div>

          {leagueTradesSinceDeadline.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>None yet.</div>
          ) : (
            leagueTradesSinceDeadline.map((t: any) => (
  <LeagueTradeRow key={t.id} t={t} />
))
          )}
        </div>

        {/* Waiver Claims from most recent waiver deadline */}
        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700 }}>Waiver Claims</div>
          <div style={{ padding: "0 10px 10px", fontSize: 10, fontWeight: 700, opacity: 0.7 }}>
  Your waiver priority: {waiverOrderLoaded ? yourWaiverRankText : "Loading…"}
  {waiverOrderLoaded && waiverFlipped ? <div style={{ marginTop: 2 }}>Finals: the order is flipped, so the top seed picks first.</div> : null}
  {waiverOrderLoaded && shieldPickText ? <div style={{ marginTop: 2 }}>{shieldPickText}</div> : null}
</div>

          {waiverClaimsFeed.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>None.</div>
          ) : (
            waiverClaimsFeed.map((c: any, idx: number) => {
              const addP = playerById(c.addPlayerId);
              const dropP = playerById(c.dropPlayerId);

              return (
                <div
                  key={c.id ?? `${c.teamId}_${idx}`}
                  style={{
                    padding: "10px 10px",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    display: "grid",
                    gridTemplateColumns: "26px 44px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, textAlign: "center" }}>{idx + 1}</div>

                  <InitialBadge text={userInitials(c.teamId)} teamId={c.teamId} />

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      IN: {addP ? shortName(addP) : c.addPlayerId}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, opacity: 0.65 }}>
                      OUT: {dropP ? shortName(dropP) : c.dropPlayerId ?? "—"}
                    </div>
                  </div>

                  <StatusPill status={c.status ?? c.result ?? "Processed"} />
                  <div style={{ gridColumn: "1 / -1" }}>
                    {reverseFor("claim", c.id, c.status, `${addP ? shortName(addP) : "The player added"} goes back to the player pool (locked for 24 hours)${c.dropPlayerId ? ` and ${dropP ? shortName(dropP) : "the player dropped"} comes back` : ""}.`)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Free Agent Transfers from latest free agency period */}
        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700 }}>Free Agent Transfers</div>

          {freeAgentFeed.length === 0 ? (
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>None.</div>
          ) : (
            freeAgentFeed.map((x: any, idx: number) => {
              const addP = playerById(x.addPlayerId);
              const dropP = playerById(x.dropPlayerId);

              return (
                <div
                  key={x.id ?? `${x.teamId}_${idx}`}
                  style={{
                    padding: "10px 10px",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    display: "grid",
                    gridTemplateColumns: "26px 44px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, textAlign: "center" }}>{idx + 1}</div>

                  <InitialBadge text={userInitials(x.teamId)} teamId={x.teamId} />

                  {x.addPlayerId ? (
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      IN: {addP ? shortName(addP) : x.addPlayerId}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, opacity: 0.65 }}>
                      OUT: {dropP ? shortName(dropP) : x.dropPlayerId ?? "—"}
                    </div>
                  </div>
                  ) : (
                  // a drop with no one added (to bring a player back from IR)
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      OUT: {dropP ? shortName(dropP) : x.dropPlayerId ?? "—"}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, fontWeight: 600, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      Dropped by {teamName(x.teamId)}
                    </div>
                  </div>
                  )}

                  <StatusPill status={x.status ?? "Processed"} />
                  {x.addPlayerId ? (
                    <div style={{ gridColumn: "1 / -1" }}>
                      {reverseFor("transfer", x.id, x.status, `${addP ? shortName(addP) : "The player added"} goes back to the player pool (locked for 24 hours)${x.dropPlayerId ? ` and ${dropP ? shortName(dropP) : "the player dropped"} comes back` : ""}.`)}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

      </>
    );
  }
