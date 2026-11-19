"use client";
// components/RoundRecapModal.tsx
// The round recap pop-up, opened from the "Round N recap" message in the league chat (Ethan,
// 19 Nov 2026): results, the Shield, player of the week, and the best and worst pickups.
// Data: /api/leagues/round-recap (lib/league/roundRecap.ts).
import React, { useEffect, useState } from "react";
import { ShieldIcon } from "@/components/AwardIcons";
import type { RecapPickup, RoundRecap } from "@/lib/league/roundRecap";
import { ink, muted, num, teal } from "@/lib/ui/theme";

const section: React.CSSProperties = { background: "#f6f8fa", border: "1px solid #e5e9ef", borderRadius: 12, padding: 10, display: "grid", gap: 6 };
const title: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: muted };
const fmt = (n: number | null) => (n == null ? "–" : Number.isInteger(n) ? String(n) : n.toFixed(1));

function Pickup({ label, colour, p }: { label: string; colour: string; p: RecapPickup }) {
  return (
    <div style={section}>
      <div style={{ ...title, color: colour }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
          <div style={{ fontSize: 11, color: muted }}>
            {p.team.name} · {p.via === "waiver" ? "waiver claim" : "free agent"}
          </div>
        </div>
        <div style={{ ...num, fontSize: 22, fontWeight: 600, color: colour }}>{fmt(p.points)}</div>
      </div>
      {p.dropped ? (
        <div style={{ fontSize: 11, color: muted }}>
          Replaced {p.dropped.name}, who scored {fmt(p.dropped.points)}
        </div>
      ) : null}
    </div>
  );
}

export function RoundRecapModal({ leagueId, week, onClose }: { leagueId: string; week: number; onClose: () => void }) {
  const [data, setData] = useState<{ key: string; recap: RoundRecap | null; error: string | null } | null>(null);
  const key = `${leagueId}:${week}`;

  useEffect(() => {
    let live = true;
    fetch(`/api/leagues/round-recap?leagueId=${encodeURIComponent(leagueId)}&week=${week}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => live && setData({ key, recap: j?.ok ? (j.recap as RoundRecap) : null, error: j?.ok ? null : j?.error ?? "Couldn't load the recap" }))
      .catch(() => live && setData({ key, recap: null, error: "Couldn't load the recap" }));
    return () => {
      live = false;
    };
  }, [leagueId, week, key]);

  const r = data?.key === key ? data.recap : null;
  const error = data?.key === key ? data.error : null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,0.6)", display: "grid", placeItems: "center", padding: 16 }}>
      <div
        role="dialog"
        aria-label="Round recap"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, maxHeight: "88svh", overflowY: "auto", background: "#ffffff", color: ink, borderRadius: 18, padding: 14, display: "grid", gap: 10, boxShadow: "0 20px 50px rgba(15,23,42,0.35)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{r ? `${r.roundName} recap` : "Round recap"}</div>
          <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, fontWeight: 700, color: muted, cursor: "pointer" }}>
            ×
          </button>
        </div>

        {!r ? (
          <div style={{ fontSize: 13, color: error ? "#dc2626" : muted }}>{error ?? "Loading…"}</div>
        ) : (
          <>
            {/* Results */}
            <div style={section}>
              <div style={title}>Results</div>
              {r.games.map((g, i) => {
                const homeWon = g.homeScore != null && g.awayScore != null && g.homeScore > g.awayScore;
                const awayWon = g.homeScore != null && g.awayScore != null && g.awayScore > g.homeScore;
                return (
                  <div key={i} style={{ display: "grid", gap: 2 }}>
                    {g.label ? <div style={{ fontSize: 10, fontWeight: 700, color: muted }}>{g.label}</div> : null}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "center", fontSize: 13 }}>
                      <span style={{ fontWeight: homeWon ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.home?.name ?? "—"}</span>
                      <span style={{ ...num, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {g.away ? `${fmt(g.homeScore)} – ${fmt(g.awayScore)}` : "bye"}
                      </span>
                      <span style={{ fontWeight: awayWon ? 700 : 500, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.away?.name ?? ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* The Shield */}
            {r.shield ? (
              <div style={{ ...section, gridTemplateColumns: "auto 1fr", alignItems: "center", gap: 10 }}>
                <ShieldIcon size={40} title={r.shield.name} />
                <div style={{ display: "grid", gap: 2 }}>
                  <div style={title}>{r.shield.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {r.shield.kind === "won"
                      ? `${r.shield.holder?.name ?? "A team"} took it off ${r.shield.other?.name ?? "the holder"}`
                      : r.shield.kind === "defended"
                        ? `${r.shield.holder?.name ?? "The holder"} defended it against ${r.shield.other?.name ?? "the challenger"}`
                        : `${r.shield.holder?.name ?? "A team"} won it with the round's top score`}
                  </div>
                  <div style={{ fontSize: 11, color: muted }}>
                    {r.shield.homeScore != null && r.shield.awayScore != null ? `${fmt(r.shield.homeScore)} – ${fmt(r.shield.awayScore)}` : ""}
                    {r.shield.kind !== "awarded" ? `${r.shield.homeScore != null ? " · " : ""}${r.shield.defences} defence${r.shield.defences === 1 ? "" : "s"} in this reign` : ""}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Player of the week */}
            {r.playersOfWeek.length ? (
              <div style={section}>
                <div style={title}>Player of the week</div>
                {r.playersOfWeek.map((p) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: muted }}>
                        {p.teamCode ? `${p.teamCode} · ` : ""}
                        {p.fantasyTeam ? `scored for ${p.fantasyTeam.name}` : "not in anyone's team"}
                      </div>
                    </div>
                    <div style={{ ...num, fontSize: 22, fontWeight: 600, color: teal }}>{fmt(p.points)}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Pickups */}
            {r.bestPickup ? <Pickup label="Best pickup" colour="#16a34a" p={r.bestPickup} /> : null}
            {r.worstPickup ? <Pickup label="Worst pickup" colour="#dc2626" p={r.worstPickup} /> : null}
            {!r.bestPickup ? <div style={{ fontSize: 12, color: muted, textAlign: "center" }}>No pickups for this round.</div> : null}
          </>
        )}
      </div>
    </div>
  );
}
