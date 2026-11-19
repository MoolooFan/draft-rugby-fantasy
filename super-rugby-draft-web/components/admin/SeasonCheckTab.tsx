"use client";
// components/admin/SeasonCheckTab.tsx — the Admin page's season setup checklist (Ethan, 19 Nov
// 2026): fixtures, the player pool, jerseys, logos, photos and difficulty ratings for a season,
// each ticked off or with what's wrong (lib/admin/seasonCheck.ts).
import React, { useCallback, useEffect, useState } from "react";
import type { CheckItem } from "@/lib/admin/seasonCheck";
import { api, primaryButton, whiteBox } from "@/components/admin/shared";

const MARK: Record<CheckItem["status"], { sign: string; colour: string; bg: string }> = {
  ok: { sign: "✓", colour: "#15803d", bg: "#dcfce7" },
  warn: { sign: "!", colour: "#b45309", bg: "#fef3c7" },
  fail: { sign: "×", colour: "#b91c1c", bg: "#fee2e2" },
};

export function SeasonCheckTab({ season }: { season: number }) {
  const [checks, setChecks] = useState<CheckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ checks: CheckItem[] }>(`/api/admin/season-check?season=${season}`)
      .then((j) => {
        setChecks(j.checks);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't run the checks"));
  }, [season]);
  useEffect(() => {
    load();
  }, [load]);

  const fails = checks?.filter((c) => c.status === "fail").length ?? 0;
  const warns = checks?.filter((c) => c.status === "warn").length ?? 0;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
        Checks the {season} fixtures, player pool, jerseys, photos and difficulty ratings before the draft. Tap a line to see what needs fixing.
      </div>
      {error ? <div style={{ ...whiteBox, color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</div> : null}
      {!checks && !error ? <div style={{ fontSize: 13, opacity: 0.8 }}>Checking…</div> : null}
      {checks ? (
        <div style={{ ...whiteBox, display: "grid", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, padding: "2px 2px 6px" }}>
            {fails || warns
              ? `${fails ? `${fails} to fix` : ""}${fails && warns ? ", " : ""}${warns ? `${warns} to look at` : ""}`
              : `All ${checks.length} checks passed`}
          </div>
          {checks.map((c) => {
            const m = MARK[c.status];
            const canOpen = !!c.items?.length;
            return (
              <div key={c.id} style={{ borderTop: "1px solid rgba(0,0,0,0.07)" }}>
                <button
                  onClick={() => canOpen && setOpen(open === c.id ? null : c.id)}
                  style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 8, alignItems: "center", padding: "8px 2px", cursor: canOpen ? "pointer" : "default" }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: m.bg, color: m.colour, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>{m.sign}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13, fontWeight: 700 }}>{c.label}</span>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 500, opacity: 0.75 }}>{c.detail}</span>
                  </span>
                  {canOpen ? <span style={{ fontSize: 14, opacity: 0.5 }}>{open === c.id ? "▴" : "▾"}</span> : <span />}
                </button>
                {open === c.id && c.items ? (
                  <ul style={{ margin: "0 0 8px 30px", padding: 0, display: "grid", gap: 2, fontSize: 12, fontWeight: 500 }}>
                    {c.items.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      <button style={primaryButton} onClick={load}>
        Check again
      </button>
    </div>
  );
}
