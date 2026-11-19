"use client";
// components/admin/BackupsTab.tsx — the Admin page's database backups (Ethan, 19 Nov 2026): one
// is made every night (lib/backup/run.ts); this lists them with download links and can make one now.
import React, { useCallback, useEffect, useState } from "react";
import { api, primaryButton, whiteBox } from "@/components/admin/shared";

type BackupFile = { name: string; path: string; bytes: number | null; createdAt: string | null; url: string | null };
type BackupList = { keepDays: number; hourNz: number; files: BackupFile[] };

const size = (b: number | null) => (b == null ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const day = (name: string) => {
  const d = new Date(`${name.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? name : d.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};

export function BackupsTab({ setMsg }: { setMsg: (m: string | null) => void }) {
  const [data, setData] = useState<BackupList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<BackupList>("/api/admin/backup")
      .then((j) => {
        setData(j);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the backups"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function runNow() {
    setBusy(true);
    try {
      const j = await api<{ result: { tables: number; rows: number; bytes: number } }>("/api/admin/backup", { action: "run" });
      setMsg(`Backed up ${j.result.rows.toLocaleString()} rows from ${j.result.tables} tables (${size(j.result.bytes)})`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "The backup didn't work");
    } finally {
      setBusy(false);
    }
  }

  const latest = data?.files[0] ?? null;
  const stale = latest ? Date.now() - new Date(`${latest.name.slice(0, 10)}T00:00:00`).getTime() > 2 * 24 * 3600 * 1000 : false;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
        Every night at about {data?.hourNz ?? 3}am NZ time the whole database (leagues, teams, lineups, results, history, players, stats and chat) is
        copied into a backup file. The last {data?.keepDays ?? 30} days are kept. Download one now and then to keep a copy on your computer too.
      </div>
      {error ? <div style={{ ...whiteBox, color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}
      {data ? (
        <div style={{ ...whiteBox, display: "grid", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, padding: "2px 2px 6px", color: !latest || stale ? "#b91c1c" : "#15803d" }}>
            {!latest ? "No backups yet" : stale ? `The latest backup is from ${day(latest.name)}: the nightly backup may have stopped` : `Latest: ${day(latest.name)}`}
          </div>
          {data.files.map((f) => (
            <div key={f.path} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 2px", borderTop: "1px solid rgba(0,0,0,0.07)", fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{day(f.name)}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, opacity: 0.6 }}>{size(f.bytes)}</span>
                {f.url ? (
                  <a href={f.url} style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                    Download
                  </a>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : !error ? (
        <div style={{ fontSize: 13, opacity: 0.8 }}>Loading…</div>
      ) : null}
      <button style={{ ...primaryButton, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={runNow}>
        {busy ? "Backing up…" : "Back up now"}
      </button>
    </div>
  );
}
