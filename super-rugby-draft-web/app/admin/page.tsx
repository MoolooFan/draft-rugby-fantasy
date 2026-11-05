"use client";
// app/admin/page.tsx — the site admin's page (Ethan). Small edits without going into Supabase:
// players (add / edit / hide, weekly status), fixture difficulty ratings, and regathering stats
// and finalising a round again. Every request is checked on the server (admin only).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import { currentSeasonYear, getSeason, SEASONS, totalFantasyWeeks, weekLabel } from "@/lib/season";

// ---------------------------------------------------------------------------
// Styles (same look as the other pages)

const cardStyle: React.CSSProperties = {
  borderRadius: 18,
  background: "rgba(255,255,255,0.35)",
  padding: 14,
  backdropFilter: "blur(10px)",
  boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
};
const whiteBox: React.CSSProperties = {
  borderRadius: 14,
  background: "rgba(255,255,255,0.92)",
  color: "#0f172a",
  padding: 10,
};
const primaryButton: React.CSSProperties = {
  height: 38,
  width: "100%",
  borderRadius: 999,
  background: "linear-gradient(to right, rgb(15,23,42), rgb(29,78,216))",
  color: "white",
  fontSize: 13,
  fontWeight: 900,
  border: "2px solid rgba(255,255,255,0.85)",
  cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 36,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "white",
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 900, opacity: 0.7, marginBottom: 3 };
const tabButton = (active: boolean): React.CSSProperties => ({
  flex: 1,
  height: 36,
  borderRadius: 999,
  border: "none",
  fontSize: 13,
  fontWeight: 900,
  cursor: "pointer",
  background: active ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.2)",
  color: active ? "#0f172a" : "white",
});

const POSITIONS = ["PR", "HO", "LK", "LF", "HB", "FH", "CE", "OB"];
const TEAMS: Array<[string, string]> = [
  ["BLU", "Blues"], ["BRU", "Brumbies"], ["CHI", "Chiefs"], ["CRU", "Crusaders"], ["DRU", "Drua"], ["FOR", "Force"],
  ["HIG", "Highlanders"], ["HUR", "Hurricanes"], ["MOA", "Moana"], ["RED", "Reds"], ["WAR", "Waratahs"],
];

type AdminPlayer = {
  id: string;
  firstName: string;
  lastName: string;
  teamCode: string;
  posAbbrev: string;
  secondaryPosAbbrev?: string;
  draftRank: number;
  externalId: number | null;
  status: string | null;
  active: boolean;
  weeklyStatus: Record<string, string>;
};
type Rating = { team: string; home_rating: number; away_rating: number; pinned: boolean };
type RoundsLeague = { id: string; name: string; teams: Array<{ id: string; name: string }>; weeks: Array<{ week: number; label: string }> };
type Preview = { week: number; teams: Array<{ teamId: string; before: number | null; after: number }> };

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error === "FORBIDDEN" ? "This page is for the site admin only." : j?.error ?? "Something went wrong");
  return j as T;
}

// ---------------------------------------------------------------------------
// Players

