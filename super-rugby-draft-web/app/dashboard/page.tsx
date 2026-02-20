"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveUser } from "@/lib/session";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import type { League } from "@/lib/league/types";
import { useDraftStore } from "@/lib/draft/store";

type ActiveMenu =
  | "Dashboard"
  | "Matchup"
  | "Team Selection"
  | "Transactions"
  | "League"
  | "Draft Room"
  | "Fixtures"
  | "Team Details";

type DashboardState = "noLeague" | "preDraft" | "postDraft";

type Movement = "same" | "up" | "down";
type StandingRow = {
  rank: number;
  team: string;
  pts: number;
  movement: Movement;
};

type Player = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string; // e.g. CHI
  posAbbrev: string; // e.g. FH
  posName: string; // e.g. Flyhalf
  form: number;
  points?: number;
};

type Modal =
  | null
  | { type: "addPlayer"; player: Player }
  | { type: "playerCard"; player: Player };

export default function DashboardPage() {
  const router = useRouter();

  // ✅ Route protection
  useEffect(() => {
    const user = getActiveUser();
    if (!user) router.replace("/");
  }, [router]);

  const leagues = useLeagueStore((s) => s.leagues);
const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
const maybeAutoStartDraft = useLeagueStore((s) => s.maybeAutoStartDraft);

// Active league (object)
const activeLeague = useMemo(() => {
  return leagues.find((l) => l.id === activeLeagueId) ?? null;
}, [leagues, activeLeagueId]);

useEffect(() => {
  if (!activeLeagueId) return;

  // run immediately (covers "already past" cases)
  maybeAutoStartDraft(activeLeagueId);

  // keep checking while on dashboard
  const t = setInterval(() => {
    maybeAutoStartDraft(activeLeagueId);
  }, 1000);

  return () => clearInterval(t);
}, [activeLeagueId, maybeAutoStartDraft]);

// ✅ Pull latest rosters from Supabase whenever you enter/switch leagues
useEffect(() => {
  if (!activeLeagueId) return;
  useDraftStore.getState().loadRostersFromDb(activeLeagueId);
}, [activeLeagueId]);

const dashState: DashboardState = useMemo(() => {
  if (!activeLeague) return "noLeague";
  if (activeLeague.draftStatus === "complete") return "postDraft";
  return "preDraft";
}, [activeLeague]);

// ✅ DEV override (lets you force dashboard states while building)
const [devDashOverride, setDevDashOverride] = useState<"real" | DashboardState>("real");

// The state the UI actually uses
const effectiveDashState: DashboardState =
  devDashOverride === "real" ? dashState : devDashOverride;

  // DEV: switch dashboards while we build

  const teams = useMemo(() => ["Team", "Stouty's Studs", "Stouty's Studs 2"], []);
  const [currentTeam, setCurrentTeam] = useState("Stouty's Studs");

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>("Dashboard");

  const [modal, setModal] = useState<Modal>(null);

  // -----------------------
  // Mock / placeholder data
  // -----------------------
  const leagueName = activeLeague?.name ?? "League";
const draftText = activeLeague?.draftDateTimeText ?? "TBC";


  // Header banner (example only)
  const bannerTitle = "Week 4 Waiver Deadline";
  const bannerTime = "Friday 22nd February 22:30";

  // Post-draft score card
  const weekLabel = "Week 4";
  const userScore = 600;
  const oppScore = 600;
  const userRecord = "(16-16-0)";
  const oppRecord = "(16-16-0)";

  // Upcoming fixture card (next matchup)
  const upcomingWeek = "Week 8";
  const upcomingHome = "Stouty's Studs";
  const upcomingAway = "Stouty's Studs";

  // Standings (variable team count; max 10)
  const standings: StandingRow[] = useMemo(() => {
    const teamCount = 6; // later from league settings
    const movements: Movement[] = ["same", "up", "down", "same", "up", "down"];
    return Array.from({ length: teamCount }).map((_, i) => ({
      rank: i + 1,
      team: "Stouty's Studs",
      pts: 45,
      movement: movements[i % movements.length],
    }));
  }, []);

  const bestAvailablePlayers: Player[] = useMemo(() => {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: `p-${i}`,
      firstName: "Damian",
      lastName: "McKenzie",
      teamCode: "CHI",
      posAbbrev: "FH",
      posName: "Flyhalf",
      form: 78.9,
    }));
  }, []);

  // For now: POTW blank until a week is complete
  const playerOfWeek: Player | null = null;

  // Waivers vs Free Agency button colour
  const isWaivers = true;
  const addBtnBg = isWaivers ? "#FACC15" : "#22C55E";

  function onMenuSelect(item: ActiveMenu) {
    setActiveMenu(item);
    setMenuOpen(false);

    if (item === "Dashboard") router.replace("/dashboard");
    if (item === "League") router.push("/league");
    if (item === "Draft Room") router.push("/draft-room");
  }

  // -----------------------
  // Styles
  // -----------------------
  const cardStyle: React.CSSProperties = {
    borderRadius: 18,
    background: "rgba(255,255,255,0.35)",
    padding: 14,
    backdropFilter: "blur(10px)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
  };

  const primaryButton: React.CSSProperties = {
    height: 40,
    width: "100%",
    borderRadius: 999,
    background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
    color: "white",
    fontSize: 13,
    fontWeight: 800,
    border: "2px solid rgba(255,255,255,0.85)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.18)",
    cursor: "pointer",
  };

  const secondaryButton: React.CSSProperties = {
    height: 36,
    width: "100%",
    borderRadius: 999,
    background: "rgba(0,0,0,0.12)",
    color: "white",
    fontSize: 12,
    fontWeight: 800,
    border: "2px solid rgba(255,255,255,0.85)",
    cursor: "pointer",
  };

  function MovementCircle({ movement }: { movement: Movement }) {
    const isUp = movement === "up";
    const isDown = movement === "down";
    const isSame = movement === "same";

    const bg = isUp ? "#22C55E" : isDown ? "#EF4444" : "rgba(255,255,255,0.22)";
    const symbol = isUp ? "▲" : isDown ? "▼" : "=";

    return (
      <span
        style={{
          width: 20,
          height: 20,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: bg,
          color: "white",
          fontWeight: 900,
          fontSize: isSame ? 12 : 11,
          lineHeight: "12px",
        }}
      >
        {symbol}
      </span>
    );
  }

  function JerseyTile({ size = 36 }: { size?: number }) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: "rgba(0,0,0,0.18)",
          border: "1px solid rgba(255,255,255,0.22)",
          display: "grid",
          placeItems: "center",
          fontWeight: 900,
          fontSize: 10,
          opacity: 0.9,
        }}
        aria-hidden="true"
      >
        👕
      </div>
    );
  }

  // -----------------------
  // Layout blocks
  // -----------------------
  function Header() {
    return (
      <>
        {/* DEV state switch (hidden in production) */}
{process.env.NODE_ENV !== "production" && (
  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
    <label style={{ fontSize: 11, fontWeight: 900, opacity: 0.85 }}>
      DEV:&nbsp;
      <select
        value={devDashOverride}
        onChange={(e) => setDevDashOverride(e.target.value as any)}
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
        <option value="real">Real (store)</option>
        <option value="noLeague">No League</option>
        <option value="preDraft">Pre Draft</option>
        <option value="postDraft">Post Draft</option>
      </select>
    </label>
  </div>
)}


        {/* Hamburger */}
        <div style={{ display: "flex", alignItems: "center" }}>
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
        </div>

        {/* Deadline banner */}
        <div
          style={{
            marginTop: 10,
            borderRadius: 999,
            overflow: "hidden",
            boxShadow: "0 10px 20px rgba(0,0,0,0.18)",
          }}
        >
          <div
            style={{
              background: "#FACC15",
              color: "#0f172a",
              textAlign: "center",
              padding: "6px 12px",
              fontWeight: 800,
              fontSize: 11,
            }}
          >
            {bannerTitle}
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.88)",
              color: "#0f172a",
              textAlign: "center",
              padding: "6px 12px",
              fontWeight: 700,
              fontSize: 11,
              borderTop: "1px solid rgba(15,23,42,0.12)",
            }}
          >
            {bannerTime}
          </div>
        </div>
      </>
    );
  }

  function NoLeague() {
    return (
      <div style={{ marginTop: 14 }}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", fontSize: 16, fontWeight: 900 }}>
            No League Joined
          </div>
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            <button style={primaryButton} onClick={() => router.push("/league")}>
  Join League
</button>
<button style={primaryButton} onClick={() => router.push("/league")}>
  Create New League
</button>

          </div>
        </div>
      </div>
    );
  }

  function PreDraft() {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: 16 }}>
            {leagueName}
          </div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 800 }}>
            Pre Draft
          </div>

          <div
            style={{
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.28)",
              paddingTop: 10,
            }}
          >
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 900 }}>Draft Date</div>
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 20, fontWeight: 900 }}>
              {draftText}

            </div>

            <button
              style={{ ...primaryButton, marginTop: 12 }}
              onClick={() => router.push("/draft-room")}
            >
              Go to Draftroom
            </button>
          </div>
        </div>

        <StandingsCard />
        <CurrentTeamSelector />
      </div>
    );
  }

  function PostDraft() {
    return (
      <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
        {/* League / matchup card */}
        <div style={cardStyle}>
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: 16 }}>
            {leagueName}
          </div>
          <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 800 }}>
            {weekLabel}
          </div>

          <div
            style={{
              marginTop: 10,
              borderTop: "1px solid rgba(255,255,255,0.28)",
              paddingTop: 10,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <ScoreBlock score={userScore} team={currentTeam} record={userRecord} align="left" />
            <ScoreBlock score={oppScore} team={"Stouty's Studs"} record={oppRecord} align="right" />
          </div>

          <button style={{ ...primaryButton, marginTop: 12 }} onClick={() => alert("Matchup page later")}>
            View Matchup
          </button>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button style={secondaryButton} onClick={() => alert("Team Selection page later")}>
              Select Team
            </button>
            <button style={secondaryButton} onClick={() => alert("Transfers page later")}>
              Make Transfers
            </button>
          </div>
        </div>

        {/* Upcoming fixture */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Upcoming Fixture</div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(0,0,0,0.10)",
              border: "1px solid rgba(255,255,255,0.14)",
              padding: 12,
            }}
          >
            <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, opacity: 0.85 }}>
              {upcomingWeek}
            </div>

            <div
              style={{
                marginTop: 8,
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              <div style={{ textAlign: "left" }}>{upcomingHome}</div>
              <div style={{ opacity: 0.85 }}>v</div>
              <div style={{ textAlign: "right" }}>{upcomingAway}</div>
            </div>
          </div>
        </div>

        <StandingsCard />

        {/* Player of the week */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Player of the Week</div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
              padding: 10,
              minHeight: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "#0f172a",
            }}
          >
            {playerOfWeek ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <JerseyTile size={36} />
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 12 }}>
                      {playerOfWeek.firstName} {playerOfWeek.lastName}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      {playerOfWeek.teamCode} — {playerOfWeek.posName}
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 900 }}>{playerOfWeek.points ?? 0}pts</div>
              </>
            ) : (
              <div style={{ opacity: 0.35, fontWeight: 800, fontSize: 12 }} />
            )}
          </div>

          <button
            style={{ ...primaryButton, marginTop: 10, height: 34, fontSize: 12 }}
            onClick={() => router.push("/team-of-the-week")}
          >
            Team of the Week
          </button>
        </div>

        {/* Best available players */}
        <div style={cardStyle}>
          <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
            Best Available Players
          </div>

          <div
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid rgba(0,0,0,0.08)",
              overflow: "hidden",
              color: "#0f172a",
            }}
          >
            <div style={{ padding: 5, fontSize: 10, fontWeight: 600, opacity: 0.7 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 64px 44px", gap: 10 }}>
                <div />
                <div style={{ textAlign: "right" }}>Form</div>
                <div />
              </div>
            </div>

            <div style={{ display: "grid" }}>
              {bestAvailablePlayers.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setModal({ type: "playerCard", player: p })}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 64px 44px",
                      gap: 10,
                      alignItems: "center",
                      padding: "5px 10px",
                      borderTop: idx === 0 ? "1px solid rgba(0,0,0,0.08)" : undefined,
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <JerseyTile size={34} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {p.firstName[0]}. {p.lastName}
                        </div>
                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                          {p.teamCode} — {p.posName}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontWeight: 800, fontSize: 12 }}>
                      {p.form.toFixed(1)}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ type: "addPlayer", player: p });
                        }}
                        aria-label="Add player"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          border: "none",
                          background: addBtnBg,
                          color: "white",
                          fontWeight: 700,
                          fontSize: 36,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div style={{ padding: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => alert("Player pool page later")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#0f172a",
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: "underline",
                  cursor: "pointer",
                  padding: 0,
                  opacity: 0.75,
                }}
              >
                View All Players
              </button>
            </div>
          </div>
        </div>

        <CurrentTeamSelector />
      </div>
    );
  }

  function ScoreBlock({
    score,
    team,
    record,
    align,
  }: {
    score: number;
    team: string;
    record: string;
    align: "left" | "right";
  }) {
    return (
      <div style={{ textAlign: align as any }}>
        <div style={{ fontSize: 34, fontWeight: 900, lineHeight: "34px" }}>{score}</div>
        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900 }}>{team}</div>
        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 800, opacity: 0.9 }}>{record}</div>
      </div>
    );
  }

  function StandingsCard() {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>{leagueName}</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "56px 1fr 44px",
            gap: 8,
            fontSize: 11,
            fontWeight: 900,
            opacity: 0.9,
            padding: "0 6px 6px 6px",
          }}
        >
          <div>Rank</div>
          <div>Team</div>
          <div style={{ textAlign: "right" }}>Pts</div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {standings.map((r) => (
            <div
              key={r.rank}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr 44px",
                gap: 8,
                alignItems: "center",
                borderRadius: 10,
                background: "rgba(0,0,0,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
                padding: "6px 6px",
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 16, textAlign: "right", fontWeight: 900 }}>{r.rank}</span>
                <MovementCircle movement={r.movement} />
              </div>

              <div style={{ fontWeight: 600 }}>{r.team}</div>

              <div style={{ textAlign: "right", fontWeight: 900 }}>{r.pts}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => router.push("/league")}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.95)",
              fontSize: 11,
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
              padding: 0,
            }}
          >
            View Full Standings
          </button>
        </div>
      </div>
    );
  }

  function CurrentTeamSelector() {
    return (
      <div style={{ marginTop: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>Current Team</div>

        <div
          style={{
            background: "rgba(255,255,255,0.92)",
            borderRadius: 10,
            padding: "8px 10px",
            boxShadow: "0 10px 20px rgba(0,0,0,0.12)",
          }}
        >
          <select
            value={currentTeam}
            onChange={(e) => setCurrentTeam(e.target.value)}
            style={{
              width: "100%",
              height: 34,
              borderRadius: 8,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              fontWeight: 700,
              color: "#0f172a",
            }}
          >
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // -----------------------
  // Popups (keep Add Player here for now)
  // -----------------------
  function ModalOverlay({
    children,
    onClose,
  }: {
    children: React.ReactNode;
    onClose: () => void;
  }) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 10000 }}>
        <div
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
          onClick={onClose}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: "92%",
            maxWidth: 420,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  function AddPlayerPopup({ player }: { player: Player }) {
    const replaceOptions = Array.from({ length: 6 }).map((_, i) => ({
      id: `r-${i}`,
      firstName: "Damian",
      lastName: "McKenzie",
      teamCode: "CHI",
      posName: "Flyhalf",
      value: 200,
    }));

    return (
      <div
        style={{
          borderRadius: 14,
          background: "rgba(255,255,255,0.20)",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          overflow: "hidden",
          color: "white",
        }}
      >
        <div style={{ padding: 12, fontWeight: 900, fontSize: 12 }}>You have requested to sign:</div>

        <div
          style={{
            margin: "0 12px 12px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.92)",
            color: "#0f172a",
            padding: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <JerseyTile size={34} />
            <div>
              <div style={{ fontWeight: 900, fontSize: 12 }}>
                {player.firstName[0]}. {player.lastName}
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {player.teamCode} — {player.posName}
              </div>
            </div>
          </div>
          <div style={{ fontWeight: 900, fontSize: 12 }}>200</div>
        </div>

        <div style={{ padding: "0 12px 10px 12px", fontWeight: 900, fontSize: 12 }}>
          Which player would you like to replace?
        </div>

        <div
          style={{
            margin: "0 12px 12px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.92)",
            color: "#0f172a",
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          {replaceOptions.map((r, idx) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "10px",
                borderBottom:
                  idx === replaceOptions.length - 1 ? "none" : "1px solid rgba(0,0,0,0.08)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <JerseyTile size={30} />
                <div>
                  <div style={{ fontWeight: 900, fontSize: 12 }}>
                    {r.firstName[0]}. {r.lastName}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>
                    {r.teamCode} — {r.posName}
                  </div>
                </div>
              </div>

              <button
                onClick={() => alert("Replace selection later")}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "none",
                  background: "#EF4444",
                  color: "white",
                  fontWeight: 900,
                  fontSize: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                aria-label="Select to replace"
              >
                –
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: "0 12px 12px 12px", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setModal(null)}
            style={{
              height: 34,
              borderRadius: 999,
              padding: "0 14px",
              background: "rgba(0,0,0,0.18)",
              border: "2px solid rgba(255,255,255,0.9)",
              color: "white",
              fontWeight: 800,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel Transfer
          </button>
        </div>
      </div>
    );
  }

  // -----------------------
  // Render
  // -----------------------
  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      {/* Full-viewport gradient background */}
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
        <Header />
        {effectiveDashState === "noLeague" && <NoLeague />}
{effectiveDashState === "preDraft" && <PreDraft />}
{effectiveDashState === "postDraft" && <PostDraft />}

      </div>

      <AppMenu
  open={menuOpen}
  onClose={() => setMenuOpen(false)}
  leagues={leagues}
  activeLeagueId={activeLeagueId}
  setActiveLeague={setActiveLeague}
  activeItem="Dashboard"
/>



      {/* MODALS */}
      {modal?.type === "addPlayer" && (
        <ModalOverlay onClose={() => setModal(null)}>
          <AddPlayerPopup player={modal.player} />
        </ModalOverlay>
      )}

      {modal?.type === "playerCard" && (
        <PlayerCardModal
          player={{
            id: modal.player.id,
            firstName: modal.player.firstName,
            lastName: modal.player.lastName,
            posAbbrev: modal.player.posAbbrev,
            posName: modal.player.posName,
            teamCode: modal.player.teamCode,
          }}
          status={"starting"} // later: starting/benched/out/null
          teamLabel={currentTeam}
          actions={[
            { label: "Watch", onClick: () => alert("Watch later") },
            {
              label: "Submit Claim",
              onClick: () => setModal({ type: "addPlayer", player: modal.player }),
            },
          ]}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}
