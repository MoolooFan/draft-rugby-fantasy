"use client";

// Trade review pop-up (plan item C5): a received offer opens this instead of straight Accept /
// Decline buttons. It shows the players you'd get and give, one stat at a time (pick which),
// with the Per game / Total / Per 80 switch, and Accept / Decline inside.

import React, { useMemo, useState } from "react";
import { StatViewToggle } from "@/components/StatViewToggle";
import { StatusTag } from "@/components/StatusTag";
import { positionsLabel } from "@/lib/players/positions";
import { applyStatView, formatStatView, STAT_VIEW_LABEL, useStatView } from "@/lib/players/statView";
import { COMPARE_STATS, seasonTotals, totalFor } from "@/lib/players/seasonTotals";
import type { StatKey } from "@/lib/scoring";

type P = {
  id: string;
  firstName?: string;
  lastName?: string;
  teamCode?: string;
  posAbbrev?: string | null;
  secondaryPosAbbrev?: string | null;
  thirdPosAbbrev?: string | null;
};

export function TradeReviewModal({
  fromTeamName,
  getPlayers,
  givePlayers,
  statRows,
  canRespond,
  onAccept,
  onDecline,
  onClose,
  livePlayer,
}: {
  fromTeamName: string;
  /** players you'd get */
  getPlayers: P[];
  /** players you'd give */
  givePlayers: P[];
  statRows: any[];
  /** false once the trade window has closed */
  canRespond: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onClose: () => void;
  /** the player with live status (for the status tag) */
  livePlayer?: (id: string) => unknown;
}) {
  const [stat, setStat] = useState<StatKey | "points">("points");
  const [view] = useStatView();
  const [confirming, setConfirming] = useState<"accept" | "decline" | null>(null);

  const values = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const p of [...getPlayers, ...givePlayers]) {
      const t = seasonTotals(statRows, p);
      m.set(p.id, t.games ? applyStatView(totalFor(t, stat), t.games, t.minutes, view) : null);
    }
    return m;
  }, [getPlayers, givePlayers, statRows, stat, view]);
  const value = (p: P) => values.get(p.id) ?? null;

  const sum = (ps: P[]) => {
    const vals = ps.map(value).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };

  const side = (title: string, ps: P[], color: string) => (
    <div style={{ borderTop: "1px solid rgba(15,23,42,0.10)" }}>
      <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700 }}>
        <span style={{ color }}>{title}</span>
        <span style={{ opacity: 0.6 }}>
          {COMPARE_STATS.find((s) => s.key === stat)?.label} · {STAT_VIEW_LABEL[view].toLowerCase()}
        </span>
      </div>
      {ps.map((p) => (
        <div
          key={p.id}
          style={{ padding: "6px 12px", display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center", borderTop: "1px solid rgba(15,23,42,0.06)" }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.firstName?.[0]}. {p.lastName}
              </span>
              <StatusTag player={(livePlayer?.(p.id) ?? p) as never} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>
              {String(p.teamCode ?? "").toUpperCase()} · {positionsLabel(p)}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatStatView(value(p), view)}</div>
        </div>
      ))}
      {ps.length > 1 ? (
        <div style={{ padding: "6px 12px 8px", display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, borderTop: "1px solid rgba(15,23,42,0.06)" }}>
          <span style={{ opacity: 0.6 }}>Together</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatStatView(sum(ps), view)}</span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 18 }}>
      <div
        role="dialog"
        aria-label={`Trade offer from ${fromTeamName}`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 380, maxHeight: "86vh", overflowY: "auto", borderRadius: 18, background: "#ffffff", color: "#0f172a", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}
      >
        <div style={{ padding: "10px 12px", background: "#0f172a", color: "white", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>Trade offer from {fromTeamName}</div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "white", fontSize: 20, fontWeight: 700, cursor: "pointer" }}>
            ×
          </button>
        </div>

        <div style={{ padding: "10px 12px", display: "grid", gap: 8 }}>
          <select
            id="trade-review-stat"
            value={stat}
            onChange={(e) => setStat(e.target.value as StatKey | "points")}
            aria-label="Stat to compare"
            style={{ height: 34, borderRadius: 10, border: "1px solid rgba(0,0,0,0.15)", padding: "0 10px", fontSize: 13, fontWeight: 600, color: "#0f172a", background: "white" }}
          >
            {COMPARE_STATS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <StatViewToggle dark />
          </div>
        </div>

        {side("You get", getPlayers, "#16a34a")}
        {side("You give", givePlayers, "#dc2626")}

        <div style={{ padding: 12, borderTop: "1px solid rgba(15,23,42,0.10)" }}>
          {!canRespond ? (
            <div style={{ fontSize: 12, fontWeight: 600, textAlign: "center", opacity: 0.7 }}>This offer has expired (the lineup deadline has passed).</div>
          ) : confirming ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, textAlign: "center" }}>
                {confirming === "accept" ? "Accept this trade? The players swap teams straight away." : "Decline this trade?"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => setConfirming(null)} style={{ height: 38, borderRadius: 12, border: "2px solid rgba(15,23,42,0.3)", background: "transparent", fontWeight: 700, cursor: "pointer", color: "#0f172a" }}>
                  Back
                </button>
                <button
                  onClick={confirming === "accept" ? onAccept : onDecline}
                  style={{ height: 38, borderRadius: 12, border: "none", background: confirming === "accept" ? "#22C55E" : "#EF4444", color: "white", fontWeight: 700, cursor: "pointer" }}
                >
                  {confirming === "accept" ? "Yes, accept" : "Yes, decline"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                onClick={() => setConfirming("decline")}
                style={{ height: 38, borderRadius: 12, border: "2px solid rgba(239,68,68,0.9)", background: "transparent", color: "rgba(239,68,68,0.95)", fontWeight: 700, cursor: "pointer" }}
              >
                Decline
              </button>
              <button
                onClick={() => setConfirming("accept")}
                style={{ height: 38, borderRadius: 12, border: "none", background: "#22C55E", color: "white", fontWeight: 700, cursor: "pointer" }}
              >
                Accept
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
