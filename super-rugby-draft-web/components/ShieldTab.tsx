"use client";
// components/ShieldTab.tsx
// The League page's Shield tab (Ethan, Nov 2026): the holder and their defences, the next shield
// game, this season's shield games and every holder so far. Rules: lib/league/shield.ts.
import React, { useEffect, useState } from "react";
import { ShieldIcon } from "@/components/AwardIcons";
import { TeamAvatar } from "@/components/TeamAvatar";
import { roundLabel } from "@/lib/season";
import type { LeagueShield } from "@/lib/league/shieldServer";
import { cleanShieldRewards, shieldRewardLines } from "@/lib/league/shield";

type TeamLite = { id: string; name: string; ownerName?: string | null; pictureUrl?: string | null; userInitials?: string | null; initials?: string | null; stars?: number };

const box: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};
const heading: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 600,
  textAlign: "center",
  background: "rgba(15,23,42,0.08)",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  letterSpacing: 0.4,
};
const row: React.CSSProperties = { padding: "8px 10px", borderTop: "1px solid rgba(0,0,0,0.08)", fontSize: 12 };
const muted: React.CSSProperties = { fontSize: 11, fontWeight: 500, opacity: 0.6 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ShieldTab({ leagueId, teams }: { leagueId: string; teams: TeamLite[] }) {
  const [data, setData] = useState<{ leagueId: string; shield: LeagueShield } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leagues/shield?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData({ leagueId, shield: j.shield as LeagueShield });
        else setError(j?.error ?? "Couldn't load the shield");
      })
      .catch(() => !cancelled && setError("Couldn't load the shield"));
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const team = (id: string | null | undefined) => teams.find((t) => t.id === id) ?? null;
  const name = (id: string | null | undefined) => team(id)?.name ?? "—";
  const s = data && data.leagueId === leagueId ? data.shield : null;

  if (error) return <div style={{ ...box, padding: 12, fontSize: 12, fontWeight: 600 }}>{error}</div>;
  if (!s) return <div style={{ ...box, padding: 12, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Loading…</div>;

  const holder = team(s.holderTeamId);
  const shieldGames = s.events.filter((e) => e.kind !== "awarded").slice().reverse();
  const awarded = s.events.find((e) => e.kind === "awarded");
  // drawn at random / picked by the commissioner before the season (no "awarded" game)
  const started = s.reigns.find((r) => r.leagueId === leagueId && (r.how === "drawn" || r.how === "chosen")) ?? null;
  const drawPending = s.start?.method === "random" && !s.start.teamId && !s.carriedOver;

  return (
    <div>
      {/* Holder */}
      <div style={{ ...box, padding: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "center" }}>
        <ShieldIcon size={64} title={s.name} />
        <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div>
          {!s.enabled ? (
            <div style={muted}>Switched off by the commissioner for now. The holder keeps it until it&apos;s back on.</div>
          ) : null}
          {holder ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TeamAvatar pictureUrl={holder.pictureUrl ?? null} initials={holder.userInitials ?? holder.initials ?? ""} size={24} stars={holder.stars} />
                <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{holder.name}</span>
              </div>
              <div style={muted}>
                {holder.ownerName ? `${holder.ownerName} · ` : ""}
                {plural(s.holder?.defences ?? 0, "defence")}
                {s.holder ? ` · held since ${roundLabel(s.holder.fromWeek, s.holder.season)} ${s.holder.season}` : ""}
              </div>
            </>
          ) : s.holder ? (
            <div style={muted}>Held by {s.holder.teamName}, who isn&apos;t in this league.</div>
          ) : (
            <div style={muted}>
              {drawPending
                ? "Not drawn yet: it's drawn at random once the draft finishes, and the team holds it from round 1."
                : "Not won yet: it goes to the highest score in the first round (most tries if level)."}
            </div>
          )}
        </div>
      </div>

      {/* What the holder gets (the commissioner's choice) */}
      {(() => {
        const lines = shieldRewardLines(cleanShieldRewards(s.rewards));
        return lines.length ? (
          <div style={box}>
            <div style={heading}>Holder&apos;s rewards</div>
            {lines.map((l) => (
              <div key={l} style={{ ...row, fontWeight: 600 }}>
                {l}
              </div>
            ))}
          </div>
        ) : null;
      })()}

      {/* Next shield game */}
      {s.enabled ? (
        <div style={box}>
          <div style={heading}>Next Shield Game</div>
          <div style={row}>
            {s.next ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(s.next.homeTeamId)}</span>
                  <ShieldIcon size={16} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700 }}>{roundLabel(s.next.week)}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, opacity: 0.6, letterSpacing: 0.5 }}>HOLDER v CHALLENGER</div>
                </div>
                <div style={{ textAlign: "right", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name(s.next.awayTeamId)}</div>
              </div>
            ) : (
              <div style={muted}>
                {holder ? "The holder has no home games left in the regular season. It's not on the line in the finals." : drawPending ? "Drawn once the draft finishes." : "Decided after the first round."}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* This season */}
      <div style={box}>
        <div style={heading}>This Season</div>
        {started ? (
          <div style={row}>
            <span style={{ fontWeight: 700 }}>Before {roundLabel(started.fromWeek)}:</span> {started.teamName}{" "}
            {started.how === "drawn" ? "was drawn at random to start the season with it." : "was picked by the commissioner to start the season with it."}
          </div>
        ) : null}
        {awarded ? (
          <div style={row}>
            <span style={{ fontWeight: 700 }}>{roundLabel(awarded.week)}:</span> {name(awarded.holderTeamId)} won it with the top score.
          </div>
        ) : null}
        {shieldGames.map((e) => (
          <div key={`${e.week}-${e.kind}`} style={{ ...row, display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 8, alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 11 }}>{roundLabel(e.week)}</span>
            <span style={{ minWidth: 0 }}>
              {e.kind === "won" ? (
                <>
                  <b>{name(e.holderTeamId)}</b> took it off {name(e.otherTeamId)}
                </>
              ) : (
                <>
                  <b>{name(e.holderTeamId)}</b> defended against {name(e.otherTeamId)}
                </>
              )}
            </span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {e.homeScore ?? "–"}–{e.awayScore ?? "–"}
            </span>
          </div>
        ))}
        {!awarded && !shieldGames.length ? <div style={{ ...row, ...muted }}>No shield games yet this season.</div> : null}
      </div>

      {/* Every holder */}
      <div style={box}>
        <div style={heading}>Holders</div>
        <div style={{ ...row, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: 10, fontWeight: 700, opacity: 0.6, borderTop: "none" }}>
          <span>Team</span>
          <span style={{ textAlign: "right" }}>Defences</span>
        </div>
        {s.reigns.map((r, i) => (
          <div key={`${r.owner}-${r.season}-${r.fromWeek}-${i}`} style={{ ...row, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
            <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
              <span style={{ fontWeight: 700 }}>
                {r.teamName}
                {r.endedSeason == null ? " (holder)" : ""}
              </span>
              <span style={muted}>
                {r.how === "won" ? `Won off ${r.wonFromTeamName ?? "the holder"}` : r.how === "handed_back" ? "Handed back (the holder left)" : r.how === "reawarded" ? "Awarded again (top score)" : r.how === "drawn" ? "Drawn at random to start the season" : r.how === "chosen" ? "Picked by the commissioner to start the season" : "First holder (top score)"}
                {` · ${roundLabel(r.fromWeek, r.season)} ${r.season}`}
                {r.endedSeason != null ? (r.lostToTeamName ? ` · lost to ${r.lostToTeamName}, ${roundLabel(r.endedWeek ?? 1, r.endedSeason)} ${r.endedSeason}` : ` · left the league ${r.endedSeason}`) : ""}
              </span>
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.defences}</span>
          </div>
        ))}
        {!s.reigns.length ? <div style={{ ...row, ...muted }}>No holders yet.</div> : null}
      </div>
    </div>
  );
}
