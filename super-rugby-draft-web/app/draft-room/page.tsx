"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveUser } from "@/lib/session";
import { PlayerCardModal } from "@/components/PlayerCardModal";

import { TEAM_OPTIONS, POSITION_OPTIONS } from "@/lib/constants";
import { useDraftStore } from "@/lib/draft/store";

import playersData from "@/data/players.json";
import { rosterSlots, derivePosName } from "@/lib/draft/constants";

import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import type { Player } from "@/lib/draft/types";

import { normalizeTeamCode } from "@/lib/teams/normalizeTeamCode";
import { usePlayersStore } from "@/lib/players/store";



type DraftTab = "Player Pool" | "Watchlist" | "Teams" | "Draft Results";
type DraftPhase = "preDraft" | "liveDraft";




type Pick = {
  pickNumber: number;
  player: Player | null; // null for not yet drafted
  ownerInitials?: string; // prefilled if order set
  ownerTeamId?: string;
};

type TeamRosterSlot = {
  slotId: string;
  label: string;
  count: number;
  posAbbrev: string | "WC";
};

type Team = {
  id: string;
  name: string;
  initials: string;        // team initials
  userId?: string;
  userInitials?: string;   // ✅ user initials (owner)
};


type Modal =
  | null
  | { type: "draftConfirm"; player: Player }
  | { type: "playerCard"; player: Player };


