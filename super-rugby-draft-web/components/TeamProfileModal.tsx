"use client";
// components/TeamProfileModal.tsx
// A team's profile (Ethan, 20 Nov 2026): tap a team on the standings, power rankings, dashboard
// or matchup. Shows the current squad (each player with a Trade button, if it isn't your team),
// standings and power ranking with the movement since the round before, the Shield (holding it,
// or the next chance to win it) and the team's results. Data: app/api/leagues/team-profile.
// Opened from anywhere with useTeamProfileStore().openTeam(teamId); <TeamProfileHost /> is in
// app/layout.tsx.
import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTeamProfileStore } from "@/lib/league/teamProfileStore";
import { useLeagueStore } from "@/lib/league/store";
import { usePlayers, usePlayersStore, type PlayerFromSheet } from "@/lib/players/store";
import { formatProjection, projectionFor, useProjections } from "@/lib/projections/useProjections";
import { positionsLabel, playerPositions } from "@/lib/players/positions";
import { roundLabel } from "@/lib/season";
import type { TeamProfile, TeamProfileResult } from "@/lib/league/teamProfile";
import { TeamAvatar } from "@/components/TeamAvatar";
import { MovementCircle } from "@/components/MovementCircle";
import { StatusTag } from "@/components/StatusTag";
import { JerseyTile } from "@/components/transactions/helpers";
import { PlayerCardModal } from "@/components/PlayerCardModal";
import { ink, line, muted, num, soft, teal } from "@/lib/ui/theme";

