"use client";
// components/PowerTab.tsx
// The League page's Power Rankings tab: the teams in order of their chance of winning the title
// (lib/league/powerServer.ts, lib/league/odds.ts), with who moved up or down since last round.
// Also (Ethan, 20 Nov 2026): Trending up / down over the last 5 rounds, your team's preseason
// and current rank, each team's preseason rank, and a preseason vs now chart.
import React, { useEffect, useState } from "react";
import { TeamAvatar } from "@/components/TeamAvatar";
import { roundLabel } from "@/lib/season";
import type { PowerRow, PowerTable } from "@/lib/league/powerServer";
import { TREND_ROUNDS } from "@/lib/league/odds";
import { muted as mutedInk, num } from "@/lib/ui/theme";
import { useTeamProfileStore } from "@/lib/league/teamProfileStore";

type TeamLite = { id: string; name: string; ownerName?: string | null; pictureUrl?: string | null; userInitials?: string | null; initials?: string | null; stars?: number };

const UP = "#16a34a";
const DOWN = "#dc2626";
const SAME = "#94a3b8";

const box: React.CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  color: "#0f172a",
};
const muted: React.CSSProperties = { fontSize: 11, fontWeight: 500, opacity: 0.6 };
const heading: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" };
const ellipsis: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

function Movement({ n }: { n: number | null }) {
  if (n == null) return <span style={{ width: 30, fontSize: 10, textAlign: "center", color: "rgba(15,23,42,0.4)" }}>–</span>;
  const up = n > 0, down = n < 0;
  return (
    <span
      title={up ? `Up ${n}` : down ? `Down ${-n}` : "No change"}
      style={{ width: 30, fontSize: 11, fontWeight: 700, textAlign: "center", color: up ? UP : down ? DOWN : "rgba(15,23,42,0.4)" }}
    >
      {up ? `▲${n}` : down ? `▼${-n}` : "–"}
    </span>
  );
}

/** Trending up / down: the biggest movers over the last 5 rounds. */
function TrendBox({ dir, rows, name, since }: { dir: "up" | "down"; rows: PowerRow[]; name: (id: string) => string; since: string }) {
  const color = dir === "up" ? UP : DOWN;
  const list = rows
    .filter((r) => r.trend != null && (dir === "up" ? r.trend > 0 : r.trend < 0))
    .sort((a, b) => (dir === "up" ? b.trend! - a.trend! : a.trend! - b.trend!) || a.rank - b.rank)
    .slice(0, 3);
  return (
    <div style={{ ...box, marginTop: 0, borderTop: `4px solid ${color}`, padding: "9px 10px 10px", minWidth: 0 }}>
      <div style={heading}>Trending {dir}</div>
      <div style={{ ...muted, fontSize: 10, marginTop: 1 }}>{since}</div>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {list.length ? (
          list.map((r) => (
            <div key={r.teamId} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
              <span style={{ ...ellipsis, fontSize: 12, fontWeight: 600 }}>{name(r.teamId)}</span>
              <span style={{ ...num, fontSize: 13, fontWeight: 700, color }}>
                {dir === "up" ? "▲" : "▼"} {Math.abs(r.trend!)}
              </span>
            </div>
          ))
        ) : (
          <span style={{ ...muted, fontSize: 11 }}>{dir === "up" ? "No one has moved up" : "No one has moved down"}</span>
        )}
      </div>
    </div>
  );
}

/** Preseason (hollow) to now (filled) for every team; 1st on the right, so moving right is up. */
function PreseasonChart({ rows, name, myTeamId }: { rows: PowerRow[]; name: (id: string) => string; myTeamId: string | null }) {
  const n = rows.length;
  const DOT = 20;
  const x = (rank: number) => (n > 1 ? ((n - rank) / (n - 1)) * 100 : 50);
  const pos = (rank: number): React.CSSProperties => ({ position: "absolute", top: "50%", left: `calc(${DOT / 2}px + (100% - ${DOT}px) * ${x(rank) / 100})` });
  const dot = (rank: number, filled: boolean, color: string): React.CSSProperties => ({
    ...pos(rank),
    ...num,
    width: DOT,
    height: DOT,
    marginLeft: -DOT / 2,
    marginTop: -DOT / 2,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 700,
    boxSizing: "border-box",
    background: filled ? color : "#fff",
    color: filled ? "#fff" : color,
    border: `1.5px solid ${color}`,
    zIndex: filled ? 2 : 1,
  });
  return (
    <div style={{ ...box, padding: "10px 10px 12px" }}>
      <div style={heading}>Preseason vs now</div>
      <div style={{ display: "grid", gap: 2, marginTop: 10 }}>
        {rows.map((r) => {
          const pre = r.preseasonRank ?? r.rank;
          const color = pre > r.rank ? UP : pre < r.rank ? DOWN : SAME;
          const lo = Math.min(x(pre), x(r.rank)), hi = Math.max(x(pre), x(r.rank));
          const mine = r.teamId === myTeamId;
          return (
            <div key={r.teamId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 92px) 1fr", gap: 8, alignItems: "center", height: 28 }}>
              <span style={{ ...ellipsis, fontSize: 12, fontWeight: mine ? 800 : 600 }}>{name(r.teamId)}</span>
              <span style={{ position: "relative", height: 28, minWidth: 0 }}>
                <span style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px solid rgba(15,23,42,0.08)" }} />
                {pre !== r.rank ? (
                  <span
                    style={{
                      position: "absolute",
                      top: "50%",
                      height: 2,
                      marginTop: -1,
                      background: color,
                      left: `calc(${DOT / 2}px + (100% - ${DOT}px) * ${lo / 100})`,
                      width: `calc((100% - ${DOT}px) * ${(hi - lo) / 100})`,
                    }}
                  />
                ) : null}
                {pre !== r.rank ? <span style={dot(pre, false, color)} title={`Preseason: ${ordinal(pre)}`}>{pre}</span> : null}
                <span style={dot(r.rank, true, color)} title={`Now: ${ordinal(r.rank)}`}>{r.rank}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 92px) 1fr", gap: 8, marginTop: 4 }}>
        <span />
        <span style={{ display: "flex", justifyContent: "space-between", ...muted, fontSize: 10, fontWeight: 600 }}>
          <span>← {ordinal(n)}</span>
          <span>1st →</span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 10, fontSize: 11, fontWeight: 600, color: mutedInk }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, border: `1.5px solid ${mutedInk}`, boxSizing: "border-box" }} /> Preseason
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: mutedInk }} /> Now
        </span>
      </div>
    </div>
  );
}

