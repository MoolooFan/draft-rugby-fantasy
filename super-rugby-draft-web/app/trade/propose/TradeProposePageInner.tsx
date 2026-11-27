"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { getActiveUser, getActiveUsername } from "@/lib/session";

import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";

import { usePlayerPool } from "@/lib/players/pool";
import { fixturesByFantasyWeek } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { usePlayersStore } from "@/lib/players/store";
import { toMs, getWeekDeadlineMs, getWeeksSorted } from "@/lib/league/weekHelpers";
import { useProjections } from "@/lib/projections/useProjections";
import { roundLabel } from "@/lib/season";
import { useStatView } from "@/lib/players/statView";
import { TradeTopBar } from "./TradeTopBar";
import { GroupedList, ReviewButtons } from "./TradeLists";
import {
  canFillRequiredSlots,
  extractRosterIdsFromData,
  getAvgPPGFromRounds,
  getMatchesPlayedFromRounds,
  getTotalPointsFromRounds,
  inputWrap,
  metricValue,
  normUser,
  toggleId,
  type AnyFixture,
  type InfoMode,
  type ModalContext,
  type Player,
  type Step,
} from "./helpers";
// -----------------------
// Page
// -----------------------
export default function TradeProposePageInner() {
  const router = useRouter();
  const sp = useSearchParams();

  // Route protection
  useEffect(() => {
    const u = getActiveUser();
    if (!u) router.replace("/");
  }, [router]);

  const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s: any) => s.activeLeagueId ?? s.activeLeague?.id ?? null);

const activeLeague = useMemo(() => {
  if (!leagues?.length) return null;
  if (activeLeagueId) return leagues.find((l: any) => l.id === activeLeagueId) ?? leagues[0];
  return leagues[0];
}, [leagues, activeLeagueId]);

const userId = useMemo(() => normUser(getActiveUsername()), []);

  const draftTeams = useDraftStore((s) => s.teams);
  const rosters = useDraftStore((s) => s.rosters);
  // Server-fetched rosters (so we can see OTHER teams' players)
const [apiRostersByTeam, setApiRostersByTeam] = useState<Record<string, any>>({});
const watchlist = useDraftStore((s) => (s as any).watchlist ?? {});
const toggleWatchlist = useDraftStore((s) => (s as any).toggleWatchlist ?? (() => {}));

const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
const [modalContext, setModalContext] = useState<ModalContext>("REQUESTING");

function openPlayerCard(p: Player, ctx: ModalContext) {
  setModalContext(ctx);
  setModalPlayer(hydratePlayer(p));
}

  // Query params
  const returnTo = sp.get("returnTo") || "";
  const partnerTeamIdInitial = sp.get("partnerTeamId") || "";
  const prefillRequestPlayerId = sp.get("prefillRequestPlayerId") || "";

  
  // Identify your teamId in league/draft
const yourLeagueTeamId = useMemo(() => {
  const l: any = activeLeague;
  if (!l) return null;

  const teams = (l.teams ?? []) as any[];
  if (!teams.length) return null;

  if (userId) {
    const mine = teams.find((t) => {
      const candidates = [
        t.userId,
        t.user_id,
        t.owner_username,
        t.ownerUsername,
        t.username,
      ].map(normUser);

      return candidates.includes(userId);
    });

    if (mine?.id) return String(mine.id);
  }

  // if we can't identify, don't guess someone else's team
  return null;
}, [activeLeague, userId]);

  const yourDraftTeamId = useMemo(() => {
  if (yourLeagueTeamId) return yourLeagueTeamId;

  // very last resort only if the league literally has one team
  if ((activeLeague as any)?.teams?.length === 1) {
    return String((activeLeague as any).teams[0].id);
  }

  return null;
}, [yourLeagueTeamId, activeLeague]);

    // Partner team selection
  const [partnerPicked, setPartnerTeamId] = useState<string>(partnerTeamIdInitial);
  // If partner not provided, the first "other" team in the league (worked out, not set in an effect)
  const partnerTeamId: string =
    partnerPicked || (((activeLeague as any)?.teams ?? []) as any[]).find((t: any) => t.id && t.id !== yourDraftTeamId)?.id || "";

  // Players
  const playerPool = usePlayerPool();
  const allPlayers: Player[] = useMemo(() => {
  return (playerPool as any[]).map((p) => ({
    ...p,
    teamCode: normalizeTeamCode(p.teamCode),
    secondaryPosAbbrev: p.secondaryPosAbbrev ?? undefined,
    secondaryPosName: p.secondaryPosName ?? undefined,
  })) as Player[];
}, [playerPool]);

