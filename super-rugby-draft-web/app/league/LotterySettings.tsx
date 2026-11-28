"use client";
// app/league/LotterySettings.tsx
// League Settings: the draft order lottery (Ethan, 28 Nov 2026; it used to be a card in the
// Draft Room). The commissioner sets, moves or cancels its time, or sets a rerun; it's saved
// straight away (not with the Save button). Everyone sees when it runs and every run so far.
import { useState } from "react";
import { useLottery } from "@/lib/draft/lottery/useLottery";
import { lastRun, lotteryWhen, runLabel, waitingRun } from "@/lib/draft/lottery/view";
import { LotteryRuns } from "@/components/draftRoom/LotteryRuns";
import { ink, line, muted, teal } from "@/lib/ui/theme";

/** A time as the date-and-time box wants it (this device's time zone). */
const boxValue = (ms: number) => {
  const d = new Date(ms),
    p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function LotterySettings({ leagueId, isCommissioner, draftAt }: { leagueId: string; isCommissioner: boolean; draftAt: number | null }) {
  const { data, act } = useLottery(leagueId);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!data) return <div style={{ fontSize: 12, color: muted }}>Loading…</div>;
  const waiting = waitingRun(data);
  const last = lastRun(data);

  const save = async () => {
    const at = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(at)) return setError("Pick a date and time first");
    setBusy(true);
    setSaved(null);
    const err = await act("schedule", at);
    setError(err);
    if (!err) {
      setValue("");
      setSaved("Saved. Everyone can watch it in the Draft Room.");
    }
    setBusy(false);
  };
  const cancel = async () => {
    setBusy(true);
    setSaved(null);
    setError(await act("cancel"));
    setBusy(false);
    setConfirmCancel(false);
  };

  const button = (primary: boolean): React.CSSProperties => ({
    height: 36,
    padding: "0 14px",
    borderRadius: 10,
    border: primary ? "none" : `1px solid ${line}`,
    background: primary ? teal : "#ffffff",
    color: primary ? "#ffffff" : ink,
    fontSize: 13,
    fontWeight: 700,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.6 : 1,
  });

  return (
    <div>
      <div style={{ fontSize: 12, lineHeight: 1.45 }}>
        {waiting ? (
          <>
            <b>{runLabel(waiting)}</b> runs {lotteryWhen(waiting.scheduledAt)}.
          </>
        ) : last ? (
          <>
            <b>{runLabel(last)}</b> set the order.
          </>
        ) : (
          <span style={{ color: muted }}>Not set.</span>
        )}
      </div>
      <LotteryRuns data={data} />

      {isCommissioner ? (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <input
              type="datetime-local"
              aria-label="Lottery date and time"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(null);
              }}
              max={draftAt ? boxValue(draftAt - 5 * 60_000) : undefined}
              style={{ flex: "1 1 180px", minWidth: 0, height: 36, borderRadius: 10, border: `1px solid ${line}`, padding: "0 8px", fontSize: 16, color: ink, background: "#ffffff" }}
            />
            <button style={button(true)} disabled={busy} onClick={save}>
              {waiting ? "Move" : last ? "Set rerun" : "Set"}
            </button>
            {waiting ? (
              confirmCancel ? (
                <>
                  <button style={{ ...button(false), color: "#b91c1c" }} disabled={busy} onClick={cancel}>
                    Yes, cancel it
                  </button>
                  <button style={button(false)} disabled={busy} onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <button style={button(false)} disabled={busy} onClick={() => setConfirmCancel(true)}>
                  Cancel lottery
                </button>
              )
            ) : null}
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>Saved straight away.</div>
          {error ? <div style={{ fontSize: 12, fontWeight: 600, color: "#b91c1c", marginTop: 6 }}>{error}</div> : null}
          {saved ? <div style={{ fontSize: 12, fontWeight: 600, color: teal, marginTop: 6 }}>{saved}</div> : null}
        </>
      ) : null}
    </div>
  );
}
