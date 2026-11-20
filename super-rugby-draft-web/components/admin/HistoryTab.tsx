"use client";
// components/admin/HistoryTab.tsx
// Admin → History (E8): link past seasons to a league and history names to accounts, for the stars.
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useEffect, useState } from "react";
import { api, inputStyle, whiteBox } from "./shared";

export type HistoryData = {
  groups: Array<{ season: number; leagueName: string; lineageId: string | null; champion: string | null; rows: number }>;
  people: Array<{ personName: string; userId: string | null }>;
  leagues: Array<{ id: string; name: string; season: number; lineageId: string }>;
  users: Array<{ id: string; username: string }>;
};

export function HistoryTab({ setMsg }: { setMsg: (m: string | null) => void }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    api<HistoryData>("/api/admin/history")
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load the history"));
  useEffect(() => {
    load();
  }, []);

  async function post(body: Record<string, unknown>, done: string) {
    try {
      await api("/api/admin/history", body);
      setMsg(done);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const leagueFor = (lineageId: string | null) => data?.leagues.find((l) => l.lineageId === lineageId && lineageId);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={whiteBox}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Past seasons</div>
        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75, marginBottom: 8 }}>
          Pick which league each past season belongs to. Its champion then gets a star in that league (and in the
          league each time it&apos;s restarted for a new season).
        </div>
        {err ? <div style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</div> : null}
        {(data?.groups ?? []).map((g) => (
          <div key={`${g.season}|${g.leagueName}`} style={{ display: "grid", gap: 4, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {g.season} · {g.leagueName}
              <span style={{ fontWeight: 500, opacity: 0.7 }}>{g.champion ? ` · champion ${g.champion}` : ""}</span>
            </div>
            <select
              id={`history-league-${g.season}`}
              style={inputStyle}
              value={leagueFor(g.lineageId)?.id ?? ""}
              onChange={(e) => e.target.value && post({ action: "link-league", season: g.season, leagueName: g.leagueName, leagueId: e.target.value }, `${g.season} linked`)}
            >
              <option value="">Not linked to a league</option>
              {(data?.leagues ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.season})
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div style={whiteBox}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>People</div>
        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75, marginBottom: 8 }}>
          The history is stored by first name. Match each name to the person&apos;s account once they&apos;ve signed up.
        </div>
        {(data?.people ?? []).map((p) => (
          <div key={p.personName} style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, alignItems: "center", padding: "6px 0", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{p.personName}</div>
            <select
              id={`history-person-${p.personName}`}
              style={inputStyle}
              value={p.userId ?? ""}
              onChange={(e) => post({ action: "link-person", personName: p.personName, userId: e.target.value || null }, `${p.personName} linked`)}
            >
              <option value="">No account yet</option>
              {(data?.users ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
