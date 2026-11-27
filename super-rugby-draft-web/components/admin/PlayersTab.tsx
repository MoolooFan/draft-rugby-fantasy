"use client";
// components/admin/PlayersTab.tsx
// Admin → Players: find a player, add / edit / hide one, and their weekly status.
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api, inputStyle, labelStyle, primaryButton, whiteBox } from "./shared";
import { getSeason, totalFantasyWeeks, weekLabel } from "@/lib/season";
import { StatusTag } from "@/components/StatusTag";
import { STATUS_PRESETS } from "@/lib/status/kind";
import { POSITIONS, TEAMS, type AdminPlayer } from "./shared";
import { PlayerCoachDetails } from "./CoachTab";

export function PlayerForm({
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
  const [weekStatus, setWeekStatus] = useState(() => player?.weeklyStatus?.["W1"] ?? "");
  const weeks = totalFantasyWeeks(getSeason(season));
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  // the chosen week's status, again whenever the week or player changes (set while drawing)
  const [statusFor, setStatusFor] = useState<{ p: unknown; w: number }>({ p: player, w: week });
  if (statusFor.p !== player || statusFor.w !== week) {
    setStatusFor({ p: player, w: week });
    setWeekStatus(player?.weeklyStatus?.[`W${week}`] ?? "");
  }

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
        <button style={primaryButton} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save Player"}</button>
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
          <button style={primaryButton} disabled={busy} onClick={saveWeekStatus}>Save Round Status</button>
        </div>
      ) : null}
    </div>
  );
}

export function PlayersTab({ season, setMsg }: { season: number; setMsg: (m: string | null) => void }) {
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
  // the season's players (fetched here, set when they arrive; Refresh uses load())
  useEffect(() => {
    let live = true;
    api<{ players: AdminPlayer[] }>(`/api/admin/players?season=${season}`)
      .then((r) => live && setPlayers(r.players))
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Couldn't load players"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [season]);

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
      <button style={primaryButton} onClick={() => setEditing("new")}>Add a Player</button>

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
                {p.teamCode} · {p.posAbbrev}{p.secondaryPosAbbrev ? `, ${p.secondaryPosAbbrev}` : ""}{p.thirdPosAbbrev ? `, ${p.thirdPosAbbrev}` : ""} · rank {p.draftRank < 9999 ? p.draftRank : "—"}
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