const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
// season stats people browse (last season's until this season's first kickoff: lib/season statsSeasonYear)
const roundRows = usePlayersStore((s) => s.statRows);
// next round's projected points (the "Projected" view)
const tradeProj = useProjections(activeLeague?.id ?? null, "current");
const getLivePlayerById = usePlayersStore((s) => s.getById);

useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);

// Fetch all rosters for the active league from the server API (includes other teams)
useEffect(() => {
  const leagueId = activeLeague?.id;
  if (!leagueId) return;

  let cancelled = false;

  (async () => {
    try {
      const res = await fetch(`/api/rosters?leagueId=${encodeURIComponent(leagueId)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("[trade/propose] Failed to load rosters:", json?.error ?? res.statusText);
        return;
      }

      const rows = (json.data ?? []) as any[];
      const map: Record<string, any> = {};
      for (const row of rows) {
        const teamId = String(row?.team_id ?? "").trim();
        if (!teamId) continue;
        map[teamId] = row?.data ?? {};
      }

      if (!cancelled) setApiRostersByTeam(map);
    } catch (e) {
      console.error("[trade/propose] rosters fetch error:", e);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [activeLeague?.id]);

function hydratePlayer(p: Player): Player {
  const live: any = getLivePlayerById?.(p.id);

  const totalPoints = getTotalPointsFromRounds(p, roundRows ?? []);
const matchesPlayed = getMatchesPlayedFromRounds(p, roundRows ?? []);
const avgPointsPerMatch = getAvgPPGFromRounds(p, roundRows ?? []);

  return {
    ...p,

    // normalize null -> undefined for modal typing
    secondaryPosAbbrev: p.secondaryPosAbbrev ?? undefined,
    secondaryPosName: p.secondaryPosName ?? undefined,

    // live sheet (modal + badges)
    status: live?.status ?? (p as any).status ?? undefined,
    weeklyStatus: live?.weeklyStatus ?? (p as any).weeklyStatus ?? {},

    // computed (the key fix)
    totalPoints,
    matchesPlayed,
    avgPointsPerMatch,

    // optional: keep stats object stable so modal never breaks
    stats: (p as any).stats ?? {},
    playerStats: (p as any).playerStats ?? (p as any).stats ?? {},
  };
}

  // Fixtures + week info (for deadline UI + auto-decline rules)
  const fixtures = useMemo(
    () => (fixturesData as AnyFixture[]).map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) })),
    []
  );
  const normalizedFixtures = useMemo(
    () => fixtures.slice().sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0)),
    [fixtures]
  );
  const weeksSorted = useMemo(() => getWeeksSorted(normalizedFixtures), [normalizedFixtures]);

  // We’ll treat “current selection week” as the minimum week that still has a future deadline.
  const [nowMs, setNowMs] = useState(() => Date.now());

useEffect(() => {
  const id = setInterval(() => setNowMs(Date.now()), 30000);
  return () => clearInterval(id);
}, []);

  const selectionWeek = useMemo(() => {
    for (const w of weeksSorted) {
      const deadline = getWeekDeadlineMs(normalizedFixtures as any, w);
      if (deadline && nowMs < deadline) return w;
    }
    // if all deadlines passed, just use last week
    return weeksSorted[weeksSorted.length - 1] ?? 1;
  }, [weeksSorted, normalizedFixtures, nowMs]);

  // HARD trade deadline = final team selection deadline before playoffs.
  // We’ll look for a league setting; if it doesn’t exist, we assume playoffs start AFTER the final fixture week (so last week is trade-deadline).
  const playoffStartWeek =
    (activeLeague as any)?.playoffStartWeek ??
    (activeLeague as any)?.settings?.playoffStartWeek ??
    null;

  const hardTradeDeadlineWeek = useMemo(() => {
    const lastWeek = weeksSorted[weeksSorted.length - 1] ?? 1;
    if (typeof playoffStartWeek === "number" && playoffStartWeek > 1) return Math.max(1, playoffStartWeek - 1);
    return lastWeek;
  }, [weeksSorted, playoffStartWeek]);

  const hardTradeDeadlineMs = useMemo(() => getWeekDeadlineMs(normalizedFixtures as any, hardTradeDeadlineWeek), [normalizedFixtures, hardTradeDeadlineWeek]);

  // League rule: eliminated teams can't trade (lib/league/eliminated.ts); the server checks it too
  const tradeBlockMsg = useMemo(() => {
    const blocked: string[] = (activeLeague as any)?.tradeBlockedTeamIds ?? [];
    if (yourDraftTeamId && blocked.includes(String(yourDraftTeamId))) return "Your team has been eliminated, so it can't trade any more (league rule). Waiver claims and free agents are still open.";
    if (partnerTeamId && blocked.includes(String(partnerTeamId))) return "That team has been eliminated, so it can't trade any more (league rule).";
    return null;
  }, [activeLeague, yourDraftTeamId, partnerTeamId]);

  const tradeWindowClosed = useMemo(() => {
    if (!hardTradeDeadlineMs) return false;
    return nowMs >= hardTradeDeadlineMs;
  }, [nowMs, hardTradeDeadlineMs]);

  const yourTeamName = useMemo(() => {
  return (activeLeague as any)?.teams?.find((t: any) => t.id === yourLeagueTeamId)?.name ?? "";
}, [activeLeague, yourLeagueTeamId]);

const partnerTeamName = useMemo(() => {
  return (activeLeague as any)?.teams?.find((t: any) => t.id === partnerTeamId)?.name ?? "";
}, [activeLeague, partnerTeamId]);

const modalTeamLabel = useMemo(() => {
  if (!modalPlayer) return "";

  if (modalContext === "REQUESTING") {
    return partnerTeamName || "Available";
  }

  return yourTeamName || "Available";
}, [modalPlayer, modalContext, partnerTeamName, yourTeamName]);

const [step, setStep] = useState<Step>("REQUESTING");
const [requestingIds, setRequestingIds] = useState<string[]>([]);
const [offeringIds, setOfferingIds] = useState<string[]>([]);

const [isProposing, setIsProposing] = useState(false);
const [proposeError, setProposeError] = useState<string | null>(null);

  const modalActions = useMemo(() => {
  if (!modalPlayer) return [];

  const playerId = modalPlayer.id;
  const isOnWatchlist = !!(watchlist as any)[playerId];

  const addToWatchlistAction = {
    label: isOnWatchlist ? "Remove from Watchlist" : "Add to Watchlist",
    variant: "secondary" as const,
    onClick: () => toggleWatchlist(playerId),
  };

  const tradeAction = {
    label: "Trade",
    variant: "primary" as const,
    onClick: () => {
      // close card first
      setModalPlayer(null);

      // then select player in the correct list
      window.setTimeout(() => {
        if (modalContext === "REQUESTING") {
          setRequestingIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
        } else {
          setOfferingIds((prev) => (prev.includes(playerId) ? prev : [...prev, playerId]));
        }
      }, 0);
    },
  };

  return [addToWatchlistAction, tradeAction];
}, [modalPlayer, modalContext, watchlist, toggleWatchlist, setRequestingIds, setOfferingIds]);

  // Info mode
  const [infoMode, setInfoMode] = useState<InfoMode>("AVG_PPG");
  const [statView] = useStatView(); // C1

  // When partner team changes: clear selections + go back to REQUESTING (set while drawing)
  const [selectionsFor, setSelectionsFor] = useState(partnerTeamId);
  if (selectionsFor !== partnerTeamId) {
    setSelectionsFor(partnerTeamId);
    setRequestingIds([]);
    setOfferingIds([]);
    setStep("REQUESTING");
  }

// Get a team roster as a flat unique list
// Priority:
// 1) If draft-store roster exists with player objects (slots/wildcards), use that (nice & already hydrated)
// 2) Otherwise use server API roster (data.playerIds) and map ids -> playersData
const rosterPlayersForTeam = useMemo(() => {
  return (teamId: string | null | undefined): Player[] => {
    if (!teamId) return [];

    // 1) Draft store roster (slot-based with actual player objects)
    const storeRoster: any = (rosters as any)?.[teamId];
    if (storeRoster) {
      const out: Player[] = [];
      const seen = new Set<string>();

      for (const arr of Object.values(storeRoster?.slots ?? {})) {
        for (const p of (arr as any[]) ?? []) {
          const id = String((p as any)?.id ?? "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          out.push(p as Player);
        }
      }
      for (const p of (storeRoster?.wildcards ?? []) as any[]) {
        const id = String((p as any)?.id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(p as Player);
      }

      if (out.length) return out;
      // If storeRoster exists but empty, fall through to API
    }

    // 2) API roster (canonical data.playerIds)
    const apiData = apiRostersByTeam?.[teamId];
    if (!apiData) return [];

    const ids = extractRosterIdsFromData(apiData);
    if (!ids.length) return [];

    // map ids -> player objects
    const byId = new Map(allPlayers.map((p) => [String(p.id), p]));
    return ids.map((id) => byId.get(String(id))).filter(Boolean) as Player[];
  };
}, [rosters, apiRostersByTeam, allPlayers]);

  const partnerRoster = useMemo(() => rosterPlayersForTeam(partnerTeamId), [rosterPlayersForTeam, partnerTeamId]);
  const yourRoster = useMemo(() => rosterPlayersForTeam(yourDraftTeamId), [rosterPlayersForTeam, yourDraftTeamId]);

  const partnerRosterLive = useMemo(() => {
  return partnerRoster.map((p) => hydratePlayer(p));
}, [partnerRoster, livePlayersLoaded, getLivePlayerById, roundRows]);

const yourRosterLive = useMemo(() => {
  return yourRoster.map((p) => hydratePlayer(p));
}, [yourRoster, livePlayersLoaded, getLivePlayerById, roundRows]);

// Prefill requested player (only if on current partner roster; once per partner, set while drawing)
const prefillKey = prefillRequestPlayerId && partnerRoster.some((p) => p.id === prefillRequestPlayerId) ? `${prefillRequestPlayerId}|${partnerTeamId}` : null;
const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
if (prefillKey && prefillKey !== prefilledFor) {
  setPrefilledFor(prefillKey);
  setRequestingIds((prev) => (prev.includes(prefillRequestPlayerId!) ? prev : [...prev, prefillRequestPlayerId!]));
}

  // Validity check (both rosters must remain viable after swap)
  const validity = useMemo(() => {
    const reqPlayers = requestingIds
  .map((id) => partnerRosterLive.find((p) => p.id === id) ?? partnerRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))

  .filter(Boolean) as Player[];

const offPlayers = offeringIds
  .map((id) => yourRosterLive.find((p) => p.id === id) ?? yourRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))

  .filter(Boolean) as Player[];

    if (reqPlayers.length === 0) return { ok: false, msg: "Select at least 1 requested player." };
    if (offPlayers.length !== reqPlayers.length) return { ok: false, msg: "Offering must match requested player count." };

    // Build after-swap rosters
    const yourAfter = yourRoster.filter((p) => !offeringIds.includes(p.id)).concat(reqPlayers);
    const theirAfter = partnerRoster.filter((p) => !requestingIds.includes(p.id)).concat(offPlayers);

    const okYour = canFillRequiredSlots(yourAfter);
    const okTheir = canFillRequiredSlots(theirAfter);

    if (!okYour || !okTheir) return { ok: false, msg: "Invalid trade (one or both squads would be unviable)." };
    return { ok: true, msg: "Valid Trade" };
  }, [requestingIds, offeringIds, allPlayers, yourRoster, partnerRoster]);

  // Close / return logic
  function goBackToReturnTo() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    router.back();
  }

  async function proposeTrade() {
  if (tradeWindowClosed) return;
  if (!validity.ok) return;
  if (!activeLeague?.id || !yourDraftTeamId || !partnerTeamId) return;

  setIsProposing(true);
  setProposeError(null);

  try {
    const res = await fetch("/api/trades/propose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: activeLeague.id,
        week: selectionWeek,
        toTeamId: partnerTeamId,
        offerPlayerIds: offeringIds,
        requestPlayerIds: requestingIds,
        note: "",
      }),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.ok) {
      const msg = json?.error ?? "Failed to propose trade";
      setProposeError(msg);
      return;
    }

    goBackToReturnTo();
  } catch (e: any) {
    setProposeError(e?.message ?? "Failed to propose trade");
  } finally {
    setIsProposing(false);
  }
}

  // the chosen view's number for a player row
  const metricOf = (p: Player) => metricValue(p, infoMode, roundRows ?? [], statView, tradeProj);

  // Render the correct list
  const requestingCount = requestingIds.length;
  const offeringCount = offeringIds.length;

const reviewRequestPlayers = requestingIds
  .map((id) => partnerRosterLive.find((p) => p.id === id) ?? partnerRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))
  .filter(Boolean)
  .map((p) => hydratePlayer(p as Player));

const reviewOfferPlayers = offeringIds
  .map((id) => yourRosterLive.find((p) => p.id === id) ?? yourRoster.find((p) => p.id === id) ?? allPlayers.find((p) => p.id === id))
  .filter(Boolean)
  .map((p) => hydratePlayer(p as Player));

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Background */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <TradeTopBar
          step={step}
          onStep={setStep}
          requestingCount={requestingIds.length}
          offeringCount={offeringIds.length}
          onClose={goBackToReturnTo}
          partnerTeamId={partnerTeamId}
          onPartnerTeam={setPartnerTeamId}
          partnerOptions={((activeLeague as any)?.teams ?? []).filter((t: any) => t.id !== yourDraftTeamId)}
          yourTeamName={yourTeamName}
          partnerTeamName={partnerTeamName}
          infoMode={infoMode}
          onInfoMode={setInfoMode}
          projLabel={tradeProj ? `Projected (${roundLabel(tradeProj.week)})` : "Projected"}
        />

{step !== "REVIEW" && (
  <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>
    {step === "REQUESTING" ? (
      <span>
        <span style={{ color: "white" }}>Players Selected:</span> {requestingCount}
      </span>
    ) : (
      <span>
        <span style={{ color: "white" }}>Players Selected:</span> {offeringCount} / {requestingCount}
      </span>
    )}
  </div>
)}

        {step === "REQUESTING" && (
<GroupedList
  title="Requesting:"
  titleColor="#EF4444"
  players={partnerRosterLive}
  selectedIds={requestingIds}
  onToggleId={(id) => setRequestingIds((prev) => toggleId(prev, id))}
  context="REQUESTING"

  metricOf={metricOf}
  onOpenPlayer={openPlayerCard}
/>

        )}

        {step === "OFFERING" && (
<GroupedList
  title="Offering:"
  titleColor="#22C55E"
  players={yourRosterLive}
  selectedIds={offeringIds}
  onToggleId={(id) => setOfferingIds((prev) => toggleId(prev, id))}
  context="OFFERING"

  metricOf={metricOf}
  onOpenPlayer={openPlayerCard}
/>

        )}

        {step === "REVIEW" && (
          <>
<GroupedList
  title="Offering:"
  titleColor="#22C55E"
  players={reviewOfferPlayers}
  selectedIds={offeringIds}
  onToggleId={(id) => setOfferingIds((prev) => toggleId(prev, id))}
  context="OFFERING"
  hidePositionHeaders

  metricOf={metricOf}
  onOpenPlayer={openPlayerCard}
/>

<GroupedList
  title="Requesting:"
  titleColor="#EF4444"
  players={reviewRequestPlayers}
  selectedIds={requestingIds}
  onToggleId={(id) => setRequestingIds((prev) => toggleId(prev, id))}
  context="REQUESTING"
  hidePositionHeaders

  metricOf={metricOf}
  onOpenPlayer={openPlayerCard}
/>

<div style={{ ...inputWrap, marginTop: 10 }}>
  {/* Valid / Invalid message */}
  <div style={{ fontSize: 12, fontWeight: 700 }}>
    {tradeWindowClosed ? (
      <span style={{ color: "rgba(239,68,68,0.95)" }}>
        Trade window closed (regular season deadline passed)
      </span>
    ) : tradeBlockMsg ? (
      <span style={{ color: "rgba(239,68,68,0.95)" }}>{tradeBlockMsg}</span>
    ) : validity.ok ? (
      <span style={{ color: "rgba(34,197,94,0.95)" }}>{validity.msg}</span>
    ) : (
      <span style={{ color: "rgba(0, 0, 0, 0.95)" }}>{validity.msg}</span>
    )}
  </div>

  {proposeError ? (
  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: "rgba(239,68,68,0.95)" }}>
    {proposeError}
  </div>
) : null}

  {/* Cancel / Propose buttons */}
  <div style={{ marginTop: 10 }}>
    <ReviewButtons canPropose={validity.ok && !tradeWindowClosed && !tradeBlockMsg} isProposing={isProposing} onCancel={goBackToReturnTo} onPropose={proposeTrade} />
  </div>
</div>

          </>
        )}

        
      </div>
{modalPlayer ? (
  <PlayerCardModal
    onClose={() => setModalPlayer(null)}
    player={hydratePlayer(modalPlayer)}
    teamLabel={modalTeamLabel}
    initialTab="Stats"
    actions={modalActions}
  />
) : null}

    </main>
  );
}
