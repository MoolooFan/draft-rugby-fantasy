"use client";
// app/admin/page.tsx — the site admin's page (Ethan). Small edits without going into Supabase:
// players (add / edit / hide, weekly status), fixture difficulty ratings, and regathering stats
// and finalising a round again. Every request is checked on the server (admin only).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { AppMenu } from "@/components/AppMenu";
import { useLeagueStore } from "@/lib/league/store";
import { currentSeasonYear, getSeason, SEASONS, totalFantasyWeeks, weekLabel } from "@/lib/season";
import { ScoringEditor } from "@/components/ScoringEditor";
import type { ScoringRules } from "@/lib/scoring";
import { StatusTag } from "@/components/StatusTag";
import { STATUS_PRESETS } from "@/lib/status/kind";

// ---------------------------------------------------------------------------
// Styles (same look as the other pages)

const cardStyle: React.CSSProperties = { ...themeCard };
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
  fontWeight: 700,
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
  fontWeight: 500,
  color: "#0f172a",
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, opacity: 0.7, marginBottom: 3 };
const tabButton = (active: boolean): React.CSSProperties => ({
  flex: 1,
  height: 36,
  borderRadius: 999,
  border: "none",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  background: active ? "#0f172a" : "#eef2f6",
  color: active ? "white" : "#0f172a",
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
  thirdPosAbbrev?: string;
  draftRank: number;
  externalId: number | null;
  expectedRole?: "starter" | "bench" | "squad" | null;
  kickOrder?: number | null;
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
    thirdPosAbbrev: player?.thirdPosAbbrev ?? "",
    draftRank: player?.draftRank && player.draftRank < 9999 ? String(player.draftRank) : "",
    externalId: player?.externalId ? String(player.externalId) : "",
    expectedRole: player?.expectedRole ?? "",
    kickOrder: player?.kickOrder ? String(player.kickOrder) : "",
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
      <div style={{ fontWeight: 700, fontSize: 15 }}>{player ? `Edit ${player.firstName} ${player.lastName}` : "Add a player"}</div>
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
        <div>
          <div style={labelStyle}>Third position</div>
          <select style={inputStyle} value={f.thirdPosAbbrev} onChange={set("thirdPosAbbrev")}>
            <option value="">None</option>
            {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><div style={labelStyle}>playfantasyrugby id</div><input style={inputStyle} inputMode="numeric" value={f.externalId} onChange={set("externalId")} /></div>
        <div>
          <div style={labelStyle}>Expected role (start of season)</div>
          <select style={inputStyle} value={f.expectedRole} onChange={set("expectedRole")}>
            <option value="">Not set (use team lists)</option>
            <option value="starter">Starter</option>
            <option value="bench">Bench</option>
            <option value="squad">Squad (not expected to be named)</option>
          </select>
        </div>
        <div>
          <div style={labelStyle}>Goal kicker</div>
          <select style={inputStyle} value={f.kickOrder} onChange={set("kickOrder")}>
            <option value="">No</option>
            <option value="1">First choice</option>
            <option value="2">Second choice</option>
          </select>
        </div>
        <div>
          <div style={labelStyle}>Current status (player card) <StatusTag text={f.status} /></div>
          <input style={inputStyle} list="status-presets" placeholder="e.g. Knee - TBC" value={f.status} onChange={set("status")} />
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>
        Expected points: draft rank sets how good he&apos;s expected to be. Expected role and goal kicker help early in the
        season (e.g. a player who moved team); they fade out as real team lists and kicking come in.
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={f.active} onChange={set("active")} /> In this season&apos;s player pool
      </label>
      {err ? <div style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button style={primaryButton} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save player"}</button>
        <button style={{ ...primaryButton, background: "rgba(15,23,42,0.35)" }} onClick={onCancel}>Close</button>
      </div>

      <datalist id="status-presets">
        {STATUS_PRESETS.map((x) => <option key={x} value={x} />)}
      </datalist>

      {player ? <PlayerCoachDetails player={player} /> : null}

      {player ? (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 8, display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Status for a round</div>
          <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 500 }}>
            e.g. Starting, Benched, Knee - 2 weeks, Suspended - 1 week, Out - Personal reasons. Leave empty for not named.
            Injuries get INJ, &quot;Suspended…&quot; gets SUS, &quot;Out…&quot; (personal reasons, paternity leave, rested…) gets OUT.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
            <select aria-label="Round" style={inputStyle} value={week} onChange={(e) => setWeek(Number(e.target.value))}>
              {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>{weekLabel(getSeason(season), w)}</option>
              ))}
            </select>
            <input aria-label="Round status" style={inputStyle} list="status-presets" value={weekStatus} onChange={(e) => setWeekStatus(e.target.value)} />
          </div>
          {weekStatus.trim() ? <div style={{ fontSize: 11, fontWeight: 600 }}>Shows as <StatusTag text={weekStatus} /></div> : null}
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

      {err ? <div style={{ ...whiteBox, color: "#b91c1c", fontWeight: 600 }}>{err}</div> : null}
      <div style={{ ...whiteBox, padding: 0, overflow: "hidden" }}>
        {loading ? <div style={{ padding: 12, fontWeight: 600 }}>Loading…</div> : null}
        {!loading && !shown.length ? <div style={{ padding: 12, fontWeight: 600 }}>No players found</div> : null}
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
              <div style={{ fontWeight: 700, fontSize: 13 }}>
                {p.firstName} {p.lastName} {p.active ? "" : "(hidden)"}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>
                {p.teamCode} · {p.posAbbrev}{p.secondaryPosAbbrev ? `/${p.secondaryPosAbbrev}` : ""}{p.thirdPosAbbrev ? `/${p.thirdPosAbbrev}` : ""} · rank {p.draftRank < 9999 ? p.draftRank : "—"}
                {p.status ? ` · ${p.status}` : ""}
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, alignSelf: "center" }}>Edit</div>
          </button>
        ))}
      </div>
      {players.length > shown.length && !loading ? (
        <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, textAlign: "center" }}>
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
          <button style={primaryButton} disabled={!!busy || !week} onClick={() => run(false)}>{busy && !busy.startsWith("Final") ? busy : "Preview new scores"}</button>
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

