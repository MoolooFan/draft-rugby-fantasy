"use client";
// components/admin/RoundsTab.tsx
// Admin → Rounds: regather a round's stats and finalise it again (with a before / after preview).
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useEffect, useState } from "react";
import { api, inputStyle, primaryButton, whiteBox } from "./shared";

export type RoundsLeague = { id: string; name: string; teams: Array<{ id: string; name: string }>; weeks: Array<{ week: number; label: string }> };
export type Preview = { week: number; teams: Array<{ teamId: string; before: number | null; after: number }> };

export function RoundsTab({ setMsg }: { setMsg: (m: string | null) => void }) {
  const [leagues, setLeagues] = useState<RoundsLeague[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [week, setWeek] = useState(0);
  const [regather, setRegather] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ leagues: RoundsLeague[] }>("/api/admin/rounds")
      .then((r) => {
        setLeagues(r.leagues);
        const first = r.leagues.find((l) => l.weeks.length);
        if (first) {
          setLeagueId(first.id);
          setWeek(first.weeks[first.weeks.length - 1].week);
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load leagues"));
  }, []);

  const league = leagues.find((l) => l.id === leagueId) ?? null;
  const teamName = (id: string) => league?.teams.find((t) => t.id === id)?.name ?? id;

  async function run(confirm: boolean) {
    if (!leagueId || !week) return;
    setBusy(confirm ? "Finalising…" : regather ? "Regathering stats…" : "Working out scores…");
    setErr(null);
    try {
      const r = await api<{ preview?: Preview; regathered: number | null }>("/api/admin/rounds", { leagueId, week, regather: confirm ? false : regather, confirm });
      if (confirm) {
        setPreview(null);
        setMsg(`${league?.name}: ${league?.weeks.find((w) => w.week === week)?.label} finalised again.`);
      } else {
        setPreview(r.preview ?? null);
        if (r.regathered != null) setMsg(`Stats regathered (${r.regathered} player rows).`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  // only teams that already have a score can "change" (— = no saved score yet, e.g. a bye in the finals)
  const isChange = (t: { before: number | null; after: number }) => t.before != null && t.before !== t.after;
  const changes = (preview?.teams ?? []).filter(isChange).length;

  return (
    <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75 }}>
        If a stat is corrected after a round was finalised: pick the round, preview the new scores, then confirm.
      </div>
      {err ? <div style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</div> : null}
      {!leagues.length && !err ? <div style={{ fontWeight: 600 }}>No leagues this season yet.</div> : null}
      {leagues.length ? (
        <>
          <select style={inputStyle} value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setPreview(null); }}>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select style={inputStyle} value={week} onChange={(e) => { setWeek(Number(e.target.value)); setPreview(null); }}>
            {(league?.weeks ?? []).map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
          </select>
          {!league?.weeks.length ? <div style={{ fontSize: 12, fontWeight: 600 }}>No finalised rounds yet.</div> : null}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={regather} onChange={(e) => setRegather(e.target.checked)} /> Regather stats from playfantasyrugby first
          </label>
          <button style={primaryButton} disabled={!!busy || !week} onClick={() => run(false)}>{busy && !busy.startsWith("Final") ? busy : "Preview New Scores"}</button>
        </>
      ) : null}

      {preview ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", fontSize: 10, fontWeight: 700, opacity: 0.6 }}>
            <div>TEAM</div><div style={{ textAlign: "right" }}>NOW</div><div style={{ textAlign: "right" }}>NEW</div>
          </div>
          {preview.teams.map((t) => (
            <div key={t.teamId} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", fontSize: 13, fontWeight: 600, color: isChange(t) ? "#b45309" : undefined }}>
              <div>{teamName(t.teamId)}</div>
              <div style={{ textAlign: "right" }}>{t.before ?? "—"}</div>
              <div style={{ textAlign: "right" }}>{t.after}</div>
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 600 }}>{changes ? `${changes} team score${changes === 1 ? "" : "s"} would change.` : "No scores would change."}</div>
          <button style={primaryButton} disabled={!!busy} onClick={() => run(true)}>{busy?.startsWith("Final") ? busy : "Confirm: finalise this round again"}</button>
        </div>
      ) : null}
    </div>
  );
}

