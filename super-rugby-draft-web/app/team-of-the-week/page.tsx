"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PlayerCardModal } from "@/components/PlayerCardModal";

import { useRequireSession } from "@/lib/session/useRequireSession";
import { useLeagueStore } from "@/lib/league/store";
import { useDraftStore } from "@/lib/draft/store";
import { usePlayersStore } from "@/lib/players/store";

import { currentSeasonYear, fixturesByFantasyWeek } from "@/lib/season";

// This season's fixtures, numbered by fantasy week (see lib/season).
const fixturesData = fixturesByFantasyWeek();
import { fantasyWeekToRealRound, selectionDeadlineFromFirstKickoff } from "@/lib/league/week";
import { getActiveTimezone, getActiveUsername } from "@/lib/session";
import { roundPoints } from "@/lib/scoring";
import { toMs, type SheetFixtureRow, isSheetPlayableRow, currentWeekFromSheet } from "@/lib/league/weekHelpers";
import { buildTeamOfWeek, calcFantasyPoints, pickStr, POS_NAME, rosterRowToPlayerIds, rowPlayerId, rowRound, safeLower, SLOT_DEFS, type AnyFixture, type Lineup, type Player } from "./helpers";
import { TotwField } from "./TotwField";
import { TotwHeader } from "./TotwHeader";