// ---------------------------------------------------------------------------
// Status: the Wednesday team-list / injury-list reader

type StatusFlag = { id: string; weekLabel: string; source: string; team: string; text: string; problem: string; suggestionId: string | null; suggestionName: string | null };
type StatusImport = { id: string; real_round: number; kind: string; url: string; matched: number; flagged: number; imported_at: string };

function StatusTab({ setMsg }: { setMsg: (m: string | null) => void }) {
  const [rounds, setRounds] = useState<number[]>([]);
  const [round, setRound] = useState(1);
  const [teamsUrl, setTeamsUrl] = useState("");
  const [injuriesUrl, setInjuriesUrl] = useState("");
  const [flags, setFlags] = useState<StatusFlag[]>([]);
  const [imports, setImports] = useState<StatusImport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ rounds: number[]; flags: StatusFlag[]; imports: StatusImport[] }>("/api/admin/status");
      setRounds(r.rounds);
      setFlags(r.flags);
      setImports(r.imports);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function runImport() {
    setBusy("import");
    setErr(null);
    try {
      const r = await api<{ report: { teamList: { matched: number; flagged: number } | null; injuryList: { matched: number; flagged: number } | null } }>(
        "/api/admin/status",
        { action: "import", realRound: round, teamsUrl, injuriesUrl }
      );
      const t = r.report.teamList, i = r.report.injuryList;
      setMsg(
        !t && !i
          ? `No articles found for round ${round} yet. If they're out, paste their links and try again.`
          : `Round ${round}: team lists ${t ? `${t.matched} players, ${t.flagged} to check` : "not found"}; injuries ${i ? `${i.matched} players, ${i.flagged} to check` : "not found"}.`
      );
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  async function resolve(f: StatusFlag, apply: boolean) {
    setBusy(f.id);
    try {
      await api("/api/admin/status", { action: "resolve", flagId: f.id, apply });
      setMsg(apply ? `Gave ${f.suggestionName} that status.` : "Ignored.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75 }}>
          Player statuses are read from the official team lists and injury list (out Wednesday 4pm NZT),
          once at 4:30pm NZT on Wednesday. Late changes: edit the player in the Players tab.
        </div>
        <select aria-label="Super Rugby round" style={inputStyle} value={round} onChange={(e) => setRound(Number(e.target.value))}>
          {rounds.map((r) => <option key={r} value={r}>Super Rugby round {r}</option>)}
        </select>
        <input style={inputStyle} placeholder="Team lists article link (optional)" value={teamsUrl} onChange={(e) => setTeamsUrl(e.target.value)} />
        <input style={inputStyle} placeholder="Injury list article link (optional)" value={injuriesUrl} onChange={(e) => setInjuriesUrl(e.target.value)} />
        <button style={primaryButton} disabled={!!busy} onClick={runImport}>{busy === "import" ? "Reading articles…" : "Read articles now"}</button>
        {err ? <div style={{ color: "#b91c1c", fontWeight: 600, fontSize: 12 }}>{err}</div> : null}
      </div>

      <div style={{ ...whiteBox, display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{loaded ? `To check (${flags.length})` : "To check"}</div>
        {!loaded ? <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>Loading…</div> : null}
        {loaded && !flags.length ? <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>Nothing to check.</div> : null}
        {flags.map((f) => (
          <div key={f.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 6, display: "grid", gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{f.problem}</div>
            <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>
              {f.weekLabel} · {f.team} · {f.source === "team-list" ? "team list" : "injury list"} · {f.text}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {f.suggestionId ? (
                <button disabled={busy === f.id} onClick={() => resolve(f, true)} style={{ ...primaryButton, height: 30, fontSize: 12 }}>
                  Use {f.suggestionName}
                </button>
              ) : null}
              <button disabled={busy === f.id} onClick={() => resolve(f, false)} style={{ ...primaryButton, height: 30, fontSize: 12, background: "rgba(15,23,42,0.35)" }}>
                Ignore
              </button>
            </div>
          </div>
        ))}
      </div>

      {imports.length ? (
        <div style={{ ...whiteBox, display: "grid", gap: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Recently read</div>
          {imports.map((i) => (
            <div key={i.id} style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>
              Round {i.real_round} {i.kind === "team-list" ? "team lists" : "injury list"}: {i.matched} players, {i.flagged} to check ·{" "}
              {new Date(i.imported_at).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoring: the Standard and Alternate point values

function ScoringTab({ setMsg }: { setMsg: (m: string | null) => void }) {
  const [systems, setSystems] = useState<{ standard: ScoringRules; alternate: ScoringRules } | null>(null);
  const [which, setWhich] = useState<"standard" | "alternate">("alternate");
  const [draft, setDraft] = useState<ScoringRules | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ systems: { standard: ScoringRules; alternate: ScoringRules } }>("/api/admin/scoring")
      .then((r) => setSystems(r.systems))
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load scoring"));
  }, []);
  useEffect(() => {
    if (systems) setDraft(systems[which]);
  }, [systems, which]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ rules: ScoringRules }>("/api/admin/scoring", { id: which, rules: draft });
      setSystems((s) => (s ? { ...s, [which]: r.rules } : s));
      setMsg(`Saved ${which === "standard" ? "Standard" : "Alternate"} scoring. Leagues that haven't drafted yet will use it.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75 }}>
        Point values for the Standard and Alternate systems. A league&apos;s scoring is frozen when its draft
        starts, so changes here only affect leagues that haven&apos;t drafted yet.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {(["standard", "alternate"] as const).map((id) => (
          <button key={id} style={{ ...tabButton(which === id), color: which === id ? "white" : "#0f172a", background: which === id ? "rgb(29,78,216)" : "rgba(0,0,0,0.06)" }} onClick={() => setWhich(id)}>
            {id === "standard" ? "Standard" : "Alternate"}
          </button>
        ))}
      </div>
      {err ? <div style={{ color: "#b91c1c", fontWeight: 600, fontSize: 12 }}>{err}</div> : null}
      {draft ? <ScoringEditor value={draft} onChange={setDraft} admin /> : <div style={{ fontWeight: 600 }}>Loading…</div>}
      <button style={primaryButton} disabled={busy || !draft} onClick={save}>{busy ? "Saving…" : `Save ${which === "standard" ? "Standard" : "Alternate"} scoring`}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Tab = "Players" | "Status" | "Difficulty" | "Rounds" | "Scoring" | "History" | "Coach";

// ---------------------------------------------------------------------------
// History (E8): link past seasons to a league and history names to accounts, for the stars

type HistoryData = {
  groups: Array<{ season: number; leagueName: string; lineageId: string | null; champion: string | null; rows: number }>;
  people: Array<{ personName: string; userId: string | null }>;
  leagues: Array<{ id: string; name: string; season: number; lineageId: string }>;
  users: Array<{ id: string; username: string }>;
};

// ---------------------------------------------------------------------------
// AI coach (lib/coach)

type CoachAdmin = {
  settings: { enabled: boolean; model: string };
  hasKey: boolean;
  models: string[];
  jobs: Array<{ job_key: string; kind: string; status: string; requests: number; written: number; error: string | null; created_at: string }>;
  notes: Array<{ id: string; player_id: string; kind: string; week: number | null; headline: string; body: string; next_week: string; verdict: string | null; hidden: boolean; edited: boolean; created_at: string }>;
  context: Array<{ id: string; scope: string; player_id: string | null; team_code: string | null; text: string; active: boolean; created_at: string }>;
  profile: { birth_date: string | null; international: string | null; rest_notes: string | null; injury_notes: string | null } | null;
};

const MODEL_LABEL: Record<string, string> = {
  "claude-sonnet-5-5": "Sonnet 5.5 (about $50-70 a season)",
  "claude-opus-5-5": "Opus 5.5 (best, about $100-150 a season)",
  "claude-haiku-5-5": "Haiku 5.5 (cheapest, about $5-10 a season)",
};

function CoachNoteRow({ n, name, onChange, setMsg }: { n: CoachAdmin["notes"][number]; name: string; onChange: () => void; setMsg: (m: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ headline: n.headline, body: n.body, next_week: n.next_week });
  async function act(body: Record<string, unknown>, done: string) {
    try {
      await api("/api/admin/coach", body);
      setMsg(done);
      setEditing(false);
      onChange();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    }
  }
  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: "8px 0", opacity: n.hidden ? 0.5 : 1, display: "grid", gap: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.65 }}>
        {name} · {n.kind}
        {n.week ? ` · week ${n.week}` : ""} · {new Date(n.created_at).toLocaleString()}
        {n.edited ? " · edited" : ""}
        {n.hidden ? " · hidden" : ""}
      </div>
      {editing ? (
        <>
          <input style={inputStyle} value={f.headline} maxLength={120} onChange={(e) => setF((x) => ({ ...x, headline: e.target.value }))} aria-label="Headline" />
          <textarea style={{ ...inputStyle, height: 90, padding: 8 }} value={f.body} maxLength={1200} onChange={(e) => setF((x) => ({ ...x, body: e.target.value }))} aria-label="Note" />
          <textarea style={{ ...inputStyle, height: 60, padding: 8 }} value={f.next_week} maxLength={600} onChange={(e) => setF((x) => ({ ...x, next_week: e.target.value }))} aria-label="Next week" placeholder="Next week (optional)" />
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...primaryButton, height: 30 }} onClick={() => act({ action: "note_edit", id: n.id, ...f }, "Note saved")}>Save</button>
            <button style={{ ...primaryButton, height: 30, background: "rgba(15,23,42,0.35)" }} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{n.headline}</div>
          <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4 }}>{n.body}</div>
          {n.next_week ? <div style={{ fontSize: 12, fontWeight: 600 }}><b>Next week:</b> {n.next_week}</div> : null}
          <div style={{ display: "flex", gap: 6 }}>
            <button style={{ ...primaryButton, height: 28, width: "auto", padding: "0 12px", fontSize: 11 }} onClick={() => setEditing(true)}>Edit</button>
            <button
              style={{ ...primaryButton, height: 28, width: "auto", padding: "0 12px", fontSize: 11, background: "rgba(15,23,42,0.35)" }}
              onClick={() => act({ action: "note_hide", id: n.id, hidden: !n.hidden }, n.hidden ? "Note shown again" : "Note hidden")}
            >
              {n.hidden ? "Show" : "Hide"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function CoachTab({ season, setMsg }: { season: number; setMsg: (m: string | null) => void }) {
  const [data, setData] = useState<CoachAdmin | null>(null);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<"player" | "team" | "general">("player");
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState<AdminPlayer | null>(null);
  const [teamCode, setTeamCode] = useState("CHI");
  const [text, setText] = useState("");
  const [writeNow, setWriteNow] = useState(true);
  const load = useCallback(() => {
    api<CoachAdmin>("/api/admin/coach").then(setData).catch((e) => setMsg(e instanceof Error ? e.message : "Couldn't load the coach"));
  }, [setMsg]);
  useEffect(() => {
    load();
    api<{ players: AdminPlayer[] }>(`/api/admin/players?season=${season}`).then((r) => setPlayers(r.players)).catch(() => {});
  }, [load, season]);
  const nameOf = (id: string | null) => {
    const p = players.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : id ?? "";
  };
  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    try {
      const r = await api<{ message?: string; report?: unknown }>("/api/admin/coach", body);
      setMsg(r.message ?? done ?? "Done");
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  const matches = search.trim().length >= 2 ? players.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6) : [];
  if (!data) return <div style={whiteBox}>Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>AI coach</div>
        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75, lineHeight: 1.4 }}>
          Writes player notes: a season outlook, after each game (when the stats are final), when the team and injury lists come out, and when you change a status or add news below.
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: data.hasKey ? "#15803d" : "#b91c1c" }}>
          {data.hasKey ? "Anthropic API key: set" : "Anthropic API key: not set (the coach can't write anything until it is)"}
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={data.settings.enabled} disabled={busy} onChange={(e) => act({ action: "settings", enabled: e.target.checked }, e.target.checked ? "Coach switched on" : "Coach switched off")} />
          Coach switched on
        </label>
        <div>
          <div style={labelStyle}>Model</div>
          <select style={inputStyle} value={data.settings.model} disabled={busy} onChange={(e) => act({ action: "settings", model: e.target.value }, "Model saved")}>
            {data.models.map((m) => <option key={m} value={m}>{MODEL_LABEL[m] ?? m}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={primaryButton} disabled={busy || !data.hasKey} onClick={() => act({ action: "outlooks" })}>Write season outlooks</button>
          <button style={{ ...primaryButton, background: "rgba(15,23,42,0.35)" }} disabled={busy || !data.hasKey} onClick={() => act({ action: "run" }, "Checked")}>Check now</button>
        </div>
        {data.jobs.length ? (
          <div style={{ fontSize: 11, fontWeight: 500, display: "grid", gap: 2 }}>
            <div style={{ fontWeight: 700, opacity: 0.7 }}>Recent batches</div>
            {data.jobs.map((j) => (
              <div key={j.job_key}>
                {new Date(j.created_at).toLocaleString()} · {j.kind} · {j.status} · {j.written}/{j.requests} notes{j.error ? ` · ${j.error}` : ""}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Tell the coach something</div>
        <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.75 }}>Used in every note while it&apos;s on, e.g. &quot;Jacomb is now the Highlanders&apos; starting 10 and goal kicker&quot;.</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["player", "team", "general"] as const).map((sc) => (
            <button key={sc} onClick={() => setScope(sc)} style={tabButton(scope === sc)}>{sc === "general" ? "Everyone" : sc === "player" ? "A player" : "A team"}</button>
          ))}
        </div>
        {scope === "player" ? (
          pick ? (
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {pick.firstName} {pick.lastName}{" "}
              <button onClick={() => setPick(null)} style={{ border: "none", background: "transparent", textDecoration: "underline", cursor: "pointer", fontWeight: 600 }}>change</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              <input style={inputStyle} placeholder="Search a player" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search a player" />
              {matches.map((p) => (
                <button key={p.id} onClick={() => { setPick(p); setSearch(""); }} style={{ textAlign: "left", border: "none", background: "rgba(15,23,42,0.05)", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontWeight: 600 }}>
                  {p.firstName} {p.lastName} · {p.teamCode}
                </button>
              ))}
            </div>
          )
        ) : scope === "team" ? (
          <select style={inputStyle} value={teamCode} onChange={(e) => setTeamCode(e.target.value)} aria-label="Team">
            {TEAMS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        ) : null}
        <textarea style={{ ...inputStyle, height: 80, padding: 8 }} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should the coach know?" aria-label="Note for the coach" />
        {scope === "player" ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 600 }}>
            <input type="checkbox" checked={writeNow} onChange={(e) => setWriteNow(e.target.checked)} /> Write a coach update about him now
          </label>
        ) : null}
        <button
          style={primaryButton}
          disabled={busy || !text.trim() || (scope === "player" && !pick)}
          onClick={async () => {
            await act({ action: "context_add", scope, playerId: pick?.id, teamCode, text, writeNow: scope === "player" && writeNow });
            setText("");
          }}
        >
          Save
        </button>
        {data.context.length ? (
          <div style={{ display: "grid", gap: 4 }}>
            {data.context.map((c) => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 4, opacity: c.active ? 1 : 0.5 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>
                  <b>{c.scope === "player" ? nameOf(c.player_id) : c.scope === "team" ? c.team_code : "Everyone"}:</b> {c.text}
                </div>
                <button style={{ ...primaryButton, height: 26, width: "auto", padding: "0 10px", fontSize: 11 }} onClick={() => act({ action: "context_toggle", id: c.id, active: !c.active }, c.active ? "Turned off" : "Turned on")}>
                  {c.active ? "Turn off" : "Turn on"}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={whiteBox}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Latest notes</div>
        {data.notes.length ? data.notes.map((n) => <CoachNoteRow key={n.id} n={n} name={nameOf(n.player_id)} onChange={load} setMsg={setMsg} />) : <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.7 }}>None yet.</div>}
      </div>
    </div>
  );
}

/** In a player's edit form: what the coach should know that the stats don't show. */
function PlayerCoachDetails({ player }: { player: AdminPlayer }) {
  const [f, setF] = useState<{ birthDate: string; international: string; restNotes: string; injuryNotes: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<CoachAdmin>(`/api/admin/coach?playerId=${encodeURIComponent(player.id)}`)
      .then((r) => setF({ birthDate: r.profile?.birth_date ?? "", international: r.profile?.international ?? "", restNotes: r.profile?.rest_notes ?? "", injuryNotes: r.profile?.injury_notes ?? "" }))
      .catch(() => setF({ birthDate: "", international: "", restNotes: "", injuryNotes: "" }));
  }, [player.id]);
  if (!f) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => (x ? { ...x, [k]: e.target.value } : x));
  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)", paddingTop: 8, display: "grid", gap: 6 }}>
      <div style={{ fontWeight: 700, fontSize: 13 }}>For the AI coach</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><div style={labelStyle}>Birth date</div><input type="date" style={inputStyle} value={f.birthDate} onChange={set("birthDate")} /></div>
        <div><div style={labelStyle}>International</div><input style={inputStyle} placeholder="e.g. All Blacks" value={f.international} onChange={set("international")} /></div>
      </div>
      <div><div style={labelStyle}>Rest policy</div><input style={inputStyle} placeholder="e.g. 2 All Blacks rest weeks, likely rounds 6 and 11" value={f.restNotes} onChange={set("restNotes")} /></div>
      <div><div style={labelStyle}>Injury history</div><input style={inputStyle} placeholder="e.g. Hamstring problems 2025 and 2026" value={f.injuryNotes} onChange={set("injuryNotes")} /></div>
      <button
        style={primaryButton}
        onClick={async () => {
          try {
            await api("/api/admin/coach", { action: "profile", playerId: player.id, ...f });
            setMsg("Saved for the coach");
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Save failed");
          }
        }}
      >
        Save coach details
      </button>
      {msg ? <div style={{ fontSize: 12, fontWeight: 600 }}>{msg}</div> : null}
    </div>
  );
}

function HistoryTab({ setMsg }: { setMsg: (m: string | null) => void }) {
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
            style={{ background: "transparent", border: "none", padding: 0, color: "inherit", fontSize: 36, fontWeight: 700, lineHeight: "36px", cursor: "pointer" }}
          >
            ☰
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <div style={cardStyle}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 22 }}>Admin</div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 12, fontWeight: 600, opacity: 0.9 }}>
              Players, statuses, difficulty, rounds, scoring and history
            </div>
            {tab === "Players" || tab === "Difficulty" ? (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 10 }}>
                {Object.keys(SEASONS).map(Number).sort().map((y) => (
                  <button key={y} style={{ ...tabButton(y === season), flex: "0 0 auto", padding: "0 16px" }} onClick={() => setSeason(y)}>
                    {y}
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {(["Players", "Status", "Difficulty", "Rounds", "Scoring", "History", "Coach"] as Tab[]).map((t) => (
                <button key={t} style={tabButton(t === tab)} onClick={() => { setTab(t); setMsg(null); }}>{t}</button>
              ))}
            </div>
          </div>

          {msg ? (
            <div style={{ ...cardStyle, background: "#dcfce7", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>{msg}</span>
              <button onClick={() => setMsg(null)} style={{ background: "transparent", border: "none", color: "inherit", fontWeight: 700, cursor: "pointer" }}>×</button>
            </div>
          ) : null}

          <div style={cardStyle}>
            {tab === "Players" ? <PlayersTab key={season} season={season} setMsg={setMsg} /> : null}
            {tab === "Difficulty" ? <DifficultyTab key={season} season={season} setMsg={setMsg} /> : null}
            {tab === "Rounds" ? <RoundsTab setMsg={setMsg} /> : null}
            {tab === "Status" ? <StatusTab setMsg={setMsg} /> : null}
            {tab === "Scoring" ? <ScoringTab setMsg={setMsg} /> : null}
            {tab === "History" ? <HistoryTab setMsg={setMsg} /> : null}
            {tab === "Coach" ? <CoachTab season={season} setMsg={setMsg} /> : null}
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