function PlayerForm({
  season,
  player,
  onSaved,
  onCancel,
}: {
  season: number;
  player: AdminPlayer | null; // null = new player
  onSaved: (msg: string) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
    teamCode: player?.teamCode ?? "CHI",
    posAbbrev: player?.posAbbrev ?? "PR",
    secondaryPosAbbrev: player?.secondaryPosAbbrev ?? "",
    draftRank: player?.draftRank && player.draftRank < 9999 ? String(player.draftRank) : "",
    externalId: player?.externalId ? String(player.externalId) : "",
    status: player?.status ?? "",
    active: player?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [weekStatus, setWeekStatus] = useState("");
  const weeks = totalFantasyWeeks(getSeason(season));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  useEffect(() => {
    setWeekStatus(player?.weeklyStatus?.[`W${week}`] ?? "");
  }, [week, player]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ id: string }>("/api/admin/players", { season, player: { ...f, id: player?.id } });
      onSaved(player ? `Saved ${f.firstName} ${f.lastName}` : `Added ${f.firstName} ${f.lastName} (${r.id})`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveWeekStatus() {
    if (!player) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/admin/player-status", { season, week, playerId: player.id, status: weekStatus });
      onSaved(`${player.firstName} ${player.lastName}: ${weekLabel(getSeason(season), week)} status ${weekStatus ? `set to "${weekStatus}"` : "cleared"}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 900, fontSize: 15 }}>{player ? `Edit ${player.firstName} ${player.lastName}` : "Add a player"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><div style={labelStyle}>First name</div><input style={inputStyle} value={f.firstName} onChange={set("firstName")} /></div>
        <div><div style={labelStyle}>Last name</div><input style={inputStyle} value={f.lastName} onChange={set("lastName")} /></div>
        <div>
          <div style={labelStyle}>Team</div>
          <select style={inputStyle} value={f.teamCode} onChange={set("teamCode")}>
            {TEAMS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        <div><div style={labelStyle}>Draft rank</div><input style={inputStyle} inputMode="numeric" value={f.draftRank} onChange={set("draftRank")} /></div>
        <div>
          <div style={labelStyle}>Position</div>
          <select style={inputStyle} value={f.posAbbrev} onChange={set("posAbbrev")}>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Second position</div>
          <select style={inputStyle} value={f.secondaryPosAbbrev} onChange={set("secondaryPosAbbrev")}>
            <option value="">None</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><div style={labelStyle}>playfantasyrugby id</div><input style={inputStyle} inputMode="numeric" value={f.externalId} onChange={set("externalId")} /></div>
        <div><div style={labelStyle}>Current status (player card)</div><input style={inputStyle} placeholder="e.g. Knee - TBC" value={f.status} onChange={set("status")} /></div>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 800 }}>
        <input type="checkbox" checked={f.active} onChange={set("active")} /> In this season&apos;s player pool
      </label>
      {err ? <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 800 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={primaryButton} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save player"}</button>
        <button style={{ ...primaryButton, background: "rgba(15,23,42,0.35)" }} onClick={onCancel}>Close</button>
      </div>

      {player ? (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 8, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 900, fontSize: 13 }}>Status for a round</div>
          <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700 }}>
            e.g. Starting, Benched, Out, Knee - TBC. Leave empty for not named.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
            <select aria-label="Round" style={inputStyle} value={week} onChange={(e) => setWeek(Number(e.target.value))}>
              {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{weekLabel(getSeason(season), w)}</option>
              ))}
            </select>
            <input aria-label="Round status" style={inputStyle} value={weekStatus} onChange={(e) => setWeekStatus(e.target.value)} />
          </div>
          <button style={primaryButton} disabled={busy} onClick={saveWeekStatus}>Save round status</button>
        </div>
      ) : null}
    </div>
  );
}

function PlayersTab({ season, setMsg }: { season: number; setMsg: (m: string | null) => void }) {
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("");
  const [editing, setEditing] = useState<AdminPlayer | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api<{ players: AdminPlayer[] }>(`/api/admin/players?season=${season}`);
      setPlayers(r.players);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load players");
    } finally {
      setLoading(false);
    }
  }, [season]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => (!team || p.teamCode === team) && (!q || `${p.firstName} ${p.lastName} ${p.id}`.toLowerCase().includes(q)))
      .slice(0, 60);
  }, [players, search, team]);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 8 }}>
        <input style={inputStyle} placeholder="Search players" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select style={inputStyle} value={team} onChange={(e) => setTeam(e.target.value)}>
          <option value="">All teams</option>
          {TEAMS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </div>
      <button style={primaryButton} onClick={() => setEditing("new")}>Add a player</button>

      {editing ? (
        <PlayerForm
          key={editing === "new" ? "new" : editing.id}
          season={season}
          player={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(m) => {
            setMsg(m);
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      {err ? <div style={{ ...whiteBox, color: "#b91c1c", fontWeight: 800 }}>{err}</div> : null}
      <div style={{ ...whiteBox, padding: 0, overflow: "hidden" }}>
        {loading ? <div style={{ padding: 12, fontWeight: 800 }}>Loading…</div> : null}
        {!loading && !shown.length ? <div style={{ padding: 12, fontWeight: 800 }}>No players found</div> : null}
        {shown.map((p) => (
          <button
            key={p.id}
            onClick={() => setEditing(p)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              border: "none",
              borderBottom: "1px solid rgba(0,0,0,0.06)",
              background: p.active ? "transparent" : "rgba(0,0,0,0.05)",
              cursor: "pointer",
              color: "#0f172a",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, fontSize: 13 }}>
                {p.firstName} {p.lastName} {p.active ? "" : "(hidden)"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.65 }}>
                {p.teamCode} · {p.posAbbrev}{p.secondaryPosAbbrev ? `/${p.secondaryPosAbbrev}` : ""} · rank {p.draftRank < 9999 ? p.draftRank : "—"}
                {p.status ? ` · ${p.status}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.5, alignSelf: "center" }}>Edit</div>
          </button>
        ))}
      </div>
      {players.length > shown.length && !loading ? (
        <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85, textAlign: "center" }}>
          Showing {shown.length} of {players.length}. Search to find others.
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Difficulty ratings

