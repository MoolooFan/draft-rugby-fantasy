"use client";
// components/CommissionerHandover.tsx
// League Settings, commissioner only (Ethan, 23 Nov 2026): hand the commissioner job to another
// team's owner (app/api/leagues/commissioner), e.g. when the commissioner stops playing. Asks
// first, in the page. Afterwards the settings become read-only for the old commissioner.
import React, { useState } from "react";
import type { LeagueTeam } from "@/lib/league/types";
import { loadMyLeagues } from "@/lib/league/store";

export function CommissionerHandover({ leagueId, teams, myUsername, onDone }: { leagueId: string; teams: LeagueTeam[]; myUsername: string; onDone: () => void }) {
  const others = teams.filter((t) => String(t.userId ?? "").toLowerCase() !== myUsername.toLowerCase());
  const [to, setTo] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = others.find((t) => t.id === to);

  const btn: React.CSSProperties = { height: 32, padding: "0 12px", borderRadius: 999, border: "none", fontWeight: 700, fontSize: 12, cursor: "pointer" };

  if (!others.length) return <div style={{ fontSize: 12, opacity: 0.75 }}>There&apos;s no one else in the league to hand it to yet.</div>;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          aria-label="New commissioner"
          value={to}
          onChange={(e) => { setTo(e.target.value); setAsking(false); setError(null); }}
          style={{ flex: 1, minWidth: 0, height: 36, borderRadius: 10, border: "1px solid #e5e9ef", padding: "0 8px", background: "white", color: "#0f172a" }}
        >
          <option value="">Choose a member…</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.ownerName ? ` (${t.ownerName})` : ""}
            </option>
          ))}
        </select>
        <button style={{ ...btn, background: "#0f172a", color: "white", opacity: to ? 1 : 0.4 }} disabled={!to} onClick={() => setAsking(true)}>
          Hand Over
        </button>
      </div>
      {asking && target ? (
        <div style={{ borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", padding: 8, display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            Make {target.ownerName || target.name} the commissioner?
          </div>
          <div style={{ fontSize: 11, fontWeight: 500 }}>You won&apos;t be able to change the league&apos;s settings any more unless they hand it back. The league chat is told.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={{ ...btn, background: "transparent", color: "#0f172a" }} disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
            <button
              style={{ ...btn, background: "#b45309", color: "white", opacity: busy ? 0.6 : 1 }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const r = await fetch("/api/leagues/commissioner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leagueId, toTeamId: to }) });
                  const j = await r.json().catch(() => null);
                  if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Couldn't hand it over");
                  await loadMyLeagues();
                  onDone();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't hand it over");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Handing over…" : "Yes, Hand It Over"}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <div style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>{error}</div> : null}
    </div>
  );
}
