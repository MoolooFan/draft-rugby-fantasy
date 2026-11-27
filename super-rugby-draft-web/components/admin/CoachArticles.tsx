"use client";
// components/admin/CoachArticles.tsx
// Admin → Coach → Share an article (lib/coach/articles.ts): paste a link, the site reads it and
// ticks the players and teams it mentions (untick any, or add more), then Save. If the site
// can't read it, it says why and you paste the article's text instead.
import React, { useState } from "react";
import { api, inputStyle, primaryButton, whiteBox } from "./shared";
import { TEAMS, type AdminPlayer } from "./shared";

export type CoachArticle = { id: string; url: string; title: string; source: string; how: string; player_ids: string[]; team_codes: string[]; active: boolean; created_at: string };

type ReadResult = {
  read: { ok: boolean; title: string; source: string; chars: number; preview: string; problem: string | null };
  players: Array<{ id: string; name: string; team: string }>;
  teams: string[];
};

const small: React.CSSProperties = { fontSize: 12, fontWeight: 500, opacity: 0.75, lineHeight: 1.4 };
const tick: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: "rgba(15,23,42,0.06)", fontSize: 12, fontWeight: 600, cursor: "pointer" };

export function CoachArticles({
  articles,
  players,
  nameOf,
  onSaved,
  setMsg,
}: {
  articles: CoachArticle[];
  players: AdminPlayer[];
  nameOf: (id: string) => string;
  onSaved: () => void;
  setMsg: (m: string | null) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReadResult | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Array<{ id: string; name: string; team: string }>>([]);
  const [search, setSearch] = useState("");
  const [writeNow, setWriteNow] = useState(true);

  const reset = () => {
    setUrl("");
    setResult(null);
    setPasting(false);
    setPasted("");
    setTitle("");
    setPicked(new Set());
    setTeams(new Set());
    setExtra([]);
  };

  async function read(withText?: string) {
    setBusy(true);
    try {
      const r = await api<ReadResult>("/api/admin/coach", { action: "article_read", url, text: withText || undefined, title: title || undefined });
      setResult(r);
      if (!title && r.read.title) setTitle(r.read.title);
      setPicked(new Set(r.players.map((p) => p.id)));
      setTeams(new Set(r.teams));
      if (!r.read.ok && !withText) setPasting(true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read that");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ message?: string }>("/api/admin/coach", {
        action: "article_add",
        url,
        title,
        text: pasting ? pasted : undefined,
        playerIds: [...picked],
        teamCodes: [...teams],
        writeNow,
      });
      setMsg(r.message ?? "Saved");
      reset();
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save it");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };
  const shownPlayers = [...(result?.players ?? []), ...extra.filter((x) => !result?.players.some((p) => p.id === x.id))];
  const matches = search.trim()
    ? players.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];
  const canSave = !!result && (!pasting || pasted.trim().length >= 200) && (picked.size > 0 || teams.size > 0) && (result.read.ok || pasting);

  async function toggleActive(a: CoachArticle) {
    try {
      await api("/api/admin/coach", { action: "article_toggle", id: a.id, active: !a.active });
      setMsg(a.active ? "Turned off" : "Turned on");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function remove(a: CoachArticle) {
    if (!window.confirm(`Delete "${a.title || a.url}"? The coach stops using it. This can't be undone.`)) return;
    try {
      await api("/api/admin/coach", { action: "article_delete", id: a.id });
      setMsg("Article deleted");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div style={{ ...whiteBox, display: "grid", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>Share an article</div>
      <div style={small}>Paste a link to a news article. The coach uses the parts about each player it mentions in their notes while it&apos;s on.</div>
      <div style={{ display: "flex", gap: 6 }}>
        <input style={{ ...inputStyle, flex: 1 }} placeholder="https://..." value={url} onChange={(e) => { setUrl(e.target.value); setResult(null); setPasting(false); }} aria-label="Article link" inputMode="url" />
        <button style={{ ...primaryButton, width: "auto", padding: "0 14px" }} disabled={busy || !url.trim()} onClick={() => read()}>
          {busy && !result ? "Reading…" : "Read It"}
        </button>
      </div>

      {result ? (
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 8 }}>
          {result.read.ok ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: "#0f766e" }}>
              {pasting ? `Using the text you pasted (${result.read.chars.toLocaleString()} characters).` : `Read ${result.read.chars.toLocaleString()} characters from ${result.read.source}.`}
            </div>
          ) : (
            <div style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c", background: "rgba(239,68,68,0.08)", borderRadius: 8, padding: "6px 8px" }}>
              Couldn&apos;t read this article: {result.read.problem ?? "no text found."} Copy the article&apos;s text from the site and paste it below.
            </div>
          )}
          {pasting ? (
            <>
              <textarea
                style={{ ...inputStyle, height: 140, padding: 8 }}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste the article's text here"
                aria-label="Article text"
              />
              <button style={{ ...primaryButton, height: 30 }} disabled={busy || pasted.trim().length < 200} onClick={() => read(pasted)}>
                Find Who It&apos;s About
              </button>
            </>
          ) : (
            <button onClick={() => setPasting(true)} style={{ justifySelf: "start", border: "none", background: "transparent", padding: 0, textDecoration: "underline", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Paste the text instead
            </button>
          )}
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Article title" />

          <div style={{ fontSize: 12, fontWeight: 700 }}>Players it&apos;s about</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {shownPlayers.length ? (
              shownPlayers.map((p) => (
                <label key={p.id} style={{ ...tick, opacity: picked.has(p.id) ? 1 : 0.5 }}>
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(picked, setPicked, p.id)} />
                  {p.name} · {p.team}
                </label>
              ))
            ) : (
              <span style={small}>None found. Add them below.</span>
            )}
          </div>
          <input style={inputStyle} placeholder="Add a player" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Add a player" />
          {matches.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setExtra((x) => [...x.filter((y) => y.id !== p.id), { id: p.id, name: `${p.firstName} ${p.lastName}`, team: p.teamCode }]);
                setPicked((s) => new Set([...s, p.id]));
                setSearch("");
              }}
              style={{ textAlign: "left", border: "none", background: "rgba(15,23,42,0.05)", borderRadius: 8, padding: "6px 8px", cursor: "pointer", fontWeight: 600 }}
            >
              {p.firstName} {p.lastName} · {p.teamCode}
            </button>
          ))}

          <div style={{ fontSize: 12, fontWeight: 700 }}>Teams it&apos;s about</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TEAMS.map(([code, name]) => (
              <label key={code} style={{ ...tick, opacity: teams.has(code) ? 1 : 0.45 }}>
                <input type="checkbox" checked={teams.has(code)} onChange={() => toggle(teams, setTeams, code)} />
                {name}
              </label>
            ))}
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 600 }}>
            <input type="checkbox" checked={writeNow} onChange={(e) => setWriteNow(e.target.checked)} /> Write coach updates for these players now (up to 10)
          </label>
          <button style={primaryButton} disabled={busy || !canSave} onClick={save}>Save Article</button>
        </div>
      ) : null}

      {articles.length ? (
        <div style={{ display: "grid", gap: 4 }}>
          {articles.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center", borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 4, opacity: a.active ? 1 : 0.5 }}>
              <div style={{ fontSize: 12, fontWeight: 500, minWidth: 0 }}>
                <a href={a.url} target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: "inherit" }}>{a.title || a.url}</a>
                <div style={{ opacity: 0.75 }}>
                  {a.source}
                  {a.how === "pasted" ? " (pasted)" : ""} · {new Date(a.created_at).toLocaleDateString()} ·{" "}
                  {[...a.player_ids.map(nameOf), ...a.team_codes].join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={{ ...primaryButton, height: 26, width: "auto", padding: "0 10px", fontSize: 11 }} onClick={() => toggleActive(a)}>
                  {a.active ? "Turn Off" : "Turn On"}
                </button>
                <button style={{ ...primaryButton, height: 26, width: "auto", padding: "0 10px", fontSize: 11, background: "#b91c1c" }} onClick={() => remove(a)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
