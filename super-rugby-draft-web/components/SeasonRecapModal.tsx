"use client";
// components/SeasonRecapModal.tsx
// The season recap (lib/league/seasonRecap.ts). On its own it pops up once when the league's
// season is over; with `open` it shows that league's season recap on request (viewing it again,
// from Team Details) and calls onClose when closed.
import React, { useEffect, useState } from "react";
import { CrownIcon, ShieldIcon, SpoonIcon } from "@/components/AwardIcons";
import type { SeasonRecap } from "@/lib/league/seasonRecap";

type TeamInfo = { name: string; initials: string | null; pictureUrl: string | null };
type Response = SeasonRecap & { leagueName: string; myTeamId: string; teams: Record<string, TeamInfo> };

const HONOUR: Record<string, string> = {
  champion: "Champions!",
  runner_up: "Runners-up",
  third: "Third place",
  semi_finalist: "Semi-finalists",
  wooden_spoon: "Wooden spoon",
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function SeasonRecapModal({ leagueId, open: asked, onClose }: { leagueId: string | null | undefined; open?: boolean; onClose?: () => void }) {
  const [recap, setRecap] = useState<(Response & { forLeague: string }) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    fetch(`/api/recap/season?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.ok || !j.recap || (!asked && j.seen)) return;
        setRecap({ ...j.recap, forLeague: leagueId });
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId, asked]);

  if (!open || !recap || !leagueId || recap.forLeague !== leagueId) return null;

  const team = (id: string | null | undefined) => (id && recap.teams[id]?.name) || "—";
  const you = (id: string | null | undefined) => (id === recap.myTeamId ? "You" : team(id));

  function close() {
    setOpen(false);
    onClose?.();
    if (asked) return;
    fetch("/api/recap/season", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ leagueId }),
    }).catch(() => {});
  }

  const section: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid rgba(15,23,42,0.10)" };
  const heading: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 };
  const line: React.CSSProperties = { fontSize: 13, fontWeight: 800 };
  const y = recap.you;

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 86, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 18 }}>
      <div
        role="dialog"
        aria-label={`${recap.season} season recap`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, maxHeight: "86vh", overflowY: "auto", borderRadius: 18, background: "#ffffff", color: "#0f172a", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}
      >
        <div style={{ padding: "12px 12px 10px", background: "linear-gradient(to right, rgb(15,23,42), rgb(13,148,136))", color: "white" }}>
          <div style={{ fontSize: 18, fontWeight: 900, fontStyle: "italic" }}>{recap.season} season recap</div>
          {recap.leagueName ? <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85 }}>{recap.leagueName}</div> : null}
        </div>

        {/* Your season */}
        <div style={{ ...section, borderTop: "none" }}>
          <div style={heading}>Your season</div>
          {y.honour ? <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>{HONOUR[y.honour] ?? ""}</div> : null}
          <div style={line}>
            {ordinal(y.position)} of {y.teams} on the ladder · {y.wins}-{y.draws ? `${y.draws}-` : ""}{y.losses}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>
            {y.pointsFor} points for, {y.pointsAgainst} against
          </div>
        </div>

        {/* Stories */}
        {recap.stories.length ? (
          <div style={section}>
            <div style={heading}>Your story</div>
            <div style={{ display: "grid", gap: 6 }}>
              {recap.stories.map((s, i) => (
                <div key={i} style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{s.text}</div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Best players */}
        {recap.topPlayers.length ? (
          <div style={section}>
            <div style={heading}>Your top scorers</div>
            <div style={{ display: "grid", gap: 4 }}>
              {recap.topPlayers.map((p, i) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800 }}>
                  <span>{i + 1}. {p.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.points} pts</span>
                </div>
              ))}
            </div>
            {recap.bestGame ? (
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#16a34a" }}>
                Best game: {recap.bestGame.name}, {recap.bestGame.points} in round {recap.bestGame.week}
              </div>
            ) : null}
            {recap.worstGame ? (
              <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>
                Biggest dud: {recap.worstGame.name}, {recap.worstGame.points} in round {recap.worstGame.week}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Shield, crowns and spoons */}
        {recap.shield || recap.crowns || recap.spoons ? (
          <div style={{ ...section, display: "grid", gap: 6 }}>
            <div style={heading}>Silverware</div>
            {recap.shield ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldIcon size={24} />
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  {recap.shield.won ? `Won ${recap.shield.name}${recap.shield.won > 1 ? ` ${recap.shield.won} times` : ""}` : recap.shield.holdsIt ? `Kept ${recap.shield.name}` : `Held ${recap.shield.name}`}
                  {` · ${recap.shield.defences} defence${recap.shield.defences === 1 ? "" : "s"}`}
                  {recap.shield.lost ? ` · lost it ${recap.shield.lost > 1 ? `${recap.shield.lost} times` : "once"}` : ""}
                  {recap.shield.holdsIt ? " · holding it into next season" : ""}
                </div>
              </div>
            ) : null}
            {recap.crowns ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CrownIcon size={20} />
                <div style={{ fontSize: 12, fontWeight: 800 }}>Top score of the round {recap.crowns} time{recap.crowns === 1 ? "" : "s"}</div>
              </div>
            ) : null}
            {recap.spoons ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SpoonIcon size={20} />
                <div style={{ fontSize: 12, fontWeight: 800 }}>Lowest score of the round {recap.spoons} time{recap.spoons === 1 ? "" : "s"}</div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* League roundup */}
        <div style={section}>
          <div style={heading}>Around the league</div>
          <div style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 700 }}>
            {recap.league.champion ? <div>Champions: <b>{you(recap.league.champion)}</b></div> : null}
            {recap.league.spoon ? <div>Wooden spoon: <b>{you(recap.league.spoon)}</b></div> : null}
            {recap.league.highestScore ? (
              <div>
                Highest score: <b>{you(recap.league.highestScore.teamId)}</b>, {recap.league.highestScore.score} in round {recap.league.highestScore.week}
              </div>
            ) : null}
            {recap.league.mostCrowns ? (
              <div>
                Most weekly crowns: <b>{recap.league.mostCrowns.teamIds.map(you).join(" & ")}</b> ({recap.league.mostCrowns.count})
              </div>
            ) : null}
            {recap.league.topPlayer ? (
              <div>
                Top player: <b>{recap.league.topPlayer.name}</b>, {recap.league.topPlayer.points} pts for {you(recap.league.topPlayer.teamId)}
              </div>
            ) : null}
          </div>
        </div>

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
