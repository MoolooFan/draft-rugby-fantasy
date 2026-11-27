"use client";
// components/admin/StatusTab.tsx
// Admin → Status: the Wednesday team-list / injury-list reader and its flagged names.
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useCallback, useEffect, useState } from "react";
import { api, inputStyle, primaryButton, whiteBox } from "./shared";

export type StatusFlag = { id: string; weekLabel: string; source: string; team: string; text: string; problem: string; suggestionId: string | null; suggestionName: string | null };
export type StatusImport = { id: string; real_round: number; kind: string; url: string; matched: number; flagged: number; imported_at: string };

export function StatusTab({ setMsg }: { setMsg: (m: string | null) => void }) {
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
  // first load (fetched here, set when it arrives; the buttons below use load())
  useEffect(() => {
    let live = true;
    api<{ rounds: number[]; flags: StatusFlag[]; imports: StatusImport[] }>("/api/admin/status")
      .then((r) => {
        if (!live) return;
        setRounds(r.rounds);
        setFlags(r.flags);
        setImports(r.imports);
        setLoaded(true);
      })
      .catch((e) => live && setErr(e instanceof Error ? e.message : "Couldn't load"));
    return () => {
      live = false;
    };
  }, []);

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
        <button style={primaryButton} disabled={!!busy} onClick={runImport}>{busy === "import" ? "Reading articles…" : "Read Articles Now"}</button>
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
              {f.weekLabel} · {f.team} · {f.source === "team-list" ? "Team list" : f.source === "fantasy-feed" ? "Fantasy game" : "Injury list"} · {f.text}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {f.suggestionId ? (
                <button disabled={busy === f.id} onClick={() => resolve(f, true)} style={{ ...primaryButton, height: 30, fontSize: 12 }}>
                  Use {f.suggestionName}
                </button>
              ) : null}
              <button disabled={busy === f.id} onClick={() => resolve(f, false)} style={{ ...primaryButton, height: 30, fontSize: 12, background: "rgba(15,23,42,0.35)" }}>
                {f.source === "fantasy-feed" && !f.suggestionId ? "OK" : "Ignore"}
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
              {i.kind === "fantasy-feed"
                ? `Round ${i.real_round} late changes from the fantasy game: ${i.matched} change${i.matched === 1 ? "" : "s"}, ${i.flagged} to check · `
                : `Round ${i.real_round} ${i.kind === "team-list" ? "team lists" : "injury list"}: ${i.matched} players, ${i.flagged} to check · `}
              {new Date(i.imported_at).toLocaleString("en-AU", { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

