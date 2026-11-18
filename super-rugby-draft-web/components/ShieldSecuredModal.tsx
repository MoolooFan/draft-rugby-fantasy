"use client";
// components/ShieldSecuredModal.tsx
// Shown once to the Shield holder when they've secured it for the rest of the regular season
// (no home games left to lose it). Everyone else hears about it in that round's recap.
import React, { useEffect, useState } from "react";
import { ShieldIcon } from "@/components/AwardIcons";
import type { LeagueShield } from "@/lib/league/shieldServer";

export function ShieldSecuredModal({ leagueId }: { leagueId: string | null | undefined }) {
  const [shield, setShield] = useState<(LeagueShield & { forLeague: string }) | null>(null);

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;
    fetch(`/api/leagues/shield?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.ok && j.securedPopup) setShield({ ...(j.shield as LeagueShield), forLeague: leagueId });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  if (!shield || !leagueId || shield.forLeague !== leagueId) return null;

  function close() {
    setShield(null);
    fetch("/api/leagues/shield", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ leagueId }),
    }).catch(() => {});
  }

  const defences = shield.holder?.defences ?? 0;
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 84, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 18 }}>
      <div
        role="dialog"
        aria-label={`${shield.name} secured`}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 360, borderRadius: 18, background: "#ffffff", color: "#0f172a", boxShadow: "0 24px 80px rgba(0,0,0,0.45)", overflow: "hidden" }}
      >
        <div style={{ padding: "12px 12px 10px", background: "linear-gradient(to right, rgb(15,23,42), rgb(13,148,136))", color: "white" }}>
          <div style={{ fontSize: 18, fontWeight: 700, fontStyle: "italic" }}>{shield.name} secured!</div>
        </div>
        <div style={{ padding: 16, display: "grid", justifyItems: "center", gap: 10, textAlign: "center" }}>
          <ShieldIcon size={96} title={shield.name} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>It&apos;s yours for the rest of the season.</div>
          <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75, lineHeight: 1.4 }}>
            You&apos;ve no home games left, so nobody can take it off you before the finals.
            {defences ? ` ${defences} defence${defences === 1 ? "" : "s"} so far.` : ""} It carries over into next season.
          </div>
        </div>
        <div style={{ padding: 12, borderTop: "1px solid rgba(15,23,42,0.10)" }}>
          <button
            onClick={close}
            style={{ width: "100%", height: 38, borderRadius: 12, border: "none", background: "#22C55E", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            Brilliant
          </button>
        </div>
      </div>
    </div>
  );
}
