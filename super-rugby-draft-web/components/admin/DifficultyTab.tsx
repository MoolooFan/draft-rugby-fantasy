"use client";
// components/admin/DifficultyTab.tsx
// Admin → Difficulty: each team's home and away fixture difficulty rating (pin to keep it).
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useEffect, useState } from "react";
import { api, inputStyle, whiteBox } from "./shared";

export type Rating = { team: string; home_rating: number; away_rating: number; pinned: boolean };

export function DifficultyRow({ season, r, setMsg }: { season: number; r: Rating; setMsg: (m: string | null) => void }) {
  const [home, setHome] = useState(r.home_rating);
  const [away, setAway] = useState(r.away_rating);
  const [pinned, setPinned] = useState(r.pinned);
  const [busy, setBusy] = useState(false);
  const changed = home !== r.home_rating || away !== r.away_rating || pinned !== r.pinned;
  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/difficulty", { season, team: r.team, homeRating: home, awayRating: away, pinned });
      r.home_rating = home;
      r.away_rating = away;
      r.pinned = pinned;
      setMsg(`Saved ${r.team}: ${home} at their ground, ${away} at yours${pinned ? " (pinned)" : ""}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const sel = (v: number, on: (n: number) => void) => (
    <select style={{ ...inputStyle, width: 54, padding: "0 4px" }} value={v} onChange={(e) => on(Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 6, alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>{r.team}</div>
      {sel(home, setHome)}
      {sel(away, setAway)}
      <input type="checkbox" title="Pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
      <button
        disabled={!changed || busy}
        onClick={save}
        style={{ height: 30, borderRadius: 999, border: "none", padding: "0 10px", fontWeight: 700, fontSize: 12, cursor: changed ? "pointer" : "default", background: changed ? "rgb(29,78,216)" : "rgba(0,0,0,0.08)", color: changed ? "white" : "rgba(0,0,0,0.4)" }}
      >
        Save
      </button>
    </div>
  );
}

export function DifficultyTab({ season, setMsg }: { season: number; setMsg: (m: string | null) => void }) {
  const [ratings, setRatings] = useState<Rating[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ ratings: Rating[] }>(`/api/admin/difficulty?season=${season}`)
      .then((r) => setRatings(r.ratings))
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load ratings"));
  }, [season]);
  return (
    <div style={whiteBox}>
      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75, marginBottom: 6 }}>
        How hard each team is to play (1 easy, 5 hard). First number: at their ground. Second: when they visit
        yours. Tick to pin a rating so the in-season update leaves it alone.
      </div>
      {err ? <div style={{ color: "#b91c1c", fontWeight: 600 }}>{err}</div> : null}
      {ratings && !ratings.length ? <div style={{ fontWeight: 600 }}>No ratings for {season}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 6, fontSize: 10, fontWeight: 700, opacity: 0.6 }}>
        <div>TEAM</div><div style={{ width: 54 }}>THEIRS</div><div style={{ width: 54 }}>YOURS</div><div>PIN</div><div style={{ width: 52 }} />
      </div>
      {(ratings ?? []).map((r) => <DifficultyRow key={r.team} season={season} r={r} setMsg={setMsg} />)}
    </div>
  );
}