// -----------------------
// Page
// -----------------------
export default function TeamOfTheWeekPage() {
  useRequireSession();
  const router = useRouter();

  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeague = useMemo(
    () => leagues.find((l) => l.id === activeLeagueId) ?? null,
    [leagues, activeLeagueId]
  );

  // not strictly required for logic, but kept as in your snippet
  useMemo(() => getActiveTimezone(), []);
  const username = useMemo(() => getActiveUsername(), []);

  // Draft teams (for owner label)
  const draftTeams = useDraftStore((s) => s.teams);

  // live now (client-only)
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // fixtures normalized
  const fixtures = useMemo(() => {
    const raw = fixturesData as AnyFixture[];
    return raw
      .map((f) => ({ ...f, kickoffMs: toMs(f.kickoffAt) }))
      .sort((a, b) => (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0));
  }, []);

  // sheet fixtures (league schedule/results)
  const [sheetFixtures, setSheetFixtures] = useState<SheetFixtureRow[]>([]);
  useEffect(() => {
    if (!activeLeague?.id) return;
    const season = currentSeasonYear();

    fetch(`/api/fixtures/leagueMatches?season=${season}&leagueId=${encodeURIComponent(activeLeague.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setSheetFixtures(j.rows ?? []);
        else console.error("fixtures fetch failed", j?.error);
      })
      .catch((e) => console.error(e));
  }, [activeLeague?.id]);

  // match dashboard week logic
  const selectionWeek = useMemo(() => {
    if (!sheetFixtures.length) return activeLeague?.currentWeek ?? 1;
    return currentWeekFromSheet(sheetFixtures);
  }, [sheetFixtures, activeLeague?.currentWeek]);

  const startRound = activeLeague?.startRound ?? 1;
  const selectionRealRound = useMemo(
    () => fantasyWeekToRealRound(startRound, selectionWeek),
    [startRound, selectionWeek]
  );

  const deadlineMs = useMemo(() => {
    const wk = fixtures.filter((f) => f.week === selectionRealRound);
    if (!wk.length) return 0;
    const firstKickoff = Math.min(...wk.map((f) => f.kickoffMs ?? toMs(f.kickoffAt)));
    if (!Number.isFinite(firstKickoff) || firstKickoff <= 0) return 0;
    return selectionDeadlineFromFirstKickoff(firstKickoff);
  }, [fixtures, selectionRealRound]);

  const deadlineLocked = deadlineMs ? nowMs >= deadlineMs : false;

  const displayWeekDefault = useMemo(() => {
    return deadlineLocked ? selectionWeek : selectionWeek - 1;
  }, [deadlineLocked, selectionWeek]);

  const maxFantasyWeek = useMemo(() => {
    const w = sheetFixtures
      .filter(isSheetPlayableRow)
      .map((r) => Number(r.weekFantasy))
      .filter((n) => Number.isFinite(n) && n > 0);
    return w.length ? Math.max(...w) : Math.max(1, selectionWeek);
  }, [sheetFixtures, selectionWeek]);

  const [week, setWeek] = useState<number>(1);
  useEffect(() => {
    const w = Math.min(Math.max(1, displayWeekDefault || 1), maxFantasyWeek || 1);
    setWeek(w);
  }, [displayWeekDefault, maxFantasyWeek]);

  const realRound = useMemo(() => {
    if (week <= 0) return 0;
    return fantasyWeekToRealRound(startRound, week);
  }, [startRound, week]);

  // -------- Players / stats from store --------
  const livePlayersLoaded = usePlayersStore((s) => s.loaded);
  const refreshLivePlayers = usePlayersStore((s) => s.refresh);
  const roundRows = usePlayersStore((s) => s.roundRows);

  // IMPORTANT: keep this best-effort; your store could be `players` or `allPlayers`
  const allPlayersRaw = usePlayersStore((s: any) => s.players ?? s.allPlayers ?? []);

  useEffect(() => {
    if (!livePlayersLoaded) refreshLivePlayers();
  }, [livePlayersLoaded, refreshLivePlayers]);

  const players: Player[] = useMemo(() => {
    const src = Array.isArray(allPlayersRaw) ? allPlayersRaw : [];
    return src
      .map((p: any) => {
        const id = pickStr(p.id ?? p.playerId ?? p.player_id);
        if (!id) return null;

        return {
          id,
          firstName: pickStr(p.firstName ?? p.first_name) || "?",
          lastName: pickStr(p.lastName ?? p.last_name) || "?",
          teamCode: pickStr(p.teamCode ?? p.team ?? p.team_code) || "TBC",
          posAbbrev: pickStr(p.posAbbrev ?? p.pos ?? p.position) || "—",
          secondaryPosAbbrev:
            pickStr(p.secondaryPosAbbrev ?? p.pos2 ?? p.secondaryPos ?? p.secondary_position ?? p.secondaryPosition) ||
            null,
          status: p.status ?? null,
          weeklyStatus: p.weeklyStatus ?? {},
        };
      })
      .filter(Boolean) as Player[];
  }, [allPlayersRaw]);
  
  const weekPointsByPlayerId = useMemo(() => {
  const m = new Map<string, number>();

  for (const row of roundRows ?? []) {
    if (rowRound(row) !== realRound) continue;

    const pidRaw = rowPlayerId(row);
    if (!pidRaw) continue;

    const pid = String(pidRaw).toLowerCase();

    const player =
      players.find((p) => String(p.id).toLowerCase() === pid) ?? null;

    m.set(pid, calcFantasyPoints(row, player));
  }

  return m;
}, [roundRows, realRound, players]);

  

  // POTW ids (ties allowed)
  const potwIds = useMemo(() => {
    let best = -Infinity;
    const ids: string[] = [];

    for (const p of players) {
      const pts = weekPointsByPlayerId.get(p.id.toLowerCase()) ?? 0;
      if (pts > best) {
        best = pts;
        ids.length = 0;
        ids.push(p.id);
      } else if (pts === best) {
        ids.push(p.id);
      }
    }

    if (!Number.isFinite(best) || best <= 0) return new Set<string>();
    return new Set(ids.map(String));
  }, [players, weekPointsByPlayerId]);

  const lineup: Lineup = useMemo(() => {
    if (!players.length) return Object.fromEntries(SLOT_DEFS.map((s) => [s.id, null])) as Lineup;
    return buildTeamOfWeek(players, weekPointsByPlayerId);
  }, [players, weekPointsByPlayerId]);

  const totalPoints = useMemo(() => {
    let sum = 0;
    for (const s of SLOT_DEFS) {
      const p = lineup[s.id];
      if (!p?.id) continue;
      sum += weekPointsByPlayerId.get(p.id.toLowerCase()) ?? 0;
    }
    return roundPoints(sum);
  }, [lineup, weekPointsByPlayerId]);

  // -------- Ownership map (server rosters) --------
  const leagueTeams = useMemo(() => {
    return Array.isArray(activeLeague?.teams) ? (activeLeague!.teams as any[]) : [];
  }, [activeLeague?.teams]);

  const yourLeagueTeamId = useMemo(() => {
    if (!leagueTeams.length) return null;

    const me = safeLower(username);
    if (me) {
      const t = leagueTeams.find((x: any) => safeLower(x.userId) === me);
      if (t) return String(t.id);
    }
    return String(leagueTeams[0]?.id ?? "");
  }, [leagueTeams, username]);

  const [serverRosters, setServerRosters] = useState<Map<string, { playerIds: string[] }>>(new Map());

  useEffect(() => {
    const leagueId = activeLeague?.id;
    if (!leagueId) return;

    fetch(`/api/rosters?leagueId=${encodeURIComponent(String(leagueId))}`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok) return;
        const rows = Array.isArray(j.data) ? j.data : [];

        const m = new Map<string, { playerIds: string[] }>();
        for (const row of rows) {
          const teamId = String(row.team_id ?? "");
          if (!teamId) continue;
          const ids = rosterRowToPlayerIds(row?.data);
          m.set(teamId, { playerIds: ids });
        }
        setServerRosters(m);
      })
      .catch((e) => console.log("fetch /api/rosters failed", e));
  }, [activeLeague?.id]);

  const ownerTeamIdByPlayerId = useMemo(() => {
    // playerId -> teamId
    const m = new Map<string, string>();
    for (const [teamId, row] of serverRosters.entries()) {
      for (const pid of row.playerIds ?? []) {
        if (!pid) continue;
        m.set(String(pid), teamId);
      }
    }
    return m;
  }, [serverRosters]);

  function ownerLabelForTeam(teamId: string | null) {
    if (!teamId) return "Available";
    const t =
      draftTeams.find((x: any) => String(x.id) === String(teamId)) ??
      leagueTeams.find((x: any) => String(x.id) === String(teamId));
    return t?.name ?? "Team";
  }

  // -------- Period (waivers vs free agency) --------
  // Best-effort: use an explicit flag if you have one. Otherwise treat as free agency.
  const isWaiversPeriod = useMemo(() => {
    const a: any = activeLeague as any;
    if (typeof a?.waiversOpen === "boolean") return a.waiversOpen;
    if (typeof a?.isWaivers === "boolean") return a.isWaivers;
    return false;
  }, [activeLeague]);

  // -------- Watchlist (store if available, else localStorage fallback) --------
  const leagueIdForWatchlist = activeLeague?.id ?? "no-league";
  const watchKey = useMemo(() => {
    return `watchlist_${String(leagueIdForWatchlist)}_${String(yourLeagueTeamId ?? "no-team")}`;
  }, [leagueIdForWatchlist, yourLeagueTeamId]);

  const storeWatchlistIds = usePlayersStore((s: any) => s.watchlistIds ?? s.watchlist ?? null);
  const storeToggleWatchlist = usePlayersStore((s: any) => s.toggleWatchlist ?? null);
  const storeAddToWatchlist = usePlayersStore((s: any) => s.addToWatchlist ?? null);
  const storeRemoveFromWatchlist = usePlayersStore((s: any) => s.removeFromWatchlist ?? null);

  const [localWatchlistIds, setLocalWatchlistIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(watchKey);
      const arr = raw ? (JSON.parse(raw) as any[]) : [];
      setLocalWatchlistIds(Array.isArray(arr) ? arr.map(String) : []);
    } catch {
      setLocalWatchlistIds([]);
    }
  }, [watchKey]);

  // 👇 ADD THIS DIRECTLY BELOW 👇
useEffect(() => {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  fetch(`/api/watchlist?leagueId=${encodeURIComponent(leagueId)}`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((r) => r.json())
    .then((j) => {
      if (!j?.ok) return;
      const ids = Array.isArray(j.data) ? j.data.map(String) : [];
      setLocalWatchlistIds(ids);
      try {
        localStorage.setItem(watchKey, JSON.stringify(ids));
      } catch {}
    })
    .catch((e) => console.error(e));
}, [activeLeague?.id, watchKey]);

  function isWatched(playerId: string) {
    const pid = String(playerId);
    if (Array.isArray(storeWatchlistIds)) return storeWatchlistIds.map(String).includes(pid);
    return localWatchlistIds.includes(pid);
  }

  async function supabaseToggleWatchlist(leagueId: string, playerId: string, nextWatched: boolean) {
  if (nextWatched) {
    // add
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ leagueId, playerId }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed to add to watchlist");
    return;
  }

  // remove
  const res = await fetch(
    `/api/watchlist?leagueId=${encodeURIComponent(leagueId)}&playerId=${encodeURIComponent(playerId)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error ?? "Failed to remove from watchlist");
}

  function toggleWatch(playerId: string) {
  const leagueId = String(activeLeague?.id ?? "");
  if (!leagueId) return;

  const pid = String(playerId);

  const currentlyWatched =
    Array.isArray(storeWatchlistIds) ? storeWatchlistIds.map(String).includes(pid) : localWatchlistIds.includes(pid);

  const nextWatched = !currentlyWatched;

  // Optimistic UI update (store OR local)
  if (Array.isArray(storeWatchlistIds) && typeof storeToggleWatchlist === "function") {
    // if your store has a toggle, keep UI in sync
    storeToggleWatchlist(pid);
  } else {
    setLocalWatchlistIds((prev) => {
      const next = prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid];
      try {
        localStorage.setItem(watchKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Write to Supabase via existing API route
  supabaseToggleWatchlist(leagueId, pid, nextWatched).catch((e: any) => {
    console.error(e);

    // Roll back optimistic update if API fails
    if (Array.isArray(storeWatchlistIds) && typeof storeToggleWatchlist === "function") {
      storeToggleWatchlist(pid);
    } else {
      setLocalWatchlistIds((prev) => {
        const rolled = prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid];
        try {
          localStorage.setItem(watchKey, JSON.stringify(rolled));
        } catch {}
        return rolled;
      });
    }

    alert(e?.message ?? "Watchlist update failed");
  });
}

  // -------- Modal state --------
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);

  function openPlayer(p: Player) {
    const code = String(p.posAbbrev ?? "").toUpperCase();
    const posName = POS_NAME[code] ?? String(p.posAbbrev ?? "—");

    // PlayerCardModal in your build shows posAbbrev, so for the modal ONLY:
    // - keep posName for future-proofing
    // - override posAbbrev to full name so it displays "Prop" instead of "PR"
    setModalPlayer({
      ...p,
      posName,
      posAbbrev: posName,
    });
  }

  const modalActions = useMemo(() => {
    if (!modalPlayer) return [];

    const ownerTeamId = ownerTeamIdByPlayerId.get(String(modalPlayer.id)) ?? null;

    const ownedByYou = !!ownerTeamId && !!yourLeagueTeamId && String(ownerTeamId) === String(yourLeagueTeamId);
    const ownedByOther = !!ownerTeamId && !ownedByYou;
    const unowned = !ownerTeamId;

    if (ownedByYou) return [];

    const actions: Array<{ label: string; onClick: () => void; variant: "primary" | "secondary" }> = [];

    // Watchlist always available if not your player
    actions.push({
      label: isWatched(modalPlayer.id) ? "Remove from Watchlist" : "Add to Watchlist",
      onClick: () => toggleWatch(modalPlayer.id),
      variant: "secondary",
    });

    if (ownedByOther) {
      actions.push({
        label: "Trade",
        onClick: () => {
          setModalPlayer(null);
          router.push(`/trade/propose?playerId=${encodeURIComponent(String(modalPlayer.id))}`);
        },
        variant: "primary",
      });
    }

    if (unowned) {
      actions.push({
        label: isWaiversPeriod ? "Submit Claim" : "Sign Player",
        onClick: () => {
          setModalPlayer(null);
          router.push(
            `/transactions?mode=${encodeURIComponent(isWaiversPeriod ? "waivers" : "freeagency")}&playerId=${encodeURIComponent(
              String(modalPlayer.id)
            )}`
          );
        },
        variant: "primary",
      });
    }

    return actions;
  }, [
    modalPlayer,
    ownerTeamIdByPlayerId,
    yourLeagueTeamId,
    isWaiversPeriod,
    router,
    localWatchlistIds,
    storeWatchlistIds,
  ]);

  // -----------------------
  // Styles
  // -----------------------
  const containerMax = 420;

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div
        style={{
          maxWidth: containerMax,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <TotwHeader
          week={week}
          maxFantasyWeek={maxFantasyWeek}
          totalPoints={totalPoints}
          onPrev={() => setWeek((w) => Math.max(1, w - 1))}
          onNext={() => setWeek((w) => Math.min(maxFantasyWeek, w + 1))}
          onClose={() => router.push("/dashboard")}
        />

        <TotwField lineup={lineup} potwIds={potwIds} weekPointsByPlayerId={weekPointsByPlayerId} onOpen={openPlayer} />
      </div>

      {/* Player modal */}
      {modalPlayer ? (
        <PlayerCardModal
          onClose={() => setModalPlayer(null)}
          player={modalPlayer as any}
          teamLabel={ownerLabelForTeam(ownerTeamIdByPlayerId.get(String(modalPlayer.id)) ?? null)}
          initialTab="Stats"
          actions={modalActions}
        />
      ) : null}
    </main>
  );
}