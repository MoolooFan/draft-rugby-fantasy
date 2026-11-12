"use client";

// The weekly recap pop-up (plan item E7). Shown on the dashboard the first time you open the
// site after a round is finalised (once per league per round). Closing it marks it as seen.

import React, { useEffect, useState } from "react";
import { TeamAvatar } from "@/components/TeamAvatar";
import { CrownIcon, ShieldIcon, SpoonIcon } from "@/components/AwardIcons";
import type { Recap } from "@/lib/league/recap";
import type { ShieldRecap } from "@/lib/league/shield";

type TeamInfo = { name: string; initials: string | null; pictureUrl: string | null };
type RecapResponse = Recap & {
  latestWeek?: number;
  firstWeek?: number;
  weekLabel: string;
  nextWeekLabel: string | null;
  myTeamId: string;
  teams: Record<string, TeamInfo>;
  shield?: ShieldRecap | null;
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * The weekly recap. On its own it pops up once for the latest finalised round; with `week` it
 * opens that round's recap on request (viewing it again) and calls onClose when closed.
 */
export function WeeklyRecapModal({ leagueId, leagueName, week, onClose }: { leagueId: string | null | undefined; leagueName?: string; week?: number; onClose?: () => void }) {
  // the recap and which league it's for (switching league never shows the other league's)
  const [recap, setRecap] = useState<(RecapResponse & { forLeague: string }) | null>(null);
  const [open, setOpen] = useState(false);
  // viewing on request: the round being shown (the arrows move it)
  // (each opening mounts a fresh pop-up, so it starts at the asked round)
  const [viewWeek, setViewWeek] = useState<number | undefined>(week);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    const qs = viewWeek ? `&week=${viewWeek}` : "";
    fetch(`/api/recap?leagueId=${encodeURIComponent(leagueId)}${qs}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.ok || !j.recap || (!viewWeek && j.seen)) return;
        setRecap({ ...j.recap, latestWeek: j.latestWeek, firstWeek: j.firstWeek, forLeague: leagueId });
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId, viewWeek]);

  if (!open || !recap || !leagueId || recap.forLeague !== leagueId) return null;

  const team = (id: string | null | undefined): TeamInfo =>
    (id && recap.teams[id]) || { name: id ? "TBC" : "Bye", initials: null, pictureUrl: null };
  const me = team(recap.myTeamId);

  function close() {
    setOpen(false);
    onClose?.();
    if (week) return; // viewing again: nothing to mark
    fetch("/api/recap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ leagueId, week: recap!.week }),
    }).catch(() => {});
  }

  const section: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid rgba(15,23,42,0.10)" };
  const heading: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 };
  const m = recap.matchup;
  const resultStyle = (r: string): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    color: "white",
    background: r === "win" ? "#16a34a" : r === "loss" ? "#dc2626" : "#64748b",
  });
  const names = (ids: string[]) => ids.map((id) => (id === recap.myTeamId ? "You" : team(id).name)).join(" & ");

  return (
    <div
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 18 }}
    >
      <div
        role="dialog"
        aria-label={`${recap.weekLabel} recap`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 380,
          maxHeight: "86vh",
          overflowY: "auto",
          borderRadius: 18,
          background: "#ffffff",
          color: "#0f172a",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ padding: "12px 12px 10px", background: "linear-gradient(to right, rgb(15,23,42), rgb(13,148,136))", color: "white" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 900, fontStyle: "italic" }}>{recap.weekLabel} recap</div>
            {week ? (
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  aria-label="Previous round"
                  disabled={recap.week <= (recap.firstWeek ?? recap.week)}
                  onClick={() => setViewWeek(recap.week - 1)}
                  style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid rgba(255,255,255,0.5)", background: "transparent", color: "white", fontWeight: 900, cursor: "pointer", opacity: recap.week <= (recap.firstWeek ?? recap.week) ? 0.35 : 1 }}
                >
                  ‹
                </button>
                <button
                  aria-label="Next round"
                  disabled={recap.week >= (recap.latestWeek ?? recap.week)}
                  onClick={() => setViewWeek(recap.week + 1)}
                  style={{ width: 28, height: 28, borderRadius: 999, border: "1px solid rgba(255,255,255,0.5)", background: "transparent", color: "white", fontWeight: 900, cursor: "pointer", opacity: recap.week >= (recap.latestWeek ?? recap.week) ? 0.35 : 1 }}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
          {leagueName ? <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85 }}>{leagueName}</div> : null}
        </div>

        {/* Your matchup */}
        {m ? (
          <div style={{ ...section, borderTop: "none" }}>
            <div style={heading}>
              Your matchup{m.kind === "game" && m.label ? ` · ${m.label}` : ""}
              {m.kind === "game" && m.part ? ` (${m.part})` : ""}
            </div>
            {m.kind === "bye" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TeamAvatar pictureUrl={me.pictureUrl} initials={me.initials} size={36} />
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  Bye week{m.myScore != null ? ` · you scored ${m.myScore}` : ""}
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <TeamAvatar pictureUrl={me.pictureUrl} initials={me.initials} size={36} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.name}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{m.myScore ?? "-"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.5 }}>v</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, justifyContent: "flex-end", textAlign: "right" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team(m.opponentId).name}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{m.oppScore ?? "-"}</div>
                    </div>
                    <TeamAvatar pictureUrl={team(m.opponentId).pictureUrl} initials={team(m.opponentId).initials} size={36} />
                  </div>
                </div>
                <div style={{ marginTop: 8, textAlign: "center" }}>
                  <span style={resultStyle(m.result)}>
                    {m.result === "win" ? "WIN" : m.result === "loss" ? "LOSS" : m.result === "draw" ? "DRAW" : "TO BE DECIDED"}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Best player and biggest dud */}
        {recap.best || recap.dud ? (
          <div style={{ ...section, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {recap.best ? (
              <div>
                <div style={heading}>Best player</div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  {recap.best.name}
                  {recap.best.captain ? " (C)" : ""}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#16a34a" }}>{recap.best.points} pts</div>
              </div>
            ) : (
              <div />
            )}
            {recap.dud ? (
              <div>
                <div style={heading}>Biggest dud</div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>
                  {recap.dud.name}
                  {recap.dud.captain ? " (C)" : ""}
                </div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#dc2626" }}>{recap.dud.points} pts</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Crown and spoon */}
        {recap.crown || recap.spoon ? (
          <div style={{ ...section, display: "grid", gap: 8 }}>
            <div style={heading}>Around the league</div>
            {recap.crown ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CrownIcon size={22} />
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  Top score: <b>{names(recap.crown.teamIds)}</b> ({recap.crown.score})
                </div>
              </div>
            ) : null}
            {recap.spoon ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SpoonIcon size={22} />
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  Lowest score: <b>{names(recap.spoon.teamIds)}</b> ({recap.spoon.score})
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Ladder */}
        {recap.ladder ? (
          <div style={section}>
            <div style={heading}>Ladder</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              You&apos;re {ordinal(recap.ladder.after)} of {recap.ladder.teams}
              {recap.ladder.before == null ? null : recap.ladder.after < recap.ladder.before ? (
                <span style={{ color: "#16a34a" }}> · up {recap.ladder.before - recap.ladder.after}</span>
              ) : recap.ladder.after > recap.ladder.before ? (
                <span style={{ color: "#dc2626" }}> · down {recap.ladder.after - recap.ladder.before}</span>
              ) : (
                <span style={{ opacity: 0.6 }}> · no change</span>
              )}
            </div>
          </div>
        ) : null}

        {/* The Shield */}
        {recap.shield?.thisWeek ? (
          <div style={{ ...section, display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldIcon size={36} title={recap.shield.name} />
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              {(() => {
                const t = recap.shield.thisWeek;
                const n = recap.shield.name;
                const other = "otherTeamId" in t && t.otherTeamId ? team(t.otherTeamId).name : "";
                const score = "homeScore" in t && t.homeScore != null && t.awayScore != null ? ` (${t.homeScore}–${t.awayScore})` : "";
                switch (t.kind) {
                  case "you_awarded": return <>You won {n} with the top score of the round!</>;
                  case "you_won": return <>You took {n} off {other}{score}!</>;
                  case "you_defended": return <>You defended {n} against {other}{score}.</>;
                  case "you_lost": return <>You lost {n} to {other}{score}.</>;
                  case "you_challenged": return <>You challenged {other} for {n} and fell short{score}.</>;
                  case "news_awarded": return <>{team(t.holderTeamId).name} won {n} with the top score of the round.</>;
                  case "news_won": return <>{team(t.holderTeamId).name} took {n} off {t.otherTeamId ? team(t.otherTeamId).name : "the holder"}.</>;
                }
              })()}
            </div>
          </div>
        ) : null}

        {recap.shield?.secured ? (
          <div style={{ ...section, display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldIcon size={30} />
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              {recap.shield.secured.mine
                ? <>You&apos;ve secured {recap.shield.name} for the season: no home games left to lose it!</>
                : <>{team(recap.shield.secured.teamId).name} have secured {recap.shield.name} for the season: no home games left to lose it.</>}
            </div>
          </div>
        ) : null}

        {/* Next opponent */}
        {recap.next ? (
          <div style={section}>
            <div style={heading}>Next up{recap.nextWeekLabel ? ` · ${recap.nextWeekLabel}` : ""}</div>
            {recap.next.opponentId ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TeamAvatar pictureUrl={team(recap.next.opponentId).pictureUrl} initials={team(recap.next.opponentId).initials} size={28} />
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  v {team(recap.next.opponentId).name}
                  {recap.next.label ? ` · ${recap.next.label}` : ""}
                  {recap.shield?.next ? (
                    <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 900, color: "#6a4426" }}>
                      <ShieldIcon size={16} />
                      {recap.shield.next === "defending" ? `Shield defence: ${recap.shield.name} on the line at home` : `Shield challenge: you can take ${recap.shield.name} away`}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 800 }}>{recap.next.label ?? "Bye week"}</div>
            )}
          </div>
        ) : null}

        <div style={{ padding: 12, borderTop: "1px solid rgba(15,23,42,0.10)" }}>
          <button
            onClick={close}
            style={{ width: "100%", height: 38, borderRadius: 12, border: "none", background: "#22C55E", color: "white", fontWeight: 900, fontSize: 14, cursor: "pointer" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
