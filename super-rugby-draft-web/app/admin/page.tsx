"use client";
// app/admin/page.tsx — the site admin's page (Ethan). Small edits without going into Supabase:
// players (add / edit / hide, weekly status), fixture difficulty ratings, and regathering stats
// and finalising a round again. Every request is checked on the server (admin only).

import React, { useState } from "react";
import { cardStyle, tabButton } from "@/components/admin/shared";
import { BackupsTab } from "@/components/admin/BackupsTab";
import { CoachTab } from "@/components/admin/CoachTab";
import { DifficultyTab } from "@/components/admin/DifficultyTab";
import { HistoryTab } from "@/components/admin/HistoryTab";
import { PlayersTab } from "@/components/admin/PlayersTab";
import { RoundsTab } from "@/components/admin/RoundsTab";
import { ScoringTab } from "@/components/admin/ScoringTab";
import { StatusTab } from "@/components/admin/StatusTab";
import { SeasonCheckTab } from "@/components/admin/SeasonCheckTab";
import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import { currentSeasonYear, SEASONS } from "@/lib/season";

type Tab = "Players" | "Status" | "Difficulty" | "Rounds" | "Scoring" | "History" | "Coach" | "Season check" | "Backups";
export default function AdminPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const [tab, setTab] = useState<Tab>("Players");
  const [season, setSeason] = useState(currentSeasonYear());
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }}
      />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 22 }}>Admin</div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
              Players, statuses, difficulty, rounds, scoring, history, the season check and backups
            </div>
            {tab === "Players" || tab === "Difficulty" || tab === "Season check" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                {Object.keys(SEASONS).map(Number).sort().map((y) => (
                  <button key={y} style={{ ...tabButton(y === season), flex: "0 0 auto", padding: "0 16px" }} onClick={() => setSeason(y)}>
                    {y}
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {(["Players", "Status", "Difficulty", "Rounds", "Scoring", "History", "Coach", "Season check", "Backups"] as Tab[]).map((t) => (
                <button key={t} style={{ ...tabButton(t === tab), flex: "1 1 auto", padding: "0 12px" }} onClick={() => { setTab(t); setMsg(null); }}>{t}</button>
              ))}
            </div>
          </div>

          {msg ? (
            <div style={{ ...cardStyle, background: "#dcfce7", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{msg}</span>
              <button onClick={() => setMsg(null)} style={{ background: "transparent", border: "none", color: "inherit", fontWeight: 700, cursor: "pointer" }}>×</button>
            </div>
          ) : null}

          <div style={cardStyle}>
            {tab === "Players" ? <PlayersTab key={season} season={season} setMsg={setMsg} /> : null}
            {tab === "Difficulty" ? <DifficultyTab key={season} season={season} setMsg={setMsg} /> : null}
            {tab === "Rounds" ? <RoundsTab setMsg={setMsg} /> : null}
            {tab === "Status" ? <StatusTab setMsg={setMsg} /> : null}
            {tab === "Scoring" ? <ScoringTab setMsg={setMsg} /> : null}
            {tab === "History" ? <HistoryTab setMsg={setMsg} /> : null}
            {tab === "Coach" ? <CoachTab season={season} setMsg={setMsg} /> : null}
            {tab === "Season check" ? <SeasonCheckTab key={season} season={season} /> : null}
            {tab === "Backups" ? <BackupsTab setMsg={setMsg} /> : null}
          </div>
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues as never}
        activeLeagueId={activeLeagueId as never}
        setActiveLeague={setActiveLeague as never}
        activeItem="Admin"
      />
    </main>
  );
}