export default function DraftRoomPage() {
  const router = useRouter();

  // Route protection
  useEffect(() => {
    const user = getActiveUser();
    if (!user) router.replace("/");
  }, [router]);

  // -----------------------
  // DEV switches
  // -----------------------
  const phase = useDraftStore((s) => s.phase);
const setPhase = useDraftStore((s) => s.setPhase);

const leagues = useLeagueStore((s) => s.leagues);
const activeLeague = useLeagueStore((s) => s.activeLeague());
const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
const completeDraft = useLeagueStore((s) => s.completeDraft);
// ---- Draft store selectors used early (must be declared before use) ----
const teams = useDraftStore((s) => s.teams);
const isDraftOrderSet = useDraftStore((s) => s.isDraftOrderSet);
const syncFromLeague = useDraftStore((s) => s.syncFromLeague);
const rosters = useDraftStore((s) => s.rosters);


  const [activeTab, setActiveTab] = useState<DraftTab>("Player Pool");
  const [menuOpen, setMenuOpen] = useState(false);
const draftResultsScrollRef = useRef<HTMLDivElement | null>(null);
const shouldAutoScrollRef = useRef(true);

const livePlayers = usePlayersStore((s) => s.players);
const livePlayersLoaded = usePlayersStore((s) => s.loaded);
const refreshLivePlayers = usePlayersStore((s) => s.refresh);
const getLivePlayerById = usePlayersStore((s) => s.getById);
useEffect(() => {
  if (!livePlayersLoaded) refreshLivePlayers();
}, [livePlayersLoaded, refreshLivePlayers]);

// =========================
// Jersey assets (Draft Room uses ANGLED if available)
// Files live in: /public/images/jerseys
// =========================
const JERSEYS: Record<string, { angle?: string; front?: string; single?: string }> = {
  BLU: { angle: "/images/jerseys/BLUJerseyAngle.png", front: "/images/jerseys/BLUJerseyFront.png" },
  BRU: { single: "/images/jerseys/BRUJersey.png" },
  CHI: { angle: "/images/jerseys/CHIJerseyAngle.png", front: "/images/jerseys/CHIJerseyFront.png" },
  CRU: { angle: "/images/jerseys/CRUJerseyAngle.png", front: "/images/jerseys/CRUJerseyFront.png" },
  DRU: { single: "/images/jerseys/DRUJersey.png" },
  FOR: { single: "/images/jerseys/FORJersey.png" },
  HIG: { angle: "/images/jerseys/HIGJerseyAngle.png", front: "/images/jerseys/HIGJerseyFront.png" },
  HUR: { angle: "/images/jerseys/HURJerseyAngle.png", front: "/images/jerseys/HURJerseyFront.png" },
  MOA: { angle: "/images/jerseys/MOPJerseyAngle.png", front: "/images/jerseys/MOPJerseyFront.png" },
  RED: { single: "/images/jerseys/REDJersey.png" },
  WAR: { single: "/images/jerseys/WARJersey.png" },
};

const JERSEY_PLACEHOLDER = "/images/jersey-placeholder.png";

function jerseySrcForTeamCode(teamCode: string | null | undefined, prefer: "angle" | "front" = "angle") {
 const code = normalizeTeamCode(teamCode);
  const j = JERSEYS[code];
  if (!j) return JERSEY_PLACEHOLDER;

  if (prefer === "angle") return j.angle ?? j.single ?? j.front ?? JERSEY_PLACEHOLDER;
  return j.front ?? j.single ?? j.angle ?? JERSEY_PLACEHOLDER;
}

// ✅ Sync draft teams from active league
const leagueTeamsSig = useMemo(() => {
  if (!activeLeague) return "";
  return activeLeague.teams.map((t) => t.id).join("|");
}, [activeLeague]);

useEffect(() => {
  if (!activeLeague) return;

  const draftTeams = activeLeague.teams.map((t) => ({
  id: t.id,
  name: t.name,
  initials: t.initials,
  userId: t.userId,
  userInitials: t.userInitials,
}));


  // Keep DEV draft-order toggle behaviour for now:
  // - If you want league always to override, pass true/false from league later
  syncFromLeague(draftTeams, isDraftOrderSet);
}, [activeLeague?.id, leagueTeamsSig, syncFromLeague, isDraftOrderSet]);

  // ✅ hydration guard (prevents Date.now mismatch between server/client)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

// Your team (mock): default to the first team in the active draft order
const yourTeamId = teams[0]?.id ?? "t-1";

const rawUser = getActiveUser();
const activeUser = typeof rawUser === "string" ? { username: rawUser } : rawUser;

const userInitials = useMemo(() => {
  const fn = (activeUser?.firstName ?? "").trim();
  const ln = (activeUser?.lastName ?? "").trim();

  if (fn || ln) {
    return `${fn[0] ?? ""}${ln[0] ?? ""}`.toUpperCase();
  }

  const u = (activeUser?.username ?? "").trim();
  return (u.slice(0, 2) || "U").toUpperCase();
}, [activeUser?.firstName, activeUser?.lastName, activeUser?.username]);


  // -----------------------
  // ✅ TIMING (fixed)
  // -----------------------
  const liveDeadlineRef = useRef<number | null>(null);
  const preDraftDeadlineRef = useRef<number | null>(null);
const PICK_MS = 90_000; // 10s per pick (change this)

  useEffect(() => {
    if (liveDeadlineRef.current == null) {
      liveDeadlineRef.current = Date.now() + PICK_MS; // 90s pick timer
    }
    if (preDraftDeadlineRef.current == null) {
      preDraftDeadlineRef.current =
        Date.now() + (2 * 86400 + 20 * 3600 + 45 * 60 + 30) * 1000;
    }
  }, []);

  function resetLiveTimer() {
    liveDeadlineRef.current = Date.now() + PICK_MS;
  }

  function useNowTick(ms = 250) {
    const [, force] = useState(0);
    useEffect(() => {
      const t = window.setInterval(() => force((x) => x + 1), ms);
      return () => window.clearInterval(t);
    }, [ms]);
    return Date.now();
  }

  // -----------------------
  // Filters
  // -----------------------
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [posFilter, setPosFilter] = useState<string>("");

  // Watchlist
  const watchlist = useDraftStore((s) => s.watchlist);
const toggleWatchlist = useDraftStore((s) => s.toggleWatchlist);


  // Modal
  const [modal, setModal] = useState<Modal>(null);

const setDraftOrderSet = useDraftStore((s) => s.setDraftOrderSet);

const totalPicks = useDraftStore((s) => s.totalPicks());

const ownerForPickSnake = useDraftStore((s) => s.ownerForPickSnake);

const pickIndex = useDraftStore((s) => s.pickIndex);
const picks = useDraftStore((s) => s.picks);
const latestPickText = useDraftStore((s) => s.latestPickText);

const confirmDraft = useDraftStore((s) => s.confirmDraft);
const autoDraft = useDraftStore((s) => s.autoDraft);
const ensurePicksLength = useDraftStore((s) => s.ensurePicksLength);
const rehydratePlayersFromPool = useDraftStore((s) => s.rehydratePlayersFromPool);

const canTeamDraftPlayer = useDraftStore((s) => s.canTeamDraftPlayer);
const isDrafted = useDraftStore((s) => s.isDrafted);
const getPlayerTeamName = useDraftStore((s) => s.getPlayerTeamName);
const getPlayerPickNumber = useDraftStore((s) => s.getPlayerPickNumber);

// keep picks array sized correctly if teams change etc
useEffect(() => {
  ensurePicksLength();
}, [ensurePicksLength, teams.length]);

const draftComplete =
  totalPicks > 0 &&
  picks.length === totalPicks &&
  picks[totalPicks - 1] !== null;


const currentPick = Math.min(pickIndex, totalPicks);


const onTheClockTeamId = useMemo(() => {
  if (draftComplete) return "";
  const owner = ownerForPickSnake(pickIndex);
  return owner?.id ?? "";
}, [pickIndex, ownerForPickSnake, draftComplete]);

const isYouOnClock =
  phase === "liveDraft" && !draftComplete && onTheClockTeamId === yourTeamId;

const nextPickInTurns = useMemo(() => {
  if (draftComplete) return 0;
  if (!yourTeamId) return 0;
  for (let i = pickIndex + 1; i <= totalPicks; i++) {
    const owner = ownerForPickSnake(i);
    if (owner?.id === yourTeamId) return i - pickIndex;
  }
  return 0;
}, [pickIndex, totalPicks, yourTeamId, ownerForPickSnake, draftComplete]);

 // -----------------------
// Players (real pool from JSON)
// -----------------------
// -----------------------
// Players (from converted JSON – already in Player shape)
// -----------------------

const allPlayers: Player[] = useMemo(() => {
  return (playersData as Player[]).map((p) => ({
    ...p,
    teamCode: normalizeTeamCode(p.teamCode),
  }));
}, []);

useEffect(() => {
  rehydratePlayersFromPool(allPlayers);
}, [rehydratePlayersFromPool, allPlayers]);



const draftedIds = useMemo(() => {
  return new Set(picks.filter(Boolean).map((p) => (p as Player).id));
}, [picks]);


  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allPlayers
      .filter((p) => (draftedIds.has(p.id) ? false : true))
      .filter((p) =>
        q ? `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) : true
      )
      .filter((p) => (teamFilter ? p.teamCode === teamFilter : true))
      .filter((p) => {
  if (!posFilter) return true;
  const a = (p.posAbbrev ?? "").toUpperCase();
  const b = (p.secondaryPosAbbrev ?? "").toUpperCase();
  return a === posFilter || b === posFilter;
})

      .sort((a, b) => a.draftRank - b.draftRank);
  }, [allPlayers, draftedIds, search, teamFilter, posFilter]);

  // ✅ Player Pool only: hide players you can no longer draft (position full + WC full)
const playerPoolPlayers = useMemo(() => {
  return filteredPlayers.filter((p) => canTeamDraftPlayer(yourTeamId, p));
}, [filteredPlayers, canTeamDraftPlayer, yourTeamId]);

  const watchlistPlayers = useMemo(() => {
  return filteredPlayers.filter((p) => !!watchlist[p.id]);
}, [filteredPlayers, watchlist]);

function hydrateForModal(p: Player): Player {
  const live = getLivePlayerById(p.id);

  if (!live) return p;

  return {
    ...p,
    // pull live sheet fields onto the draft snapshot player
    status: live.status ?? p.status ?? null,
    weeklyStatus: live.weeklyStatus ?? (p as any).weeklyStatus,
  } as any;
}

  function openPlayerCard(p: Player) {
  setModal({ type: "playerCard", player: hydrateForModal(p) });
}



  // -----------------------
  // Draft click flows
  // -----------------------
  function onDraftClick(p: Player) {
    if (phase !== "liveDraft") return;
    if (draftComplete) return;
    if (!isYouOnClock) return;

    // block if roster full for that position AND WC full
    if (!canTeamDraftPlayer(onTheClockTeamId, p)) return;

    setModal({ type: "draftConfirm", player: p });
  }


  // -----------------------
  // ✅ AUTO DRAFT when timer expires
  // -----------------------
  const autoPickGuardRef = useRef<number | null>(null);

  useEffect(() => {
  autoPickGuardRef.current = null;
}, [pickIndex]);

  function autoDraftIfNeeded() {
    if (phase !== "liveDraft") return;
    if (draftComplete) return;
    if (!liveDeadlineRef.current) return;
    if (pickIndex > totalPicks) return;

    // only once per pick
    if (autoPickGuardRef.current === pickIndex) return;

    if (Date.now() < liveDeadlineRef.current) return;

// ✅ mark this pick as already auto-processed (prevents repeat calls)
autoPickGuardRef.current = pickIndex;

autoDraft(allPlayers);
resetLiveTimer();


  }

  useEffect(() => {
  const t = window.setInterval(() => {
    if (phase !== "liveDraft") return;
    if (draftComplete) return;
    if (!liveDeadlineRef.current) return;
    if (pickIndex > totalPicks) return;
    if (autoPickGuardRef.current === pickIndex) return;
    if (Date.now() < liveDeadlineRef.current) return;

    autoPickGuardRef.current = pickIndex;
    autoDraft(allPlayers);
    resetLiveTimer();
  }, 300);

  return () => window.clearInterval(t);
}, [phase, draftComplete, pickIndex, totalPicks, autoDraft, allPlayers]);


// -----------------------
// DraftResults data
// -----------------------
const draftResults: Pick[] = useMemo(() => {
  return Array.from({ length: totalPicks }).map((_, idx) => {
    const pickNumber = idx + 1;
    const owner = ownerForPickSnake(pickNumber);
    const player = picks[idx] ?? null;

    const ownerTeamId = owner?.id;

    // ✅ Prefer user initials, fallback to team initials
    const ownerInitials = owner?.userInitials ?? owner?.initials;

    return {
      pickNumber,
      player,
      ownerInitials,
      ownerTeamId,
    };
  });
}, [totalPicks, picks, ownerForPickSnake, teams]); // ✅ include teams




  // Pre-draft first pick label
  const firstPickTeamName = isDraftOrderSet
  ? ownerForPickSnake(1)?.name ?? "TBC"
  : "TBC";


  // -----------------------
  // Styles
  // -----------------------
  const card35: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const tabBarStyle: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.18)",
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    height: 30,
    border: "none",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  });

  const inputWrap: React.CSSProperties = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "8px 10px",
    boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
  };

  const listBox: React.CSSProperties = {
    marginTop: 10,
    borderRadius: 12,
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    color: "#0f172a",
  };

function JerseyTile({ teamCode, size = 34 }: { teamCode: string; size?: number }) {
  return (
    <img
      src={jerseySrcForTeamCode(teamCode, "angle")}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        objectFit: "contain",
        display: "block",
      }}
      draggable={false}
    />
  );
}



  function DraftButton({
    enabled,
    onClick,
    label = "Draft",
  }: {
    enabled: boolean;
    onClick: () => void;
    label?: string;
  }) {
    return (
      <button
        disabled={!enabled}
        onClick={onClick}
        style={{
          height: 28,
          width: 64,
          borderRadius: 10,
          border: "none",
          background: enabled ? "#6366F1" : "rgba(0,0,0,0.25)",
          color: "white",
          fontWeight: 900,
          fontSize: 12,
          cursor: enabled ? "pointer" : "not-allowed",
          opacity: enabled ? 1 : 0.55,
        }}
      >
        {label}
      </button>
    );
  }

  function StarButton({ active, onClick }: { active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        aria-label={active ? "Remove from watchlist" : "Add to watchlist"}
        style={{
          width: 32,
          height: 28,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.10)",
          background: active ? "rgba(250,204,21,0.25)" : "rgba(0,0,0,0.05)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          color: "#0f172a",
          fontSize: 16,
          fontWeight: 900,
        }}
      >
        {active ? "★" : "☆"}
      </button>
    );
  }

  function Hamburger() {
    return (
      <button
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          color: "white",
          fontSize: 36,
          fontWeight: 900,
          lineHeight: "36px",
          cursor: "pointer",
        }}
      >
        ☰
      </button>
    );
  }

  function PreDraftHeader() {
        const now = mounted ? useNowTick(250) : 0;
    const deadline = preDraftDeadlineRef.current ?? 0;
    const preDraftSeconds = mounted
      ? Math.max(0, Math.floor((deadline - now) / 1000))
      : 0;

    const d = Math.floor(preDraftSeconds / 86400);
    const h = Math.floor((preDraftSeconds % 86400) / 3600);
    const m = Math.floor((preDraftSeconds % 3600) / 60);
    const s = preDraftSeconds % 60;

    return (
      <div style={{ ...card35, padding: 14, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
        </div>

        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>Draft Starts In</div>

        <div style={{ marginTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <TimeBlock value={pad2(d)} label="Days" />
            <TimeBlock value={pad2(h)} label="Hours" />
            <TimeBlock value={pad2(m)} label="Minutes" />
            <TimeBlock value={pad2(s)} label="Seconds" />
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 900, opacity: 0.95 }}>
          First Pick: <span style={{ fontWeight: 800 }}>{firstPickTeamName || "TBC"}</span>
        </div>
      </div>
    );
  }

  function LiveHeader() {
        const now = mounted ? useNowTick(250) : 0;
    const deadline = liveDeadlineRef.current ?? 0;

    const secondsLeft = mounted
      ? Math.max(0, Math.floor((deadline - now) / 1000))
      : 0;

    const isLow = secondsLeft <= 20;
    const timeColor = draftComplete ? "white" : isLow ? "#EF4444" : "white";

    return (
      <div
        style={{
          ...card35,
          padding: 14,
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hamburger />
          <div style={{ flex: 1 }} />
        </div>

        <div
          style={{
            marginTop: 2,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, opacity: 0.95 }}>🕒</span>
            <div style={{ fontSize: 20, fontWeight: 900, color: timeColor }}>
              {draftComplete ? "Draft Complete" : formatMMSS(secondsLeft)}
            </div>
          </div>

          <div style={{ textAlign: "right", fontSize: 18, fontWeight: 900 }}>
            Pick {currentPick} of {totalPicks}
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            background: "#FACC15",
            color: "#0f172a",
            borderRadius: 999,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 700,
            boxShadow: "0 10px 18px rgba(0,0,0,0.16)",
            textAlign: "center",
          }}
        >
          {latestPickText}
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.95 }}>
              Your Next Pick in:
            </div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              {draftComplete ? "—" : `${nextPickInTurns} turns`}
            </div>
          </div>

          <div style={{ display: "grid", gap: 2, textAlign: "right" }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.95 }}>
              On the Clock:
            </div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              {draftComplete
                ? "—"
                : teams.find((t) => t.id === onTheClockTeamId)?.name ?? "TBC"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function TimeBlock({ value, label }: { value: string; label: string }) {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 900, lineHeight: "30px" }}>{value}</div>
        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.9, marginTop: 2 }}>{label}</div>
      </div>
    );
  }

  function Tabs() {
    const tabs: DraftTab[] = ["Player Pool", "Watchlist", "Teams", "Draft Results"];
    return (
      <div style={tabBarStyle}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {tabs.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)} style={tabBtn(t === activeTab)}>
              {t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function Filters() {
    const stopCapture = (e: any) => {
      e.stopPropagation?.();
    };

    return (
      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <div style={inputWrap}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 26px",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
              style={{
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: "#0f172a",
              }}
            />
            <div style={{ textAlign: "right", fontSize: 16, opacity: 0.65 }}>🔍</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div
            style={{ ...inputWrap, position: "relative" }}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
          >
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              onPointerDownCapture={stopCapture}
              onClickCapture={stopCapture}
              style={{
                width: "100%",
                height: 34,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: teamFilter ? "#0f172a" : "rgba(15,23,42,0.55)",
                WebkitAppearance: "none",
                appearance: "none",
                paddingRight: 30,
              }}
            >
              <option value="">All Teams</option>
              {TEAM_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(15,23,42,0.45)",
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              ▾
            </span>
          </div>

          <div
            style={{ ...inputWrap, position: "relative" }}
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
          >
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              onPointerDownCapture={stopCapture}
              onClickCapture={stopCapture}
              style={{
                width: "100%",
                height: 34,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: posFilter ? "#0f172a" : "rgba(15,23,42,0.55)",
                WebkitAppearance: "none",
                appearance: "none",
                paddingRight: 30,
              }}
            >
              <option value="">All Positions</option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>

            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(15,23,42,0.45)",
                fontSize: 16,
                pointerEvents: "none",
              }}
            >
              ▾
            </span>
          </div>
        </div>
      </div>
    );
  }

  function PlayerRow({
    p,
    draftEnabled,
  }: {
    p: Player;
    draftEnabled: boolean;
  }) {
    const isStar = !!watchlist[p.id];


    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 132px",
          gap: 10,
          alignItems: "center",
          padding: "10px 10px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <div
          onClick={() => openPlayerCard(p)}
          style={{
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <JerseyTile teamCode={p.teamCode} size={32} />

            <div>
              <div style={{ fontWeight: 700, fontSize: 12 }}>
                {p.firstName[0]}. {p.lastName}
              </div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
  {TEAM_OPTIONS.find((t) => t.value === p.teamCode)?.label ?? p.teamCode}
  {" — "}
  {p.posName}
{p.secondaryPosName ? ` / ${p.secondaryPosName}` : ""}

</div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, width: 34, textAlign: "right" }}>
            {p.draftRank}
          </div>

          <StarButton active={isStar} onClick={() => toggleWatchlist(p.id)} />

          <DraftButton enabled={draftEnabled} onClick={() => onDraftClick(p)} />
        </div>
      </div>
    );
  }

  function PlayerPoolTab() {
    const draftEnabledFor = (p: Player) =>
      phase === "liveDraft" &&
      isYouOnClock &&
      canTeamDraftPlayer(yourTeamId, p) &&
      !draftComplete;

    return (
      <>
        <Filters />
        <div style={listBox}>
          <div style={{ padding: "8px 100px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px" }}>
              <div />
              <div style={{ textAlign: "right" }}>Draft Rank</div>
            </div>
          </div>
{playerPoolPlayers.length === 0 ? (
  <div style={{ padding: 14, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
    No eligible players available for your remaining roster slots.
  </div>
) : (
  playerPoolPlayers.map((p) => (
    <PlayerRow key={p.id} p={p} draftEnabled={draftEnabledFor(p)} />
  ))
)}



        </div>
      </>
    );
  }

  function WatchlistTab() {
    const draftEnabledFor = (p: Player) =>
      phase === "liveDraft" &&
      isYouOnClock &&
      canTeamDraftPlayer(yourTeamId, p) &&
      !draftComplete;

    return (
      <>
        <Filters />
        <div style={listBox}>
          <div style={{ padding: "8px 100px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 180px" }}>
              <div />
              <div style={{ textAlign: "right" }}>Draft Rank</div>
            </div>
          </div>

          {watchlistPlayers.length === 0 ? (
            <div style={{ padding: 14, fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
              No players in your watchlist yet.
            </div>
          ) : (
            watchlistPlayers.map((p) => (
              <PlayerRow key={p.id} p={p} draftEnabled={draftEnabledFor(p)} />
            ))
          )}
        </div>
      </>
    );
  }


const [selectedTeamId, setSelectedTeamId] = useState<string>("t-1");

  function TeamsTab() {
    

    const roster = rosters[selectedTeamId] ?? null;



    return (
      <>
        <div style={{ marginTop: 10 }}>
          <div style={inputWrap}>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ ...listBox, marginTop: 10 }}>
          <div style={{ padding: "8px 10px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 70px" }}>
              <div />
              <div style={{ textAlign: "right" }}>Pick</div>
            </div>
          </div>

          {rosterSlots.map((slot) => (
            <div key={slot.slotId} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
              <div style={{ padding: "8px 10px", fontSize: 11, fontWeight: 900, opacity: 0.75 }}>
                {slot.label}
              </div>

              {Array.from({ length: slot.count }).map((_, i) => {
                const entry =
                  slot.posAbbrev === "WC"
                    ? roster?.wildcards?.[i] ?? null
                    : roster?.slots?.[slot.posAbbrev]?.[i] ?? null;

                return (
                  <div
                    key={`${slot.slotId}-${i}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 70px",
                      alignItems: "center",
                      padding: "10px 10px",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    {entry ? (
  <div
    onClick={() => openPlayerCard(entry)}
    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
  >
    <JerseyTile teamCode={entry.teamCode} size={32} />

    <div>
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        {entry.firstName[0]}. {entry.lastName}
      </div>
      <div style={{ fontSize: 10, opacity: 0.7 }}>
        {TEAM_OPTIONS.find((t) => t.value === entry.teamCode)?.label ?? entry.teamCode}
        {" — "}
        {derivePosName(entry.posAbbrev)}
{entry.secondaryPosAbbrev ? ` / ${derivePosName(entry.secondaryPosAbbrev)}` : ""}


      </div>
    </div>
  </div>
) : (
  <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.55 }}>
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.10)",
        display: "grid",
        placeItems: "center",
        fontWeight: 700,
        fontSize: 22,
        color: "rgba(15,23,42,0.55)",
      }}
    >
      +
    </div>
    <div style={{ fontSize: 12, fontWeight: 500 }}>
      {slot.posAbbrev === "WC" ? "Wildcard" : slot.label.slice(0, -1)}
    </div>
  </div>
)}


                    <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, opacity: 0.8 }}>
                      {entry ? (getPlayerPickNumber(entry.id) ?? "") : ""}

                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </>
    );
  }

  function DraftResultsTab() {
    return (
      <div
  ref={draftResultsScrollRef}
  onScroll={() => {
    const el = draftResultsScrollRef.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;

    shouldAutoScrollRef.current = distanceFromBottom < 80;
  }}
  style={{
    ...listBox,
    marginTop: 10,
    maxHeight: "70vh",
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
  }}
>

        <div style={{ padding: "8px 17px", fontSize: 10, fontWeight: 500, opacity: 0.7 }}>
          <div style={{ display: "grid", gridTemplateColumns: "54px 1fr 60px" }}>
            <div>Pick</div>
            <div />
            <div style={{ textAlign: "right" }}>Owner</div>
          </div>
        </div>

        {draftResults.map((r, idx) => {

          const hasPlayer = !!r.player;

          return (
            <div
              key={r.pickNumber}
              style={{
                display: "grid",
                gridTemplateColumns: "28px 1fr 60px",
                gap: 10,
                alignItems: "center",
                padding: "10px 10px",
                borderTop: idx === 0 ? "1px solid rgba(0,0,0,0.08)" : undefined,
                borderBottom: "1px solid rgba(0,0,0,0.08)",
                opacity: hasPlayer ? 1 : 0.85,
              }}
            >
              <div style={{ padding: "0px 4px", fontSize: 12, fontWeight: 900 }}>{r.pickNumber}</div>

              {r.player ? (
                (() => {
                  const player = r.player;
                  const teamLabel =
                    TEAM_OPTIONS.find((t) => t.value === player.teamCode)?.label ?? player.teamCode;

                  return (
                    <button
                      onClick={() => openPlayerCard(player)}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <JerseyTile teamCode={player.teamCode} size={32} />

                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>
                            {player.firstName[0]}. {player.lastName}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>
                            {teamLabel} {" — "} {derivePosName(player.posAbbrev)}
{player.secondaryPosAbbrev ? ` / ${derivePosName(player.secondaryPosAbbrev)}` : ""}


                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })()
              ) : (
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.55 }}>—</div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                {r.ownerInitials ? (
                  <span
                    style={{
                      minWidth: 40,
                      height: 28,
                      padding: "0 10px",
                      borderRadius: 10,
                      background: "#6366F1",
                      color: "white",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    {r.ownerInitials}
                  </span>
                ) : (
                  <span style={{ opacity: 0.4, fontWeight: 900 }}> </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function DraftConfirmModal({ player }: { player: Player }) {
    return (
      <ModalOverlay onClose={() => setModal(null)}>
        <div
          style={{
            borderRadius: 12,
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.12)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            padding: 12,
            color: "#0f172a",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
            Draft the following player?
          </div>

          <div
            style={{
              borderRadius: 10,
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              display: "grid",
              gridTemplateColumns: "1fr 70px",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <JerseyTile teamCode={player.teamCode} size={40} />

              <div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  {player.firstName[0]}. {player.lastName}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {player.teamCode} — {player.posName}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.65 }}>Draft Rank</div>
              <div style={{ fontSize: 12, fontWeight: 900 }}>{player.draftRank}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <button
              onClick={() => setModal(null)}
              style={{
                height: 34,
                borderRadius: 10,
                border: "none",
                background: "#EF4444",
                color: "white",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
  setModal(null);
  confirmDraft(player);
  resetLiveTimer(); // ✅ new pick starts with fresh 90s
}}

              style={{
                height: 34,
                borderRadius: 10,
                border: "none",
                background: "#10B981",
                color: "white",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </ModalOverlay>
    );
  }


  function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} onClick={onClose} />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "92%",
            maxWidth: 520,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background:
            "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))",
        }}
      />

      <div
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "16px 18px",
          paddingBottom: "calc(18px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 900, opacity: 0.85 }}>
            DEV:&nbsp;
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value as DraftPhase)}
              style={{
                marginLeft: 6,
                height: 26,
                borderRadius: 8,
                border: "none",
                outline: "none",
                padding: "0 8px",
                fontSize: 11,
                fontWeight: 800,
                color: "#0f172a",
                background: "rgba(255,255,255,0.9)",
              }}
            >
              <option value="preDraft">Pre Draft</option>
              <option value="liveDraft">Live Draft</option>
            </select>
          </label>
        </div>
<div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
  <label style={{ fontSize: 11, fontWeight: 900, opacity: 0.85 }}>
    Draft Order:&nbsp;
    <select
      value={isDraftOrderSet ? "set" : "tbc"}
      onChange={(e) => setDraftOrderSet(e.target.value === "set")}
      style={{
        marginLeft: 6,
        height: 26,
        borderRadius: 8,
        border: "none",
        outline: "none",
        padding: "0 8px",
        fontSize: 11,
        fontWeight: 800,
        color: "#0f172a",
        background: "rgba(255,255,255,0.9)",
      }}
    >
      <option value="tbc">TBC</option>
      <option value="set">Set</option>
    </select>
  </label>
</div>

        {phase === "preDraft" ? <PreDraftHeader /> : <LiveHeader />}

        <Tabs />

        {activeTab === "Player Pool" && <PlayerPoolTab />}
        {activeTab === "Watchlist" && <WatchlistTab />}
        {activeTab === "Teams" && <TeamsTab />}
        {activeTab === "Draft Results" && <DraftResultsTab />}
      </div>

      <AppMenu
  open={menuOpen}
  onClose={() => setMenuOpen(false)}
  leagues={leagues}
  activeLeagueId={activeLeague?.id ?? null}
  setActiveLeague={setActiveLeague}
  activeItem="Draft Room"
/>


      {modal?.type === "draftConfirm" && <DraftConfirmModal player={modal.player} />}

{modal?.type === "playerCard" && (
  <PlayerCardModal
    onClose={() => setModal(null)}
    player={{
      ...modal.player,
      // ensure the modal always gets live status fields if available
      status: (getLivePlayerById(modal.player.id)?.status ?? modal.player.status ?? null) as any,
      weeklyStatus: getLivePlayerById(modal.player.id)?.weeklyStatus ?? (modal.player as any).weeklyStatus,
    }}
    // IMPORTANT: don't pass "status" prop anymore unless you want it to override the sheet
    // status={...}  <-- remove this line

    stats={modal.player.stats ?? {}}
    teamLabel={getPlayerTeamName(modal.player.id) ?? "Available"}
    initialTab="Stats"
    actions={
      isDrafted(modal.player.id)
        ? []
        : phase === "preDraft"
        ? [
            {
              label: !!watchlist[modal.player.id] ? "Remove Watchlist" : "Add Watchlist",
              onClick: () => toggleWatchlist(modal.player.id),
              variant: "primary",
            },
          ]
        : [
            {
              label: !!watchlist[modal.player.id] ? "Remove from Watchlist" : "Add to Watchlist",
              onClick: () => toggleWatchlist(modal.player.id),
              variant: "secondary",
            },
            {
              label: "Draft",
              onClick: () => onDraftClick(modal.player),
              variant: "primary",
            },
          ]
    }
  />
)}


    </main>
  );
}

// helpers
function pad2(n: number) {
  const s = String(n);
  return s.length === 1 ? `0${s}` : s;
}

function formatMMSS(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${pad2(s)}`;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