export function PowerTab({ leagueId, teams }: { leagueId: string; teams: TeamLite[] }) {
  // tap a team: its profile pop-up (components/TeamProfileModal.tsx)
  const openTeam = useTeamProfileStore((s) => s.openTeam);
  const [data, setData] = useState<{ leagueId: string; power: PowerTable; myTeamId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leagues/power?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData({ leagueId, power: j.power as PowerTable, myTeamId: j.myTeamId ?? null });
        else setError(j?.error ?? "Couldn't load the power rankings");
      })
      .catch(() => !cancelled && setError("Couldn't load the power rankings"));
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const p = data && data.leagueId === leagueId ? data.power : null;
  if (error) return <div style={{ ...box, padding: 12, fontSize: 12, fontWeight: 600 }}>{error}</div>;
  if (!p) return <div style={{ ...box, padding: 12, fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Loading…</div>;
  const team = (id: string) => teams.find((t) => t.id === id) ?? null;
  const name = (id: string) => team(id)?.name ?? "—";
  const started = p.asOfWeek > 0 && p.simulated;
  const hasPre = started && p.rows.some((r) => r.preseasonRank != null);
  const mine = p.rows.find((r) => r.teamId === data?.myTeamId) ?? null;
  const since = p.trendFromWeek > 0 ? `Last ${TREND_ROUNDS} rounds` : "Since preseason";
  const cols = hasPre ? "18px 30px 1fr 62px" : "18px 30px 1fr";

  return (
    <div>
      {started ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
          <TrendBox dir="up" rows={p.rows} name={name} since={since} />
          <TrendBox dir="down" rows={p.rows} name={name} since={since} />
        </div>
      ) : null}

      {hasPre && mine ? (
        <div style={{ ...box, padding: "9px 10px", display: "grid", gridTemplateColumns: "1fr 64px 64px", gap: 8, alignItems: "center" }}>
          <span style={heading}>My team</span>
          <span style={{ ...heading, textAlign: "center" }}>Preseason</span>
          <span style={{ ...heading, textAlign: "center" }}>Now</span>
          <span style={{ ...ellipsis, fontSize: 13, fontWeight: 600 }}>{name(mine.teamId)}</span>
          <span style={{ ...num, fontSize: 16, fontWeight: 700, textAlign: "center", color: mutedInk }}>{mine.preseasonRank != null ? ordinal(mine.preseasonRank) : "–"}</span>
          <span
            style={{
              ...num,
              fontSize: 16,
              fontWeight: 700,
              textAlign: "center",
              color: mine.preseasonRank == null || mine.preseasonRank === mine.rank ? "#0f172a" : mine.preseasonRank > mine.rank ? UP : DOWN,
            }}
          >
            {ordinal(mine.rank)}
          </span>
        </div>
      ) : null}

      <div style={box}>
        <div style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, textAlign: "center", background: "rgba(15,23,42,0.08)", borderBottom: "1px solid rgba(0,0,0,0.08)", letterSpacing: 0.4 }}>
          {p.asOfWeek ? `After ${roundLabel(p.asOfWeek)}` : "Before round 1"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "6px 10px", fontSize: 10, fontWeight: 700, opacity: 0.6 }}>
          <span>#</span>
          <span />
          <span>Team</span>
          {hasPre ? <span style={{ textAlign: "center" }} title="Rank straight after the draft, before round 1">Preseason</span> : null}
        </div>
        {p.rows.map((r) => {
          const t = team(r.teamId);
          return (
            <div
              key={r.teamId}
              role="button"
              tabIndex={0}
              onClick={() => openTeam(r.teamId)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openTeam(r.teamId)}
              style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "8px 10px", borderTop: "1px solid rgba(0,0,0,0.08)", cursor: "pointer" }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.rank}</span>
              <Movement n={r.movement} />
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TeamAvatar pictureUrl={t?.pictureUrl ?? null} initials={t?.userInitials ?? t?.initials ?? ""} size={26} stars={t?.stars} />
                <span style={{ minWidth: 0, display: "grid" }}>
                  <span style={{ ...ellipsis, fontSize: 12, fontWeight: 700 }}>{t?.name ?? "—"}</span>
                  {t?.ownerName ? <span style={{ ...muted, fontSize: 10, fontWeight: 600 }}>{t.ownerName}</span> : null}
                </span>
              </span>
              {hasPre ? <span style={{ ...num, fontSize: 13, fontWeight: 600, textAlign: "center", color: mutedInk }}>{r.preseasonRank ?? "–"}</span> : null}
            </div>
          );
        })}
      </div>

      {hasPre ? <PreseasonChart rows={p.rows} name={name} myTeamId={data?.myTeamId ?? null} /> : null}
    </div>
  );
}