function DifficultyRow({ season, r, setMsg }: { season: number; r: Rating; setMsg: (m: string | null) => void }) {
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
      <div style={{ fontWeight: 900, fontSize: 13 }}>{r.team}</div>
      {sel(home, setHome)}
      {sel(away, setAway)}
      <input type="checkbox" title="Pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
      <button
        disabled={!changed || busy}
        onClick={save}
        style={{ height: 30, borderRadius: 999, border: "none", padding: "0 10px", fontWeight: 900, fontSize: 12, cursor: changed ? "pointer" : "default", background: changed ? "rgb(29,78,216)" : "rgba(0,0,0,0.08)", color: changed ? "white" : "rgba(0,0,0,0.4)" }}
      >
        Save
      </button>
    </div>
  );
}

function DifficultyTab({ season, setMsg }: { season: number; setMsg: (m: string | null) => void }) {
  const [ratings, setRatings] = useState<Rating[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ ratings: Rating[] }>(`/api/admin/difficulty?season=${season}`)
      .then((r) => setRatings(r.ratings))
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load ratings"));
  }, [season]);
  return (
    <div style={whiteBox}>
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75, marginBottom: 6 }}>
        How hard each team is to play (1 easy, 5 hard). First number: at their ground. Second: when they visit
        yours. Tick to pin a rating so the in-season update leaves it alone.
      </div>
      {err ? <div style={{ color: "#b91c1c", fontWeight: 800 }}>{err}</div> : null}
      {ratings && !ratings.length ? <div style={{ fontWeight: 800 }}>No ratings for {season}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 6, fontSize: 10, fontWeight: 900, opacity: 0.6 }}>
        <div>TEAM</div><div style={{ width: 54 }}>THEIRS</div><div style={{ width: 54 }}>YOURS</div><div>PIN</div><div style={{ width: 52 }} />
      </div>
      {(ratings ?? []).map((r) => <DifficultyRow key={r.team} season={season} r={r} setMsg={setMsg} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rounds: regather stats and finalise again

function RoundsTab({ setMsg }: { setMsg: (m: string | null) => void }) {
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
      <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.75 }}>
        If a stat is corrected after a round was finalised: pick the round, preview the new scores, then confirm.
      </div>
      {err ? <div style={{ color: "#b91c1c", fontWeight: 800 }}>{err}</div> : null}
      {!leagues.length && !err ? <div style={{ fontWeight: 800 }}>No leagues this season yet.</div> : null}
      {leagues.length ? (
        <>
          <select style={inputStyle} value={leagueId} onChange={(e) => { setLeagueId(e.target.value); setPreview(null); }}>
            {leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select style={inputStyle} value={week} onChange={(e) => { setWeek(Number(e.target.value)); setPreview(null); }}>
            {(league?.weeks ?? []).map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
          </select>
          {!league?.weeks.length ? <div style={{ fontSize: 12, fontWeight: 800 }}>No finalised rounds yet.</div> : null}
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 800 }}>
            <input type="checkbox" checked={regather} onChange={(e) => setRegather(e.target.checked)} /> Regather stats from playfantasyrugby first
          </label>
          <button style={primaryButton} disabled={!!busy || !week} onClick={() => run(false)}>{busy && !busy.startsWith("Final") ? busy : "Preview new scores"}</button>
        </>
      ) : null}

      {preview ? (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", fontSize: 10, fontWeight: 900, opacity: 0.6 }}>
            <div>TEAM</div><div style={{ textAlign: "right" }}>NOW</div><div style={{ textAlign: "right" }}>NEW</div>
          </div>
          {preview.teams.map((t) => (
            <div key={t.teamId} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px", fontSize: 13, fontWeight: 800, color: isChange(t) ? "#b45309" : undefined }}>
              <div>{teamName(t.teamId)}</div>
              <div style={{ textAlign: "right" }}>{t.before ?? "—"}</div>
              <div style={{ textAlign: "right" }}>{t.after}</div>
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 800 }}>{changes ? `${changes} team score${changes === 1 ? "" : "s"} would change.` : "No scores would change."}</div>
          <button style={primaryButton} disabled={!!busy} onClick={() => run(true)}>{busy?.startsWith("Final") ? busy : "Confirm: finalise this round again"}</button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tab = "Players" | "Difficulty" | "Rounds";

export default function AdminPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const leagues = useLeagueStore((s) => s.leagues);
  const activeLeagueId = useLeagueStore((s) => s.activeLeagueId);
  const setActiveLeague = useLeagueStore((s) => s.setActiveLeague);
  const [tab, setTab] = useState<Tab>("Players");
  const [season, setSeason] = useState(currentSeasonYear());
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <main style={{ minHeight: "100svh", width: "100%", position: "relative", color: "white" }}>
      <div
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: -1, background: "linear-gradient(to bottom, rgb(15, 23, 42), rgb(13, 148, 136), rgb(16, 185, 129))" }}
      />
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 18px", paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", padding: 0, color: "white", fontSize: 36, fontWeight: 900, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", fontWeight: 900, fontSize: 22 }}>Admin</div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
              Players, difficulty ratings and rounds
            </div>
            {tab !== "Rounds" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                {Object.keys(SEASONS).map(Number).sort().map((y) => (
                  <button key={y} style={{ ...tabButton(y === season), flex: "0 0 auto", padding: "0 16px" }} onClick={() => setSeason(y)}>
                    {y}
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {(["Players", "Difficulty", "Rounds"] as Tab[]).map((t) => (
                <button key={t} style={tabButton(t === tab)} onClick={() => { setTab(t); setMsg(null); }}>{t}</button>
              ))}
            </div>
          </div>

          {msg ? (
            <div style={{ ...cardStyle, background: "rgba(34,197,94,0.25)", fontSize: 13, fontWeight: 800, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{msg}</span>
              <button onClick={() => setMsg(null)} style={{ background: "transparent", border: "none", color: "white", fontWeight: 900, cursor: "pointer" }}>×</button>
            </div>
          ) : null}

          <div style={cardStyle}>
            {tab === "Players" ? <PlayersTab key={season} season={season} setMsg={setMsg} /> : null}
            {tab === "Difficulty" ? <DifficultyTab key={season} season={season} setMsg={setMsg} /> : null}
            {tab === "Rounds" ? <RoundsTab setMsg={setMsg} /> : null}
          </div>
        </div>
      </div>

      <AppMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        leagues={leagues as never}
        activeLeagueId={activeLeagueId as never}
        setActiveLeague={setActiveLeague as never}
        activeItem="Admin"
      />
    </main>
  );
}
