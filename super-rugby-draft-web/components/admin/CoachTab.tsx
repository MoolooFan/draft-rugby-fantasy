"use client";
// components/admin/CoachTab.tsx
// Admin → Coach (lib/coach): the AI coach's settings, jobs, notes and extra context, and the
// coach details in a player's edit form.
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useCallback, useEffect, useState } from "react";
import { api, inputStyle, labelStyle, primaryButton, tabButton, whiteBox } from "./shared";
import { TEAMS, type AdminPlayer } from "./shared";

export type CoachAdmin = {
  settings: { enabled: boolean; model: string };
  hasKey: boolean;
  models: string[];
  jobs: Array<{ job_key: string; kind: string; status: string; requests: number; written: number; error: string | null; created_at: string }>;
  notes: Array<{ id: string; player_id: string; kind: string; week: number | null; headline: string; body: string; next_week: string; verdict: string | null; hidden: boolean; edited: boolean; created_at: string }>;
  context: Array<{ id: string; scope: string; player_id: string | null; team_code: string | null; text: string; active: boolean; created_at: string }>;
  profile: { birth_date: string | null; international: string | null; rest_notes: string | null; injury_notes: string | null } | null;
};

export const MODEL_LABEL: Record<string, string> = {
  "claude-sonnet-5-5": "Sonnet 5.5 (about $50-70 a season)",
  "claude-opus-5-5": "Opus 5.5 (best, about $100-150 a season)",
  "claude-haiku-5-5": "Haiku 5.5 (cheapest, about $5-10 a season)",
};

export function CoachNoteRow({ n, name, onChange, setMsg }: { n: CoachAdmin["notes"][number]; name: string; onChange: () => void; setMsg: (m: string | null) => void }) {
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

export function CoachTab({ season, setMsg }: { season: number; setMsg: (m: string | null) => void }) {
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
          <button style={primaryButton} disabled={busy || !data.hasKey} onClick={() => act({ action: "outlooks" })}>Write Season Outlooks</button>
          <button style={{ ...primaryButton, background: "rgba(15,23,42,0.35)" }} disabled={busy || !data.hasKey} onClick={() => act({ action: "run" }, "Checked")}>Check Now</button>
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
                  {c.active ? "Turn Off" : "Turn On"}
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
export function PlayerCoachDetails({ player }: { player: AdminPlayer }) {
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
