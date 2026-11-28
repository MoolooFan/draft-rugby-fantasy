"use client";
// components/draftRoom/LotteryRuns.tsx
// Every draft lottery run so far, so the league sees any reruns (Ethan, 28 Nov 2026), plus a note
// if the order has changed since the last one. In the Draft Order pop-up (with Watch) and League
// Settings.
import type { LotteryData, LotteryRun } from "@/lib/draft/lottery/useLottery";
import { lotteryOrderNote, lotteryWhen, runLabel } from "@/lib/draft/lottery/view";
import { innerBox, line, muted, teal } from "@/lib/ui/theme";

export function LotteryRuns({ data, onWatch, timeZone }: { data: LotteryData; onWatch?: (run: LotteryRun) => void; timeZone?: string }) {
  const ran = data.runs.filter((r) => r.ranAt);
  const note = lotteryOrderNote(data);
  if (!ran.length) return null;
  const nameOf = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "A team that left";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ ...innerBox, padding: "2px 10px" }}>
        {ran.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: i ? `1px solid ${line}` : "none", fontSize: 12 }}>
            <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{runLabel(r)}</span>
            <span style={{ color: muted, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lotteryWhen(r.ranAt as number, timeZone)} · 1st {nameOf(r.resultTeamIds?.[0] ?? "")}
            </span>
            {onWatch ? (
              <button
                onClick={() => onWatch(r)}
                style={{ marginLeft: "auto", border: "none", background: "transparent", padding: 0, color: teal, fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline", whiteSpace: "nowrap" }}
              >
                Watch
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {note ? <div style={{ fontSize: 12, fontWeight: 600, color: "#b45309", marginTop: 6, lineHeight: 1.4 }}>{note}</div> : null}
    </div>
  );
}
