"use client";
// components/admin/ScoringTab.tsx
// Admin → Scoring: the Standard and Alternate point values.
// Moved out of app/admin/page.tsx (20 Nov 2026).

import React, { useEffect, useState } from "react";
import { api, primaryButton, tabButton, whiteBox } from "./shared";
import { ScoringEditor } from "@/components/ScoringEditor";
import type { ScoringRules } from "@/lib/scoring";

export function ScoringTab({ setMsg }: { setMsg: (m: string | null) => void }) {
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
  // the system being edited, again when it's switched or reloaded (set while drawing)
  const [draftFor, setDraftFor] = useState<{ s: unknown; w: string } | null>(null);
  if (systems && (draftFor?.s !== systems || draftFor?.w !== which)) {
    setDraftFor({ s: systems, w: which });
    setDraft(systems[which]);
  }

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

