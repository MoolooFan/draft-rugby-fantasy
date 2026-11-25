"use client";
// components/transactions/ReverseControl.tsx
// Commissioner only: "Reverse" under a trade, waiver claim or free agent move on the Transactions
// tab (lib/league/reverse.ts). Asks first, in the page, then says what happened or why it can't.
import React, { useState } from "react";

export type ReverseKind = "trade" | "claim" | "transfer";

export function ReverseControl({
  kind,
  explain,
  onReverse,
}: {
  kind: ReverseKind;
  /** what reversing does, e.g. "Every player goes back to the team he came from." */
  explain: string;
  /** does it; resolves to an error message, or null when it worked */
  onReverse: () => Promise<string | null>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const what = kind === "trade" ? "trade" : kind === "claim" ? "waiver claim" : "move";

  const small: React.CSSProperties = { height: 26, padding: "0 10px", borderRadius: 999, border: "none", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" };

  if (!asking) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 6 }}>
        {error ? <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(185,28,28,0.95)", flex: 1, minWidth: 0 }}>{error}</span> : null}
        <button style={{ ...small, background: "rgba(15,23,42,0.06)", color: "#0f172a" }} onClick={() => { setError(null); setAsking(true); }}>
          Reverse {what === "move" ? "" : what}
        </button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 6, borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", padding: 8, display: "grid", gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Reverse this {what}?</div>
      <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4 }}>
        {explain} Rounds already locked keep their lineups and points. The league chat is told.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={{ ...small, background: "transparent", color: "#0f172a" }} disabled={busy} onClick={() => setAsking(false)}>
          Cancel
        </button>
        <button
          style={{ ...small, background: "#b45309", color: "white", opacity: busy ? 0.6 : 1 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const err = await onReverse();
            setBusy(false);
            setAsking(false);
            setError(err);
          }}
        >
          {busy ? "Reversing…" : "Yes, Reverse It"}
        </button>
      </div>
    </div>
  );
}