const POS_ORDER = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"];

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const movementOf = (moved: number | null) => (moved == null ? null : moved > 0 ? "up" : moved < 0 ? "down" : "same");
const shortName = (p: Pick<PlayerFromSheet, "firstName" | "lastName">) => `${p.firstName ? `${p.firstName[0]}. ` : ""}${p.lastName}`;
const pts = (n: number | null) => (n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

export function TeamProfileHost() {
  const teamId = useTeamProfileStore((s) => s.teamId);
  const leagueId = useLeagueStore((s) => s.activeLeagueId);
  if (!teamId || !leagueId) return null;
  return <TeamProfileModal key={`${leagueId}|${teamId}`} leagueId={leagueId} teamId={teamId} />;
}

function TeamProfileModal({ leagueId, teamId }: { leagueId: string; teamId: string }) {
  const close = useTeamProfileStore((s) => s.close);
  const router = useRouter();
  const pathname = usePathname();
  const league = useLeagueStore((s) => (s.leagues ?? []).find((l) => l.id === leagueId) ?? null);
  const teamById = useMemo(() => new Map((league?.teams ?? []).map((t) => [t.id, t])), [league?.teams]);
  const team = teamById.get(teamId) ?? null;
  const nameOf = (id: string | null | undefined) => (id ? teamById.get(id)?.name ?? "Unknown team" : "Bye");

  usePlayers();
  const getById = usePlayersStore((s) => s.getById);
  const proj = useProjections(leagueId, "current");

  const [data, setData] = useState<TeamProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardPlayer, setCardPlayer] = useState<PlayerFromSheet | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leagues/team-profile?leagueId=${encodeURIComponent(leagueId)}&teamId=${encodeURIComponent(teamId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData(j.profile);
        else setError(j?.error ?? "Couldn't load this team");
      })
      .catch(() => !cancelled && setError("Couldn't load this team"));
    return () => {
      cancelled = true;
    };
  }, [leagueId, teamId]);

  // Esc closes (the player card, if open, first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (cardPlayer) setCardPlayer(null);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cardPlayer, close]);

  const isMine = !!data && data.myTeamId === teamId;
  const canTrade = !!data && !isMine && data.draftDone;

  const squad = useMemo(() => {
    const list = (ids: string[]) =>
      ids
        .map((id) => getById(id))
        .filter((p): p is PlayerFromSheet => !!p)
        .sort((a, b) => {
          const pa = POS_ORDER.indexOf(playerPositions(a)[0] ?? ""), pb = POS_ORDER.indexOf(playerPositions(b)[0] ?? "");
          return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || a.lastName.localeCompare(b.lastName);
        });
    return { active: list(data?.roster.active ?? []), ir: list(data?.roster.ir ?? []) };
  }, [data, getById]);

  function trade(p: PlayerFromSheet) {
    const qs = new URLSearchParams({ partnerTeamId: teamId, prefillRequestPlayerId: p.id });
    if (pathname) qs.set("returnTo", pathname);
    setCardPlayer(null);
    close();
    router.push(`/trade/propose?${qs.toString()}`);
  }

  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: muted };
  const tile: React.CSSProperties = { borderRadius: 12, background: soft, border: `1px solid ${line}`, padding: "10px 12px", display: "grid", gap: 4, minWidth: 0 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9500 }} role="dialog" aria-label={`${team?.name ?? "Team"} profile`}>
      <div onClick={close} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "94%",
          maxWidth: 520,
          maxHeight: "92svh",
          overflowY: "auto",
          borderRadius: 16,
          background: "white",
          color: ink,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
      >
        {/* header */}
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "white", display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 10px", borderBottom: `1px solid ${line}` }}>
          <TeamAvatar pictureUrl={team?.pictureUrl} initials={team?.userInitials ?? team?.initials} size={44} stars={team?.stars} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team?.name ?? "Team"}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>
              {team?.ownerName ?? team?.userId ?? ""}
              {isMine ? " · Your team" : ""}
            </div>
          </div>
          <button onClick={close} aria-label="Close" style={{ border: "none", background: "rgba(15,23,42,0.06)", borderRadius: 999, width: 30, height: 30, fontWeight: 700, cursor: "pointer", color: ink, flexShrink: 0 }}>
            ✕
          </button>
        </div>

        <div style={{ padding: 12, display: "grid", gap: 14 }}>
          {error ? <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}
          {!data && !error ? <div style={{ color: muted, fontSize: 13, fontWeight: 500 }}>Loading…</div> : null}

          {data ? (
            <>
              {/* standings + power */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={tile}>
                  <div style={sectionTitle}>Standings</div>
                  {data.standings ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ ...num, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{ordinal(data.standings.rank)}</span>
                        {movementOf(data.standings.moved) ? <MovementCircle movement={movementOf(data.standings.moved)!} moved={data.standings.moved ?? 0} size={18} /> : null}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: muted }}>
                        {data.standings.won}-{data.standings.drawn}-{data.standings.lost} · {pts(data.standings.ladderPoints)} pts
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>Starts after the first round</div>
                  )}
                </div>
                <div style={tile}>
                  <div style={sectionTitle}>Power ranking</div>
                  {data.power ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ ...num, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{ordinal(data.power.rank)}</span>
                        {movementOf(data.power.moved) ? <MovementCircle movement={movementOf(data.power.moved)!} moved={data.power.moved ?? 0} size={18} /> : null}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: muted }}>
                        {data.power.simulated ? `${Math.round(data.power.titlePct)}% title chance` : "On squad strength"}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>After the draft</div>
                  )}
                </div>
              </div>

              {/* the Shield */}
              {data.shield ? <ShieldLine shield={data.shield} season={data.season} nameOf={nameOf} /> : null}

              {/* squad */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={sectionTitle}>Squad</div>
                  {proj ? <div style={{ fontSize: 10, fontWeight: 600, color: muted }}>Proj {roundLabel(proj.week, data.season).replace(/^Round /, "R")}</div> : null}
                </div>
                {!squad.active.length && !squad.ir.length ? (
                  <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>{data.draftDone ? "No players." : "Squads are picked in the draft."}</div>
                ) : null}
                {squad.active.map((p) => (
                  <PlayerRow key={p.id} p={p} proj={projectionFor(proj, p.id)?.pts ?? null} onOpen={() => setCardPlayer(p)} onTrade={canTrade ? () => trade(p) : null} />
                ))}
                {squad.ir.length ? (
                  <>
                    <div style={{ ...sectionTitle, marginTop: 4 }}>IR</div>
                    {squad.ir.map((p) => (
                      <PlayerRow key={p.id} p={p} proj={null} onOpen={() => setCardPlayer(p)} onTrade={null} note="Can't be traded from IR" />
                    ))}
                  </>
                ) : null}
              </div>

              {/* results */}
              <div style={{ display: "grid", gap: 6 }}>
                <div style={sectionTitle}>Results</div>
                {data.results.length ? (
                  data.results.map((r, i) => <ResultRow key={`${r.week}-${r.kind}-${i}`} r={r} season={data.season} nameOf={nameOf} />)
                ) : (
                  <div style={{ fontSize: 12, fontWeight: 500, color: muted }}>No results yet.</div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <PlayerCardModal
        open={!!cardPlayer}
        player={cardPlayer as never}
        teamLabel={team?.name}
        actions={cardPlayer && canTrade && squad.active.some((p) => p.id === cardPlayer.id) ? [{ label: "Trade", onClick: () => trade(cardPlayer) }] : []}
        hideActions={!(cardPlayer && canTrade && squad.active.some((p) => p.id === cardPlayer.id))}
        onClose={() => setCardPlayer(null)}
      />
    </div>
  );
}

function PlayerRow({ p, proj, onOpen, onTrade, note }: { p: PlayerFromSheet; proj: number | null; onOpen: () => void; onTrade: (() => void) | null; note?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 12, background: soft, border: `1px solid ${line}`, padding: "6px 8px" }}>
      <button onClick={onOpen} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <JerseyTile teamCode={p.teamCode} size={32} />
        <span style={{ display: "grid", minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(p)}</span>
            <StatusTag player={p} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 500, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.teamCode} · {positionsLabel(p)}
            {note ? ` · ${note}` : ""}
          </span>
        </span>
      </button>
      {proj != null ? <span style={{ ...num, fontSize: 14, fontWeight: 600, minWidth: 34, textAlign: "right" }}>{formatProjection(proj)}</span> : null}
      {onTrade ? (
        <button
          onClick={onTrade}
          aria-label={`Trade for ${p.firstName} ${p.lastName}`}
          style={{ height: 28, padding: "0 12px", borderRadius: 999, border: "none", background: teal, color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
        >
          Trade
        </button>
      ) : null}
    </div>
  );
}

function ShieldLine({ shield, season, nameOf }: { shield: NonNullable<TeamProfile["shield"]>; season: number; nameOf: (id: string | null) => string }) {
  const round = (w: number) => roundLabel(w, season);
  let text: string;
  if (shield.holding) {
    const held = `Holding ${shield.name}${shield.defences ? ` · ${shield.defences} defence${shield.defences === 1 ? "" : "s"}` : ""}.`;
    text = shield.next ? `${held} Next defence: ${round(shield.next.week)} at home v ${nameOf(shield.next.opponentId)}.` : `${held} No more defences this season.`;
  } else if (!shield.holderTeamId) {
    text = `${shield.name} hasn't been given out yet.`;
  } else if (shield.next) {
    text = `Next shot at ${shield.name}: ${round(shield.next.week)}, away at ${nameOf(shield.next.opponentId)} (if they still hold it).`;
  } else {
    text = `No game away at the holder (${nameOf(shield.holderTeamId)}) left this season.`;
  }
  return (
    <div style={{ borderRadius: 12, background: shield.holding ? "#fef3c7" : soft, border: `1px solid ${shield.holding ? "#fcd34d" : line}`, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
      <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>🛡️</span>
      <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}

function ResultRow({ r, season, nameOf }: { r: TeamProfileResult; season: number; nameOf: (id: string | null) => string }) {
  const colour = r.result === "W" ? "#15803d" : r.result === "L" ? "#b91c1c" : r.result === "D" ? "#64748b" : "#94a3b8";
  const bg = r.result === "W" ? "#dcfce7" : r.result === "L" ? "#fee2e2" : "#e2e8f0";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "44px 26px 1fr auto", alignItems: "center", gap: 8, borderRadius: 12, background: soft, border: `1px solid ${line}`, padding: "7px 10px", fontSize: 12 }}>
      <span style={{ fontWeight: 600, color: muted }}>{roundLabel(r.week, season).replace(/^Round /, "R")}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: colour, background: bg, borderRadius: 6, textAlign: "center", padding: "2px 0" }}>{r.result === "BYE" ? "–" : r.result}</span>
      <span style={{ minWidth: 0, display: "grid" }}>
        <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.result === "BYE" ? "Bye" : `${r.home ? "v" : "@"} ${nameOf(r.opponentId)}`}
        </span>
        {r.label ? <span style={{ fontSize: 10, fontWeight: 600, color: muted }}>{r.label}</span> : null}
      </span>
      <span style={{ ...num, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
        {r.result === "BYE" ? pts(r.for) : `${pts(r.for)} – ${pts(r.against)}`}
      </span>
    </div>
  );
}
