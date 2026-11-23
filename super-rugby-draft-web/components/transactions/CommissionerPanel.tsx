"use client";
// components/transactions/CommissionerPanel.tsx
// The very bottom of the Transactions tab, commissioner only (Ethan, 23 Nov 2026): a Commissioner
// button that opens the moves that can still be reversed (lib/league/reverse.ts: 24 hours, and
// not once the next round has kicked off). The rest of the page looks the same for everyone.
import React, { useCallback, useEffect, useState } from "react";
import { ReverseControl, type ReverseKind } from "@/components/transactions/ReverseControl";
import { listBox } from "@/components/transactions/helpers";

type Move = { kind: ReverseKind; id: string; atMs: number; untilMs: number; title: string; detail: string };

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-NZ", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

const EXPLAIN: Record<ReverseKind, string> = {
  trade: "Every player goes back to the team he came from.",
  claim: "The player added goes back to the player pool (locked for 24 hours) and the player dropped comes back.",
  transfer: "The player added goes back to the player pool (locked for 24 hours) and the player dropped comes back.",
};

export function CommissionerPanel({ leagueId, onReverse }: { leagueId: string; onReverse: (kind: ReverseKind, id: string) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/reverse?leagueId=${encodeURIComponent(leagueId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Couldn't load the moves");
      setMoves(j.moves ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the moves");
    }
  }, [leagueId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const box: React.CSSProperties = { ...listBox, marginTop: 14 };

  if (!open) {
    return (
      <button
        onClick={() => { setDone(null); setOpen(true); }}
        style={{ marginTop: 14, width: "100%", height: 40, borderRadius: 12, border: "1px solid rgba(255,255,255,0.45)", background: "rgba(15,23,42,0.35)", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
      >
        Commissioner
      </button>
    );
  }

  return (
    <div style={box}>
      <div style={{ padding: "10px 10px 4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Commissioner: Reverse a Move</div>
        <button onClick={() => setOpen(false)} style={{ border: "none", background: "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
          Close
        </button>
      </div>
      <div style={{ padding: "0 10px 8px", fontSize: 11, fontWeight: 500, opacity: 0.75, lineHeight: 1.4 }}>
        Trades, waiver claims and free agent moves can be reversed for 24 hours, and not once the next round has kicked off.
      </div>
      {done ? <div style={{ padding: "0 10px 8px", fontSize: 12, fontWeight: 700, color: "#0f766e" }}>{done}</div> : null}
      {error ? <div style={{ padding: "0 10px 8px", fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>{error}</div> : null}
      {moves == null && !error ? <div style={{ padding: "0 10px 10px", fontSize: 12, opacity: 0.7 }}>Loading…</div> : null}
      {moves && !moves.length ? <div style={{ padding: "0 10px 10px", fontSize: 12, fontWeight: 600, opacity: 0.7 }}>Nothing to reverse right now.</div> : null}
      {(moves ?? []).map((m) => (
        <div key={`${m.kind}:${m.id}`} style={{ padding: "10px 10px", borderTop: "1px solid rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{m.kind === "trade" ? `Trade: ${m.title}` : m.title}</div>
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, marginTop: 2 }}>{m.detail}</div>
          <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.65, marginTop: 2 }}>
            {when(m.atMs)} · can be reversed until {when(m.untilMs)}
          </div>
          <ReverseControl
            kind={m.kind}
            explain={EXPLAIN[m.kind]}
            onReverse={async () => {
              const err = await onReverse(m.kind, m.id);
              if (!err) {
                setDone(`Reversed: ${m.kind === "trade" ? m.title : m.detail}. The league chat has been told.`);
                await load();
              }
              return err;
            }}
          />
        </div>
      ))}
    </div>
  );
}
