"use client";
// components/teamSelection/Pitch.tsx
// Team Selection's pitch with the starters on it, and the Substitutes & IR box under it.
// Moved out of app/team-selection/page.tsx.
import React from "react";
import { card as themeCard } from "@/lib/ui/theme";
import { pitchHeight, type SlotId } from "./helpers";

const card35: React.CSSProperties = { ...themeCard, padding: undefined };

export function Pitch({
  pitchRowCount: PITCH_ROWS,
  starterIds: STARTER_IDS,
  fieldPos: FIELD_POS,
  renderTile,
}: {
  pitchRowCount: number;
  starterIds: SlotId[];
  fieldPos: Record<SlotId, { top: string; left: string }>;
  renderTile: (slotId: SlotId) => React.ReactNode;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        height: pitchHeight(PITCH_ROWS),
        background:
          // Use your field PNG later (drop it into /public/images/field.webp)
          `linear-gradient(to bottom, rgba(5,150,105,0.92), rgba(16,185,129,0.92))`,
        backgroundImage: `url("/images/field.webp")`,
        backgroundSize: "cover",
        // shorter pitches (small squads) keep the top of the picture: the posts end
        backgroundPosition: PITCH_ROWS < 6 ? "center top" : "center",
        
        boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
      }}
    >
      {/* Light overlay so tiles pop even if image is bright */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(2,6,23,0.10)",
        }}
      />

      {STARTER_IDS.map((id) => {
        const pos = FIELD_POS[id];
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              top: pos.top,
              left: pos.left,
              transform: "translate(-50%, -50%)",
            }}
          >
            {renderTile(id)}
          </div>
        );
      })}
    </div>
  );
}

export function BenchPanel({
  benchIds: BENCH_IDS,
  irCount,
  renderTile,
  renderIr,
  fitIrName,
  irNotice,
  irDropMode,
  onCancelDrop,
  irBusy,
}: {
  benchIds: SlotId[];
  irCount: number;
  renderTile: (slotId: SlotId) => React.ReactNode;
  renderIr: (index: number) => React.ReactNode;
  /** an IR player who is fit again */
  fitIrName: string | null;
  irNotice: { kind: "info" | "error"; text: string } | null;
  irDropMode: boolean;
  onCancelDrop: () => void;
  irBusy: boolean;
}) {
  return (
    <div style={{ marginTop: 10, ...card35, padding: 12, borderRadius: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.95, marginBottom: 8 }}>
        Substitutes &amp; IR
      </div>

      {/* Bench layout: rows of three at 24/50/76 (like outside backs): the subs, then the IR spots */}
<div
style={{
  position: "relative",
  height: Math.max(1, Math.ceil((BENCH_IDS.length + irCount) / 3)) * 80 - 14,
}}
>
{[...BENCH_IDS.map((id) => ({ id, ir: -1 })), ...Array.from({ length: irCount }, (_, i) => ({ id: `ir${i + 1}`, ir: i }))].map((t, idx) => {
  const lefts = ["24%", "50%", "76%"];
  return (
    <div
      key={t.id}
      style={{
        position: "absolute",
        top: 29 + Math.floor(idx / 3) * 80,
        left: lefts[idx % 3],
        transform: "translate(-50%, -50%)",
      }}
    >
      {t.ir >= 0 ? renderIr(t.ir) : renderTile(t.id)}
    </div>
  );
})}
</div>

      {fitIrName && !irNotice ? (
        <div style={{ marginTop: 8, fontSize: 11, fontWeight: 500, color: "#FACC15", textAlign: "center" }}>
          {fitIrName} is fit again - activate him before making adds, claims or trades
        </div>
      ) : null}
      {irNotice ? (
        <div
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 500,
            textAlign: "center",
            background: irNotice.kind === "error" ? "rgba(220,38,38,0.9)" : "rgba(15,23,42,0.55)",
            color: "white",
          }}
        >
          {irNotice.text}
          {irDropMode ? (
            <button
              onClick={onCancelDrop}
              style={{ marginLeft: 8, border: "1px solid rgba(255,255,255,0.8)", background: "transparent", color: "white", borderRadius: 8, fontSize: 11, fontWeight: 600, padding: "1px 8px", cursor: "pointer" }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      ) : null}
      {irBusy ? <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8, textAlign: "center" }}>Updating…</div> : null}

    </div>
  );
}
